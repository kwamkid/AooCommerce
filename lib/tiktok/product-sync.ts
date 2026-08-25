/**
 * TikTok product import — ดูดสินค้าจากร้าน TikTok เข้าคลังของเรา
 *
 * เหตุผลที่ต้องมีก่อนเปิดใช้ order sync จริง: ถ้าสินค้ายังไม่มีในระบบ ออเดอร์ที่
 * เข้ามาจะสร้างสินค้าใหม่รัวๆ ตาม SKU ที่พิมพ์มา จนคลังเละ — import ก่อนแล้ว
 * `marketplace_product_links` จะ match ให้ตั้งแต่ออเดอร์ใบแรก
 *
 * โครงเดียวกับ [lib/shopee/product-sync.ts](../shopee/product-sync.ts) แต่ TikTok
 * ต่างที่ **ไม่มี batch detail** — ต้องยิง GetProduct ทีละตัว จึงคุม concurrency
 * ด้วย parallelLimit แทนการดึงทีละ 50
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  searchProducts,
  getProductDetail,
  type TikTokAccountRow,
  type TikTokProductFullDetail,
  type TikTokSkuDetail,
} from '@/lib/tiktok/api';
import {
  getOrCreateVariationTypeIds,
  upsertProductImage,
  reactivateProduct,
  tryAutoMatchBySku,
  findMarketplaceLink,
} from '@/lib/marketplace/product-helpers';
import { parallelLimit } from '@/lib/parallel';

export interface TikTokProductSyncResult {
  products_created: number;
  products_updated: number;
  products_skipped: number;
  links_created: number;
  errors: string[];
}

export interface TikTokSyncProgress {
  phase: 'collecting' | 'processing';
  current: number;
  total: number | null;
  label: string;
}

export type TikTokSyncProgressCallback = (p: TikTokSyncProgress) => void;

export interface UpsertTikTokProductOptions {
  /** copy SKU ลง product_variations.barcode (ผู้ใช้เลือกตอน import) */
  copySkuToBarcode?: boolean;
}

interface UpsertResult {
  productId: string;
  variationIds: string[];
  isNewProduct: boolean;
  variationsCreated: number;
}

// ============================================
// Helpers เฉพาะ TikTok
// ============================================

/** default_price / discount_price จาก list_price (ก่อนลด) + sale_price (ขายจริง) */
function resolveTikTokPrice(sku: TikTokSkuDetail): { defaultPrice: number; discountPrice: number } {
  const defaultPrice = sku.listPrice > 0 ? sku.listPrice : sku.price;
  const discountPrice = (sku.listPrice > 0 && sku.price < sku.listPrice) ? sku.price : 0;
  return { defaultPrice, discountPrice };
}

/** [{name:'สี',value_name:'แดง'},{name:'ขนาด',value_name:'XL'}] → 'แดง,XL' */
function skuLabel(sku: TikTokSkuDetail): string {
  return sku.salesAttributes.map((a) => a.value_name).filter(Boolean).join(',');
}

/** → { 'สี': 'แดง', 'ขนาด': 'XL' } สำหรับ product_variations.attributes */
function skuAttributes(sku: TikTokSkuDetail): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const a of sku.salesAttributes) {
    if (a.name) attrs[a.name] = a.value_name || '';
  }
  return attrs;
}

/** SKU ที่ใช้ผูกของ — ร้านไม่ตั้ง seller_sku ก็ generate จาก id ให้ไม่ชนกัน */
function resolveSku(product: TikTokProductFullDetail, sku: TikTokSkuDetail): string {
  return sku.seller_sku || `TT-${product.product_id}-${sku.sku_id}`;
}

