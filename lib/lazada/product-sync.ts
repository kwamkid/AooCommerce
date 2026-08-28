/**
 * Lazada product import — ดูดสินค้าทั้งร้านเข้าคลังของเรา
 *
 * เหตุผลที่ต้องมีก่อนเปิดรับออเดอร์จริง (เหมือน Shopee/TikTok): ถ้าสินค้ายังไม่มี
 * ในระบบ ออเดอร์ที่เข้ามาจะสร้างสินค้าใหม่ทีละชิ้นตาม SKU ที่ได้รับ — ได้สินค้า
 * เดี่ยวกระจัดกระจายแทนสินค้าที่มีตัวเลือกครบ แล้วคลังเละ
 *
 * ต่างจาก TikTok ตรงที่ Lazada คืน **ทุกอย่างในคอลเดียว** (`/products/get`):
 * ชื่อ · description HTML · รูป product · ทุก SKU พร้อม saleProp/ราคา/สต็อก/รูป
 * → ไม่ต้องยิง detail รายตัว แค่ page ทีละ 50
 *
 * โครง upsert ตาม [lib/tiktok/product-sync.ts](../tiktok/product-sync.ts) เป๊ะ
 * เพื่อให้พฤติกรรมทุก platform เท่ากัน
 */
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getLazadaProducts,
  parseLazadaImages,
  type LazadaAccountRow,
  type LazadaProduct,
  type LazadaSku,
} from '@/lib/lazada/api';
import {
  getOrCreateVariationTypeIds,
  upsertProductImage,
  reactivateProduct,
  tryAutoMatchBySku,
  findMarketplaceLink,
} from '@/lib/marketplace/product-helpers';

export interface LazadaProductSyncResult {
  products_created: number;
  products_updated: number;
  products_skipped: number;
  links_created: number;
  errors: string[];
}

export interface LazadaSyncProgress {
  phase: 'collecting' | 'processing';
  current: number;
  total: number | null;
  label: string;
}

export type LazadaSyncProgressCallback = (p: LazadaSyncProgress) => void;