async function upsertTikTokLink(params: {
  companyId: string;
  accountId: string;
  accountName: string;
  productId: string;
  variationId: string | null;
  product: TikTokProductFullDetail;
  sku: TikTokSkuDetail;
  externalSku: string;
  image?: string;
}): Promise<void> {
  const { product, sku } = params;
  await supabaseAdmin.from('marketplace_product_links').upsert({
    company_id: params.companyId,
    platform: 'tiktok',
    account_id: params.accountId,
    account_name: params.accountName,
    product_id: params.productId,
    variation_id: params.variationId,
    // id ของ TikTok ยาว 18-19 หลัก — เก็บเป็น string เสมอ ห้ามแปลงเป็น number
    external_item_id: product.product_id,
    external_model_id: sku.sku_id,
    external_sku: params.externalSku,
    external_item_status: product.status || null,
    platform_product_name: product.title || null,
    platform_description: product.descriptionHtml || null,
    platform_price: sku.price || null,
    platform_primary_image: params.image || product.images[0] || null,
    weight: product.weight || null,
    platform_data: {
      category_id: product.categoryId || null,
      category_name: product.categoryName || null,
      brand_name: product.brandName || null,
      sales_attributes: sku.salesAttributes,
    },
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,external_item_id,external_model_id' });
}

/**
 * อัปเดตชื่อ + รูปของ product ที่มีอยู่แล้ว — แต่ **ไม่แตะของที่ถูกแก้ในระบบเรา**
 * (`source` = 'tiktok_edited' / 'manual') · description เติมเฉพาะตอนที่ยังว่าง
 */
async function maybeUpdateProductMeta(
  companyId: string,
  productId: string,
  product: TikTokProductFullDetail
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('products')
    .select('source, description')
    .eq('id', productId)
    .single();

  if (existing?.source === 'tiktok_edited' || existing?.source === 'manual') return;

  const updates: Record<string, unknown> = {
    name: product.title,
    image: product.images[0] || null,
    updated_at: new Date().toISOString(),
  };
  if (!existing?.description && product.description) {
    updates.description = product.description;
  }
  await supabaseAdmin.from('products').update(updates).eq('id', productId);

  for (let i = 0; i < product.images.length; i++) {
    await upsertProductImage(companyId, productId, null, product.images[i], i, 'tiktok');
  }
}

/** สร้าง variation หนึ่งแถว + รูปของมัน คืน id */
async function createVariationRow(
  companyId: string,
  parentProductId: string,
  product: TikTokProductFullDetail,
  sku: TikTokSkuDetail,
  externalSku: string,
  copySkuToBarcode?: boolean
): Promise<string | null> {
  const { defaultPrice, discountPrice } = resolveTikTokPrice(sku);
  const label = skuLabel(sku) || externalSku;

  const { data, error } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: parentProductId,
      variation_label: label,
      sku: externalSku,
      barcode: (copySkuToBarcode && externalSku) ? externalSku : null,
      attributes: skuAttributes(sku),
      default_price: defaultPrice,
      discount_price: discountPrice,
      stock: sku.stock ?? 0,
      min_stock: 0,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error(`[TikTok Product] Failed to create variation ${externalSku}:`, error);
    return null;
  }
  if (sku.imageUrl) {
    await upsertProductImage(companyId, null, data.id, sku.imageUrl, 0, 'tiktok');
  }
  return data.id;
}

// ============================================
// Upsert หลัก
// ============================================

/**
 * แปลงสินค้า TikTok หนึ่งตัวเป็น product + variations + marketplace links
 *
 * ลำดับการจับคู่ของเดิม (เหมือน Shopee เป๊ะ เพื่อให้พฤติกรรมทั้งระบบเท่ากัน):
 *   1) marketplace_product_links ของ account นี้ (external_item_id)
 *   2) products.code = seller_sku ของสินค้า หรือ `TT-{product_id}`
 *   3) แถวที่ถูก soft-delete ไว้ → ปลุกคืน
 *   4) ไม่เจอเลย → สร้างใหม่
 */
export async function upsertTikTokProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  product: TikTokProductFullDetail,
  options: UpsertTikTokProductOptions = {}
): Promise<UpsertResult> {
  const primaryImage = product.images[0] || null;
  // sku ตัวแรกที่ร้านตั้งเอง ใช้เป็น code ของ parent ให้ตรงกับที่คนในร้านคุ้น
  const parentCode = product.skus.find((s) => s.seller_sku)?.seller_sku || `TT-${product.product_id}`;

  let parentProductId: string | null = null;
  let isNewProduct = false;

  // 1) link เดิมของ account นี้
  const { data: anyLink } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id')
    .eq('account_id', accountId)
    .eq('external_item_id', product.product_id)
    .limit(1)
    .maybeSingle();
  if (anyLink?.product_id) parentProductId = anyLink.product_id;

  // 2) code ตรงกัน (active)
  if (!parentProductId) {
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', parentCode)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      parentProductId = existing.id;
      await maybeUpdateProductMeta(companyId, existing.id, product);
    }
  }

  // 3) ปลุกของที่ถูก soft-delete
  if (!parentProductId) {
    const { data: inactive } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', parentCode)
      .eq('is_active', false)
      .limit(1)
      .maybeSingle();
    if (inactive?.id) {
      await reactivateProduct(inactive.id, 'tiktok');
      await maybeUpdateProductMeta(companyId, inactive.id, product);
      parentProductId = inactive.id;
    }
  }

  // 4) สร้างใหม่
  if (!parentProductId) {
    const isVariation = product.hasVariation;
    const firstSku = product.skus[0];
    const variationTypeIds = isVariation
      ? await getOrCreateVariationTypeIds(companyId, product.salesAttributeNames)
      : [];

    const { data: created, error } = await supabaseAdmin
      .from('products')
      .insert({
        company_id: companyId,
        code: parentCode,
        name: product.title,
        // สินค้าเดี่ยว: variation_label ต้องไม่ null (กติกาแยก simple/variable ของระบบ)
        variation_label: isVariation ? null : (firstSku ? resolveSku(product, firstSku) : product.title),
        image: primaryImage,
        source: 'tiktok',
        selected_variation_types: isVariation ? variationTypeIds : undefined,
        description: product.description || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (error || !created) {
      throw new Error(`Failed to create product: ${error?.message}`);
    }
    parentProductId = created.id;
    isNewProduct = true;

    for (let i = 0; i < product.images.length; i++) {
      await upsertProductImage(companyId, parentProductId, null, product.images[i], i, 'tiktok');
    }
  }

  // ทุก branch ข้างบน set parentProductId หรือไม่ก็ throw — กันไว้ให้ชัด
  if (!parentProductId) {
    throw new Error(`Failed to resolve product for TikTok product ${product.product_id}`);
  }
  const parentId: string = parentProductId;

  // สร้าง / ผูก ทุก SKU ของสินค้านี้ (ไม่ใช่แค่ตัวที่สั่ง — กันคลังเพี้ยนตอนออเดอร์เข้า)
  const variationIds: string[] = [];
  let variationsCreated = 0;

  for (const sku of product.skus) {
    const externalSku = resolveSku(product, sku);
    const existingLink = await findMarketplaceLink(accountId, product.product_id, sku.sku_id);

    let variationId: string | null = existingLink?.variation_id || null;

    if (!variationId) {
      const matched = await tryAutoMatchBySku(companyId, externalSku, 'tiktok');
      if (matched) {
        variationId = matched.variation_id;
      } else {
        // variation ที่เพิ่งถูกสร้างใต้ parent เดียวกันในรอบนี้
        const { data: sibling } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .eq('company_id', companyId)
          .eq('product_id', parentId)
          .eq('sku', externalSku)
          .limit(1)
          .maybeSingle();
        if (sibling?.id) {
          variationId = sibling.id;
        } else {
          const createdId = await createVariationRow(companyId, parentId, product, sku, externalSku, options.copySkuToBarcode);
          if (createdId) {
            variationId = createdId;
            variationsCreated++;
          }
        }
      }
    }

    if (variationId) {
      variationIds.push(variationId);
      await upsertTikTokLink({
        companyId,
        accountId,
        accountName,
        productId: parentId,
        variationId,
        product,
        sku,
        externalSku,
        image: sku.imageUrl || primaryImage || undefined,
      });
    }
  }

  return { productId: parentId, variationIds, isNewProduct, variationsCreated };
}

// ============================================
// Import ทั้งร้าน
// ============================================

export async function syncProductsFromTikTok(
  account: TikTokAccountRow,
  onProgress?: TikTokSyncProgressCallback,
  options: UpsertTikTokProductOptions = {}
): Promise<TikTokProductSyncResult> {
  const companyId = account.company_id;
  const accountName = account.shop_name || `Shop ${account.shop_id}`;
  const result: TikTokProductSyncResult = {
    products_created: 0,
    products_updated: 0,
    products_skipped: 0,
    links_created: 0,
    errors: [],
  };

  try {
    const creds = await ensureValidToken(account);

    // Step 1: ไล่เก็บ product id ทั้งร้าน (page_token ไม่ใช่ offset)
    const productIds: string[] = [];
    let pageToken: string | undefined;
    let guard = 0;

    do {
      const page = await searchProducts(creds, { pageSize: 100, pageToken });
      productIds.push(...page.products.map((p) => p.id).filter(Boolean));
      pageToken = page.nextPageToken;
      onProgress?.({
        phase: 'collecting',
        current: productIds.length,
        total: page.totalCount ?? null,
        label: `กำลังดึงรายการสินค้า... (${productIds.length} รายการ)`,
      });
      guard++;
    } while (pageToken && guard < 200);

    console.log(`[TikTok Product] Found ${productIds.length} products in shop ${account.shop_id}`);

    // Step 2: ดึงรายละเอียดทีละตัว (TikTok ไม่มี batch detail) — คุม concurrency ที่ 3
    let processed = 0;
    const total = productIds.length;

    await parallelLimit(productIds, async (productId) => {
      try {
        const detail = await getProductDetail(creds, productId);

        const { count: linksBefore } = await supabaseAdmin
          .from('marketplace_product_links')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .eq('external_item_id', productId);

        const res = await upsertTikTokProduct(companyId, account.id, accountName, detail, options);

        if (res.isNewProduct) result.products_created++;
        else result.products_updated++;

        const { count: linksAfter } = await supabaseAdmin
          .from('marketplace_product_links')
          .select('id', { count: 'exact', head: true })
          .eq('account_id', account.id)
          .eq('external_item_id', productId);

        result.links_created += Math.max(0, (linksAfter || 0) - (linksBefore || 0));
      } catch (e) {
        const msg = `Product ${productId}: ${e instanceof Error ? e.message : 'Unknown error'}`;
        result.errors.push(msg);
        result.products_skipped++;
        console.error(`[TikTok Product] ${msg}`);
      }
      processed++;
      onProgress?.({
        phase: 'processing',
        current: processed,
        total,
        label: `กำลังประมวลผลสินค้า ${processed}/${total}`,
      });
    }, 3);

    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ last_product_sync_at: new Date().toISOString() })
      .eq('id', account.id);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
  }

  console.log(
    `[TikTok Product] Done: created=${result.products_created} updated=${result.products_updated} ` +
    `skipped=${result.products_skipped} links=${result.links_created} errors=${result.errors.length}`
  );
  return result;
}