export interface UpsertLazadaProductOptions {
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
// Helpers เฉพาะ Lazada
// ============================================

function attrString(product: LazadaProduct, key: string): string {
  const v = product.attributes?.[key];
  return typeof v === 'string' ? v : '';
}

/** ชื่อสินค้า — ไทยก่อน (หน้าร้านไทย) แล้วค่อย fallback อังกฤษ */
function productName(product: LazadaProduct): string {
  return attrString(product, 'name') || attrString(product, 'name_en') || `Lazada ${product.item_id}`;
}

/** Lazada ไม่มีสนาม video ตายตัว — เก็บเท่าที่เจอไว้ใน platform_data ไม่ให้ข้อมูลหาย */
function videoUrl(product: LazadaProduct): string | null {
  for (const key of ['video', 'video_url', 'videoUrl', 'main_video']) {
    const v = product.attributes?.[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (Array.isArray(v) && typeof v[0] === 'string' && v[0].trim()) return v[0].trim();
  }
  return null;
}

/** รูปของ SKU — Lazada ยัด "" มาเต็ม array เวลาไม่มีรูป */
function skuImages(sku: LazadaSku): string[] {
  return (sku.Images || []).filter((u): u is string => !!u && typeof u === 'string');
}

/** สินค้ามีตัวเลือกจริงไหม — ดูจาก saleProp ไม่ใช่จำนวน SKU (บาง shop มี SKU เดียวแต่มี saleProp) */
function hasVariation(product: LazadaProduct): boolean {
  const skus = product.skus || [];
  if (skus.length > 1) return true;
  return Object.keys(skus[0]?.saleProp || {}).length > 0;
}

/** ชื่อประเภทตัวเลือกทั้งหมดของสินค้านี้ เช่น ['color_family'] */
function salePropNames(product: LazadaProduct): string[] {
  const names: string[] = [];
  for (const sku of product.skus || []) {
    for (const key of Object.keys(sku.saleProp || {})) {
      if (!names.includes(key)) names.push(key);
    }
  }
  return names;
}

/** { color_family: 'Pink' } → 'Pink' */
function skuLabel(sku: LazadaSku): string {
  return Object.values(sku.saleProp || {}).filter(Boolean).join(',');
}

/** SKU ที่ใช้ผูกของ — ร้านไม่ตั้ง SellerSku ก็ generate จาก id ให้ไม่ชนกัน */
function resolveSku(product: LazadaProduct, sku: LazadaSku): string {
  return (sku.SellerSku || '').trim() || `LZ-${product.item_id}-${sku.SkuId}`;
}

/**
 * default_price = ราคาตั้ง · discount_price = ราคาโปร (เฉพาะเมื่อถูกกว่าจริง)
 * กฎทั้งระบบ: discount ต้อง < default ไม่งั้นถือว่าไม่มีส่วนลด
 */
function resolveLazadaPrice(sku: LazadaSku): { defaultPrice: number; discountPrice: number } {
  const defaultPrice = Number(sku.price || 0);
  const special = Number(sku.special_price || 0);
  const discountPrice = special > 0 && special < defaultPrice ? special : 0;
  return { defaultPrice, discountPrice };
}

async function upsertLazadaLink(params: {
  companyId: string;
  accountId: string;
  accountName: string;
  productId: string;
  variationId: string | null;
  product: LazadaProduct;
  sku: LazadaSku;
  externalSku: string;
  image?: string;
}): Promise<void> {
  const { product, sku } = params;
  await supabaseAdmin.from('marketplace_product_links').upsert({
    company_id: params.companyId,
    platform: 'lazada',
    account_id: params.accountId,
    account_name: params.accountName,
    product_id: params.productId,
    variation_id: params.variationId,
    external_item_id: String(product.item_id),
    external_model_id: String(sku.SkuId),
    external_sku: params.externalSku,
    external_item_status: product.status || null,
    platform_product_name: productName(product),
    platform_description: attrString(product, 'description') || null,
    platform_price: Number(sku.price || 0) || null,
    platform_primary_image: params.image || null,
    weight: Number(sku.package_weight || 0) || null,
    // property ของหมวดหมู่มีเป็นสิบตัวและต่างกันทุกหมวด — เก็บทั้งก้อนไว้ ไม่ตัดทิ้ง
    platform_data: {
      category_id: product.primary_category ?? null,
      brand_name: attrString(product, 'brand') || null,
      name_en: attrString(product, 'name_en') || null,
      short_description: attrString(product, 'short_description') || null,
      video_url: videoUrl(product),
      sale_prop: sku.saleProp || {},
      shop_sku: sku.ShopSku || null,
      product_url: sku.Url || null,
      attributes: product.attributes || {},
    },
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,external_item_id,external_model_id' });
}

/**
 * อัปเดตชื่อ + รูปของ product ที่มีอยู่แล้ว — แต่ **ไม่แตะของที่ถูกแก้ในระบบเรา**
 * (`source` = 'lazada_edited' / 'manual') · description เติมเฉพาะตอนที่ยังว่าง
 */
async function maybeUpdateProductMeta(
  companyId: string,
  productId: string,
  product: LazadaProduct
): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('products')
    .select('source, description')
    .eq('id', productId)
    .single();

  if (existing?.source === 'lazada_edited' || existing?.source === 'manual') return;

  const images = parseLazadaImages(product.images);
  const updates: Record<string, unknown> = {
    name: productName(product),
    image: images[0] || null,
    updated_at: new Date().toISOString(),
  };
  const description = attrString(product, 'description');
  if (!existing?.description && description) updates.description = description;

  await supabaseAdmin.from('products').update(updates).eq('id', productId);

  for (let i = 0; i < images.length; i++) {
    await upsertProductImage(companyId, productId, null, images[i], i, 'lazada');
  }
}

/** สร้าง variation หนึ่งแถว + รูปของมัน คืน id */
async function createVariationRow(
  companyId: string,
  parentProductId: string,
  sku: LazadaSku,
  externalSku: string,
  copySkuToBarcode?: boolean
): Promise<string | null> {
  const { defaultPrice, discountPrice } = resolveLazadaPrice(sku);
  const label = skuLabel(sku) || externalSku;

  const { data, error } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: parentProductId,
      variation_label: label,
      sku: externalSku,
      barcode: (copySkuToBarcode && externalSku) ? externalSku : null,
      attributes: sku.saleProp || {},
      default_price: defaultPrice,
      discount_price: discountPrice,
      stock: Number(sku.quantity ?? sku.Available ?? 0),
      min_stock: 0,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error(`[Lazada Product] Failed to create variation ${externalSku}:`, error);
    return null;
  }

  const images = skuImages(sku);
  for (let i = 0; i < images.length; i++) {
    await upsertProductImage(companyId, null, data.id, images[i], i, 'lazada');
  }
  return data.id;
}

// ============================================
// Upsert หลัก
// ============================================

/**
 * แปลงสินค้า Lazada หนึ่งตัวเป็น product + variations (ครบทุก SKU) + links
 *
 * ลำดับการจับคู่ของเดิม (เหมือน Shopee/TikTok เป๊ะ):
 *   1) marketplace_product_links ของ account นี้ (external_item_id)
 *   2) products.code = SellerSku ตัวแรก หรือ `LZ-{item_id}`
 *   3) แถวที่ถูก soft-delete ไว้ → ปลุกคืน
 *   4) ไม่เจอเลย → สร้างใหม่
 */
export async function upsertLazadaProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  product: LazadaProduct,
  options: UpsertLazadaProductOptions = {}
): Promise<UpsertResult> {
  const skus = product.skus || [];
  if (skus.length === 0) {
    throw new Error(`Lazada product ${product.item_id} has no SKU`);
  }

  const images = parseLazadaImages(product.images);
  const primaryImage = images[0] || null;
  const parentCode = (skus.find((s) => s.SellerSku)?.SellerSku || '').trim() || `LZ-${product.item_id}`;

  let parentProductId: string | null = null;
  let isNewProduct = false;

  // 1) link เดิมของ account นี้
  const { data: anyLink } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id')
    .eq('account_id', accountId)
    .eq('external_item_id', String(product.item_id))
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
      await reactivateProduct(inactive.id, 'lazada');
      await maybeUpdateProductMeta(companyId, inactive.id, product);
      parentProductId = inactive.id;
    }
  }

  // 4) สร้างใหม่
  if (!parentProductId) {
    const isVariation = hasVariation(product);
    const variationTypeIds = isVariation
      ? await getOrCreateVariationTypeIds(companyId, salePropNames(product))
      : [];

    const { data: created, error } = await supabaseAdmin
      .from('products')
      .insert({
        company_id: companyId,
        code: parentCode,
        name: productName(product),
        // สินค้าเดี่ยว: variation_label ต้องไม่ null (กติกาแยก simple/variable ของระบบ)
        variation_label: isVariation ? null : resolveSku(product, skus[0]),
        image: primaryImage,
        source: 'lazada',
        selected_variation_types: isVariation ? variationTypeIds : undefined,
        description: attrString(product, 'description') || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (error || !created) {
      throw new Error(`Failed to create product: ${error?.message}`);
    }
    parentProductId = created.id;
    isNewProduct = true;

    for (let i = 0; i < images.length; i++) {
      await upsertProductImage(companyId, parentProductId, null, images[i], i, 'lazada');
    }
  }

  // ทุก branch ข้างบน set parentProductId หรือไม่ก็ throw — กันไว้ให้ชัด
  if (!parentProductId) {
    throw new Error(`Failed to resolve product for Lazada item ${product.item_id}`);
  }
  const parentId: string = parentProductId;

  // ผูก/สร้าง **ทุก SKU** ของสินค้านี้ — ไม่ใช่แค่ตัวที่เคยสั่ง (กันคลังเพี้ยน)
  const variationIds: string[] = [];
  let variationsCreated = 0;

  for (const sku of skus) {
    const externalSku = resolveSku(product, sku);
    const existingLink = await findMarketplaceLink(accountId, String(product.item_id), String(sku.SkuId));

    let variationId: string | null = existingLink?.variation_id || null;

    if (!variationId) {
      const matched = await tryAutoMatchBySku(companyId, externalSku, 'lazada');
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
          const createdId = await createVariationRow(companyId, parentId, sku, externalSku, options.copySkuToBarcode);
          if (createdId) {
            variationId = createdId;
            variationsCreated++;
          }
        }
      }
    }

    if (variationId) {
      variationIds.push(variationId);
      await upsertLazadaLink({
        companyId,
        accountId,
        accountName,
        productId: parentId,
        variationId,
        product,
        sku,
        externalSku,
        image: skuImages(sku)[0] || primaryImage || undefined,
      });
    }
  }

  return { productId: parentId, variationIds, isNewProduct, variationsCreated };
}

// ============================================
// Import ทั้งร้าน
// ============================================

export async function syncProductsFromLazada(
  account: LazadaAccountRow,
  onProgress?: LazadaSyncProgressCallback,
  options: UpsertLazadaProductOptions = {}
): Promise<LazadaProductSyncResult> {
  const companyId = account.company_id;
  const accountName = account.shop_name || `Shop ${account.shop_id}`;
  const result: LazadaProductSyncResult = {
    products_created: 0,
    products_updated: 0,
    products_skipped: 0,
    links_created: 0,
    errors: [],
  };

  try {
    const creds = await ensureValidToken(account);

    let offset = 0;
    let processed = 0;
    let total: number | null = null;
    // offset ของ Lazada ตันที่ 10000 (เอกสารระบุเอง) — 50/หน้า = 200 หน้า
    const MAX_OFFSET = 10000;

    for (;;) {
      const page = await getLazadaProducts(creds, { offset, limit: 50, filter: 'all' });
      if (page.error) {
        // ดึงหน้าไหนไม่ได้ = ข้อมูลไม่ครบ ต้องบอก ไม่ใช่จบเงียบว่าสำเร็จ
        result.errors.push(`Product list error (offset ${offset}): ${page.error}`);
        break;
      }
      if (total === null) total = page.total || null;
      if (page.products.length === 0) break;

      onProgress?.({
        phase: 'collecting',
        current: processed,
        total,
        label: `กำลังดึงรายการสินค้า... (${processed}/${total ?? '?'})`,
      });

      for (const product of page.products) {
        try {
          const { count: linksBefore } = await supabaseAdmin
            .from('marketplace_product_links')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', account.id)
            .eq('external_item_id', String(product.item_id));

          const res = await upsertLazadaProduct(companyId, account.id, accountName, product, options);

          if (res.isNewProduct) result.products_created++;
          else result.products_updated++;

          const { count: linksAfter } = await supabaseAdmin
            .from('marketplace_product_links')
            .select('id', { count: 'exact', head: true })
            .eq('account_id', account.id)
            .eq('external_item_id', String(product.item_id));

          result.links_created += Math.max(0, (linksAfter || 0) - (linksBefore || 0));
        } catch (e) {
          const msg = `Product ${product.item_id}: ${e instanceof Error ? e.message : 'Unknown error'}`;
          result.errors.push(msg);
          result.products_skipped++;
          console.error(`[Lazada Product] ${msg}`);
        }
        processed++;
        onProgress?.({
          phase: 'processing',
          current: processed,
          total,
          label: `กำลังประมวลผลสินค้า ${processed}/${total ?? '?'}`,
        });
      }

      offset += page.products.length;
      if (total !== null && processed >= total) break;
      if (offset >= MAX_OFFSET) {
        result.errors.push(`หยุดที่ ${MAX_OFFSET} รายการ — Lazada จำกัด offset สูงสุดเท่านี้`);
        break;
      }
    }

    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ last_product_sync_at: new Date().toISOString() })
      .eq('id', account.id);
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
  }

  console.log(
    `[Lazada Product] Done: created=${result.products_created} updated=${result.products_updated} ` +
    `skipped=${result.products_skipped} links=${result.links_created} errors=${result.errors.length}`
  );
  return result;
}
