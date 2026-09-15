// ชั้นกลางของ "ดูดสินค้าจากร้าน marketplace เข้าคลังของเรา" (server-only)
//
// ทำไมต้องมีไฟล์นี้: เดิมมี 3 ชุด (`lib/{shopee,lazada,tiktok}/product-sync.ts`) ที่
// copy กันมาแล้วเพี้ยนกันทีละนิด — Shopee เลือกทีละตัว/ผูกกับของเดิมได้แต่ Lazada/TikTok
// ทำได้แค่ "ทั้งร้านรอบเดียว" · Lazada/TikTok เขียน `product_variations.stock` (ค่าเก่า
// ยุคก่อนมีคลัง) ส่วน Shopee เขียน `inventory` · มี resume แค่ Lazada
//
// ⇒ ตรรกะที่ไม่ขึ้นกับ platform อยู่ที่นี่ที่เดียว · "ยิง API ของเจ้านั้นยังไง" อยู่ใน
//   `lib/<platform>/product-import-adapter.ts` ที่ลงทะเบียนไว้ที่ `product-import-adapter.ts`
//   **ห้าม `switch (platform)` ในไฟล์นี้** — เพิ่ม platform ใหม่ต้องไม่ต้องแก้ไฟล์นี้เลย
//
// ⛔ สต็อก: **ห้ามเขียน `product_variations.stock` หรือ `inventory` ตรง ๆ** —
//    ยอดจากร้านเข้าคลังผ่าน `adjustStock` แบบ fill_blank (กติกาเดียวกับ `applyPulledStock`
//    ของ `stock-push.ts`: เติมเฉพาะช่องที่ของเราเป็น 0 และร้าน > 0 ไม่ทับของที่พนักงานตั้งไว้)
//    และหลัง "ผูกกับสินค้าที่มีอยู่" ต้อง `syncStockNow()` เพื่อส่งยอดของเราขึ้นร้านทันที

import { supabaseAdmin } from '@/lib/supabase-admin';
import { resolveAccountWarehouseId } from '@/lib/marketplace/warehouse';
import { applyPulledStock, emptyPullResult, stockGateError, syncStockNow } from '@/lib/marketplace/stock-push';
import { stockSyncReferenceType } from '@/lib/marketplace/stock-adapter';
import {
  getOrCreateVariationTypeIds,
  upsertProductImage,
  reactivateProduct,
  tryAutoMatchBySku,
  findMarketplaceLink,
  type MarketplacePlatform,
} from '@/lib/marketplace/product-helpers';
import {
  getProductImportAdapter,
  importPlatformLabel,
  type MarketplaceImportItem,
  type MarketplaceImportModel,
  type ProductImportAccount,
  type ProductImportAdapter,
} from '@/lib/marketplace/product-import-adapter';

export type { ProductImportAccount } from '@/lib/marketplace/product-import-adapter';
export { getProductImportAdapter, importPlatformLabel } from '@/lib/marketplace/product-import-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

/** ตัวเลือกหนึ่งตัวเท่าที่หน้าเลือกสินค้าต้องรู้ (ไม่ส่ง `raw` ออกไปให้ client — ก้อนใหญ่มาก) */
export interface PreviewModel {
  external_model_id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
}

export interface PreviewItem {
  external_item_id: string;
  name: string;
  sku: string;
  image: string | null;
  price: number;
  status: string | null;
  has_variation: boolean;
  model_count: number;
  total_stock: number;
  models: PreviewModel[];
  /** ผูกกับสินค้าในระบบแล้วหรือยัง (นับเฉพาะ product ที่ยัง active) */
  linked_product: { product_id: string; name: string } | null;
  /** SKU ตรงกับสินค้าที่มีอยู่ → กด "สร้างใหม่" ก็จะไปผูกกับตัวนี้ให้เอง ไม่สร้างซ้ำ */
  auto_match: { product_id: string; variation_id: string; name: string } | null;
}

export interface PreviewResult {
  items: PreviewItem[];
  next_cursor?: string;
  total?: number;
}

export interface ImportRequestItem {
  external_item_id: string;
  action: 'create' | 'link';
  /** ต้องมีเมื่อ action = 'link' */
  target_product_id?: string;
}

export interface ImportOptions {
  copySkuToBarcode?: boolean;
}

export interface ImportProgress {
  done: number;
  total?: number;
  item_name: string;
  success: boolean;
  error?: string;
}

export type ImportProgressCallback = (p: ImportProgress) => void | Promise<void>;

export interface ImportResult {
  created: number;
  updated: number;
  linked: number;
  skipped: number;
  errors: string[];
  /** เหลืออีก — ยิงรอบถัดไปด้วย cursor นี้ (โหมดทั้งร้านเท่านั้น) */
  next_cursor?: string;
}

function emptyResult(): ImportResult {
  return { created: 0, updated: 0, linked: 0, skipped: 0, errors: [] };
}

interface ImportContext {
  account: ProductImportAccount;
  adapter: ProductImportAdapter;
  platform: MarketplacePlatform;
  companyId: string;
  accountId: string;
  accountName: string;
}

function buildContext(account: ProductImportAccount): ImportContext {
  const adapter = getProductImportAdapter(account.platform);
  if (!adapter) {
    throw new Error(`ยังไม่รองรับนำเข้าสินค้าจาก ${importPlatformLabel(account.platform)}`);
  }
  return {
    account,
    adapter,
    platform: account.platform as MarketplacePlatform,
    companyId: account.company_id,
    accountId: account.id,
    accountName: account.shop_name || `Shop ${account.shop_id ?? ''}`.trim(),
  };
}

// ── ชื่อรหัส / ราคา ───────────────────────────────────────────────────────────

/** SKU ที่ใช้ผูกของจริง — ร้านไม่ตั้งก็ generate จาก id ให้ไม่ชนกัน */
function resolveModelSku(adapter: ProductImportAdapter, item: MarketplaceImportItem, model: MarketplaceImportModel): string {
  return (model.sku || '').trim() || `${adapter.codePrefix}${item.external_item_id}-${model.external_model_id}`;
}

/** รหัสสินค้าแม่ — SKU ที่ร้านตั้ง ไม่มีก็ generate */
function resolveParentCode(adapter: ProductImportAdapter, item: MarketplaceImportItem): string {
  return (item.sku || '').trim() || `${adapter.codePrefix}${item.external_item_id}`;
}

/**
 * default_price = ราคาตั้ง · discount_price = ราคาโปร (เฉพาะเมื่อถูกกว่าจริง)
 * กฎทั้งระบบ: discount ต้อง < default ไม่งั้นถือว่าไม่มีส่วนลด
 */
function resolvePrices(model: MarketplaceImportModel): { defaultPrice: number; discountPrice: number } {
  const list = model.original_price || 0;
  const sale = model.price || 0;
  const defaultPrice = list > 0 ? list : sale;
  const discountPrice = list > 0 && sale > 0 && sale < list ? sale : 0;
  return { defaultPrice, discountPrice };
}

// ── product / variation ──────────────────────────────────────────────────────

/**
 * อัปเดตชื่อ + รูปของ product ที่มีอยู่แล้ว — แต่ **ไม่แตะของที่ถูกแก้ในระบบเรา**
 * (`source` = `<platform>_edited` / 'manual') · description เติมเฉพาะตอนที่ยังว่าง
 */
async function maybeUpdateProductMeta(ctx: ImportContext, productId: string, item: MarketplaceImportItem): Promise<void> {
  const { data: existing } = await supabaseAdmin
    .from('products')
    .select('source, description')
    .eq('id', productId)
    .single();

  if (existing?.source === `${ctx.platform}_edited` || existing?.source === 'manual') return;

  const updates: Record<string, unknown> = {
    name: item.name,
    image: item.images[0] || null,
    updated_at: new Date().toISOString(),
  };
  if (!existing?.description && item.description) updates.description = item.description;

  await supabaseAdmin.from('products').update(updates).eq('id', productId);

  for (let i = 0; i < item.images.length; i++) {
    await upsertProductImage(ctx.companyId, productId, null, item.images[i], i, ctx.platform);
  }
}

/** สร้าง variation หนึ่งแถว + รูปของมัน คืน id (สต็อกไม่แตะตรงนี้ — ไปผ่าน adjustStock) */
async function createVariationRow(
  ctx: ImportContext,
  parentProductId: string,
  model: MarketplaceImportModel,
  modelSku: string,
  copySkuToBarcode?: boolean,
): Promise<string | null> {
  const { defaultPrice, discountPrice } = resolvePrices(model);

  const { data, error } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: ctx.companyId,
      product_id: parentProductId,
      variation_label: model.name || modelSku,
      sku: modelSku,
      barcode: copySkuToBarcode && modelSku ? modelSku : null,
      attributes: model.attributes || {},
      default_price: defaultPrice,
      discount_price: discountPrice,
      // ⛔ ยอดจริงอยู่ที่ `inventory` เท่านั้น — คอลัมน์นี้เป็นค่าเก่ายุคก่อนมีคลัง
      stock: 0,
      min_stock: 0,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error(`[Product Import] สร้างตัวเลือก ${modelSku} ไม่สำเร็จ:`, error);
    return null;
  }
  if (model.image) {
    await upsertProductImage(ctx.companyId, null, data.id, model.image, 0, ctx.platform);
  }
  return data.id;
}

/**
 * แถวใน `marketplace_product_links` — คอลัมน์กลางทุก platform เหมือนกัน
 * ส่วนที่ต่างกัน (ราคา/หมวด/attribute ของเจ้านั้น) มาจาก `adapter.linkPayload`
 */
async function upsertLink(
  ctx: ImportContext,
  item: MarketplaceImportItem,
  model: MarketplaceImportModel,
  productId: string,
  variationId: string | null,
  modelSku: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin.from('marketplace_product_links').upsert({
    company_id: ctx.companyId,
    platform: ctx.platform,
    account_id: ctx.accountId,
    account_name: ctx.accountName,
    product_id: productId,
    variation_id: variationId,
    // id ของ TikTok/Lazada ยาว 18-19 หลัก — เก็บเป็น string เสมอ ห้ามแปลงเป็น number
    external_item_id: item.external_item_id,
    external_model_id: model.external_model_id,
    external_sku: modelSku,
    external_item_status: item.status || null,
    platform_product_name: item.name || null,
    platform_primary_image: model.image || item.images[0] || null,
    sync_enabled: true,
    last_synced_at: now,
    updated_at: now,
    ...ctx.adapter.linkPayload(item, model),
  }, { onConflict: 'account_id,external_item_id,external_model_id' });
}

/**
 * สร้าง/อัปเดตสินค้าในระบบจากสินค้าบนร้านหนึ่งตัว (action = 'create')
 *
 * ลำดับการจับคู่ (เดียวกันทุก platform):
 *   1) `marketplace_product_links` ของร้านนี้ (external_item_id)
 *   2) `products.code` = SKU ที่ร้านตั้ง หรือ `<prefix>{item_id}` (active)
 *   3) แถวที่ถูก soft-delete ไว้ → ปลุกคืน
 *   4) **สินค้าเดี่ยว**: SKU ตรงกับ variation ที่มีอยู่ → ใช้สินค้าตัวนั้นเป็นแม่
 *      (ของที่มีตัวเลือกไม่ทำขั้นนี้ — จะไปยัดตัวเลือกใหม่ใส่สินค้าเดี่ยวของคนอื่น)
 *   5) ไม่เจอเลย → สร้างใหม่
 */
async function upsertImportedProduct(
  ctx: ImportContext,
  item: MarketplaceImportItem,
  options: ImportOptions,
): Promise<{ productId: string; stockEntries: { variationId: string; stock: number }[]; isNewProduct: boolean }> {
  if (item.models.length === 0) {
    throw new Error('ดึงรายละเอียดสินค้าจากร้านไม่สำเร็จ (ไม่มีตัวเลือกเลย)');
  }

  const parentCode = resolveParentCode(ctx.adapter, item);
  const primaryImage = item.images[0] || null;
  const firstModelSku = resolveModelSku(ctx.adapter, item, item.models[0]);

  let parentProductId: string | null = null;
  let isNewProduct = false;

  // 1) link เดิมของร้านนี้
  const { data: anyLink } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id')
    .eq('account_id', ctx.accountId)
    .eq('external_item_id', item.external_item_id)
    .limit(1)
    .maybeSingle();
  if (anyLink?.product_id) parentProductId = anyLink.product_id;

  // 2) code ตรงกัน (active)
  if (!parentProductId) {
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', ctx.companyId)
      .eq('code', parentCode)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      parentProductId = existing.id;
      await maybeUpdateProductMeta(ctx, existing.id, item);
    }
  }

  // 3) ปลุกของที่ถูก soft-delete
  if (!parentProductId) {
    const { data: inactive } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', ctx.companyId)
      .eq('code', parentCode)
      .eq('is_active', false)
      .limit(1)
      .maybeSingle();
    if (inactive?.id) {
      await reactivateProduct(inactive.id, ctx.platform);
      await maybeUpdateProductMeta(ctx, inactive.id, item);
      parentProductId = inactive.id;
    }
  }

  // 4) สินค้าเดี่ยว: SKU ตรงกับของที่มีอยู่
  if (!parentProductId && !item.has_variation) {
    const matched = await tryAutoMatchBySku(ctx.companyId, firstModelSku, ctx.platform);
    if (matched) {
      parentProductId = matched.product_id;
      await maybeUpdateProductMeta(ctx, matched.product_id, item);
    }
  }

  // 5) สร้างใหม่
  if (!parentProductId) {
    const variationTypeIds = item.has_variation
      ? await getOrCreateVariationTypeIds(ctx.companyId, item.variation_type_names)
      : [];

    const { data: created, error } = await supabaseAdmin
      .from('products')
      .insert({
        company_id: ctx.companyId,
        code: parentCode,
        name: item.name,
        // สินค้าเดี่ยว: `variation_label` ต้องไม่ null (กติกาแยก simple/variable ของระบบ)
        variation_label: item.has_variation ? null : (firstModelSku || item.name),
        image: primaryImage,
        source: ctx.platform,
        selected_variation_types: item.has_variation ? variationTypeIds : undefined,
        description: item.description || null,
        is_active: true,
      })
      .select('id')
      .single();

    if (error || !created) throw new Error(`สร้างสินค้าไม่สำเร็จ: ${error?.message}`);
    parentProductId = created.id;
    isNewProduct = true;

    for (let i = 0; i < item.images.length; i++) {
      await upsertProductImage(ctx.companyId, parentProductId, null, item.images[i], i, ctx.platform);
    }
  }

  // ทุก branch ข้างบน set parentProductId หรือไม่ก็ throw — กันไว้ให้ชัด
  if (!parentProductId) throw new Error(`หาสินค้าแม่ของ ${item.external_item_id} ไม่ได้`);
  const parentId: string = parentProductId;
  const stockEntries: { variationId: string; stock: number }[] = [];

  // ผูก/สร้าง **ทุกตัวเลือก** ของสินค้านี้ — ไม่ใช่แค่ตัวที่เคยสั่ง (กันคลังเพี้ยน)
  for (const model of item.models) {
    const modelSku = resolveModelSku(ctx.adapter, item, model);
    const existingLink = await findMarketplaceLink(ctx.accountId, item.external_item_id, model.external_model_id);
    let variationId: string | null = existingLink?.variation_id || null;

    if (!variationId) {
      const matched = await tryAutoMatchBySku(ctx.companyId, modelSku, ctx.platform);
      if (matched) {
        variationId = matched.variation_id;
      } else if (!item.has_variation) {
        // สินค้าเดี่ยวมีตัวเลือกเดียวเสมอ — ห้ามสร้างตัวที่สองใส่ของเดิม
        const { data: onlyVar } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .eq('company_id', ctx.companyId)
          .eq('product_id', parentId)
          .eq('is_active', true)
          .limit(1)
          .maybeSingle();
        variationId = onlyVar?.id
          || await createVariationRow(ctx, parentId, model, modelSku, options.copySkuToBarcode);
      } else {
        // ตัวที่เพิ่งถูกสร้างใต้แม่เดียวกันในรอบนี้
        const { data: sibling } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .eq('company_id', ctx.companyId)
          .eq('product_id', parentId)
          .eq('sku', modelSku)
          .limit(1)
          .maybeSingle();
        variationId = sibling?.id
          || await createVariationRow(ctx, parentId, model, modelSku, options.copySkuToBarcode);
      }
    }

    if (variationId) {
      stockEntries.push({ variationId, stock: model.stock || 0 });
      await upsertLink(ctx, item, model, parentId, variationId, modelSku);
    }
  }

  return { productId: parentId, stockEntries, isNewProduct };
}

/**
 * ผูกสินค้าบนร้านเข้ากับสินค้าที่มีอยู่แล้วในระบบ (action = 'link')
 * — ไม่สร้าง/แก้สินค้าใด ๆ แค่ลง `marketplace_product_links` แล้วส่งสต็อกของเราขึ้นร้าน
 */
async function linkToExistingProduct(
  ctx: ImportContext,
  item: MarketplaceImportItem,
  targetProductId: string,
): Promise<{ variationIds: string[]; warnings: string[] }> {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('id', targetProductId)
    .eq('company_id', ctx.companyId)
    .limit(1)
    .maybeSingle();
  if (!product) throw new Error('ไม่พบสินค้าที่เลือกไว้ในระบบ');

  const { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select('id, sku')
    .eq('company_id', ctx.companyId)
    .eq('product_id', targetProductId)
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  const rows = variations || [];
  const bySku = new Map<string, string>();
  for (const v of rows) if (v.sku) bySku.set(String(v.sku).trim(), v.id);

  const variationIds: string[] = [];
  const warnings: string[] = [];

  for (const model of item.models) {
    const modelSku = resolveModelSku(ctx.adapter, item, model);
    // จับคู่ด้วย SKU ก่อน · ตัวเลือกเดียวทั้งสองฝั่ง = ตัวนั้นแน่นอน
    const variationId = bySku.get(modelSku)
      || bySku.get((model.sku || '').trim())
      || (item.models.length === 1 || rows.length === 1 ? rows[0]?.id : undefined)
      || null;

    if (!variationId) {
      warnings.push(`ตัวเลือก "${model.name || modelSku}" จับคู่กับตัวเลือกในระบบไม่ได้ (SKU ไม่ตรง)`);
      continue;
    }
    variationIds.push(variationId);
    await upsertLink(ctx, item, model, targetProductId, variationId, modelSku);
  }

  if (variationIds.length === 0) {
    throw new Error(warnings[0] || 'ผูกไม่สำเร็จ — ไม่มีตัวเลือกที่จับคู่ได้');
  }
  return { variationIds, warnings };
}

// ── สต็อก ────────────────────────────────────────────────────────────────────

/**
 * ตั้งยอดตั้งต้นจากร้าน — **กติกา fill_blank เดียวกับ `applyPulledStock`**
 * (เติมเฉพาะช่องที่คลังเราเป็น 0 / ยังไม่มีแถว และร้าน > 0 · ไม่ทับของที่พนักงานตั้งไว้)
 *
 * เขียนผ่าน `adjustStock` เท่านั้น — DB มี trigger ปฏิเสธการเขียน `inventory` ตรง ๆ
 * และยอดที่เปลี่ยนโดยไม่มีร่องรอยว่าใครทำ = ตรวจย้อนหลังไม่ได้
 */
async function seedStockFillBlank(
  ctx: ImportContext,
  entries: { variationId: string; stock: number }[],
): Promise<void> {
  const wanted = entries.filter(e => e.variationId && e.stock > 0);
  if (wanted.length === 0) return;

  // แพ็กเกจที่ไม่มีระบบคลัง = ไม่มีที่ให้ลงยอด
  if (await stockGateError(ctx.companyId)) return;

  const warehouseId = await resolveAccountWarehouseId({
    id: ctx.accountId,
    company_id: ctx.companyId,
    warehouse_id: ctx.account.warehouse_id ?? null,
  });
  if (!warehouseId) return;

  // กติกาเดียวกับ "ดึงสต็อกจากร้าน" โหมด fill_blank (ตัวเดียวกับปุ่มในการ์ดร้าน) —
  // เติมเฉพาะช่องที่คลังเราเป็น 0 · quantity = ยอดร้าน + reserved · เขียนผ่าน adjustStock
  const stockByVariation = new Map<string, number>();
  for (const { variationId, stock } of wanted) stockByVariation.set(variationId, stock);
  const result = emptyPullResult(false);
  await applyPulledStock({
    account: { id: ctx.accountId, company_id: ctx.companyId, platform: ctx.platform, warehouse_id: ctx.account.warehouse_id ?? null },
    warehouseId,
    stockByVariation,
    mode: 'fill_blank',
    dryRun: false,
    referenceType: stockSyncReferenceType(ctx.platform),
    // ขานี้ไม่ใช่ "รอบซิงค์" ที่ย้อนได้ (เป็นผลพลอยได้ของการนำเข้าสินค้า) จึงยังอ้าง id ของร้าน
    // — ต่างจากปุ่มดึง/ส่งสต็อกที่อ้าง id ของรอบ (`lib/marketplace/sync-runs.ts`)
    referenceId: ctx.accountId,
    result,
  });
  for (const err of result.errors) console.error('[Product Import] ลงสต็อกตั้งต้นไม่สำเร็จ:', err);
}

// ── พรีวิว ───────────────────────────────────────────────────────────────────

/** สินค้าในระบบที่ SKU ตรงกัน (อ่านอย่างเดียว — ห้ามปลุกของที่ลบไว้ตอนแค่ดูรายการ) */
async function findSkuMatches(
  companyId: string,
  skus: string[],
): Promise<Map<string, { product_id: string; variation_id: string; name: string }>> {
  const out = new Map<string, { product_id: string; variation_id: string; name: string }>();
  const list = [...new Set(skus.filter(Boolean))];
  for (let i = 0; i < list.length; i += 150) {
    const { data } = await supabaseAdmin
      .from('product_variations')
      .select('id, sku, product_id, products!inner(name, is_active)')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('products.is_active', true)
      .in('sku', list.slice(i, i + 150));
    for (const row of data || []) {
      const sku = String(row.sku || '');
      if (!sku || out.has(sku)) continue;
      const product = row.products as unknown as { name?: string } | null;
      out.set(sku, { product_id: row.product_id as string, variation_id: row.id as string, name: product?.name || '' });
    }
  }
  return out;
}

/** รายการสินค้าบนร้านหนึ่งหน้า + บอกว่าตัวไหนผูกแล้ว / ตัวไหนจะผูกอัตโนมัติ */
export async function previewImport(
  account: ProductImportAccount,
  opts: { cursor?: string; pageSize?: number; search?: string } = {},
): Promise<PreviewResult> {
  const ctx = buildContext(account);
  const page = await ctx.adapter.listProducts(account, opts.cursor, opts.pageSize ?? 20);

  const itemIds = page.items.map(i => i.external_item_id);
  const linkedMap = new Map<string, { product_id: string; name: string }>();
  if (itemIds.length > 0) {
    const { data: links } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('external_item_id, product_id, products!inner(name, is_active)')
      .eq('account_id', ctx.accountId)
      .eq('products.is_active', true)
      .in('external_item_id', itemIds);
    for (const link of links || []) {
      const key = String(link.external_item_id);
      if (linkedMap.has(key)) continue;
      const product = link.products as unknown as { name?: string } | null;
      linkedMap.set(key, { product_id: link.product_id as string, name: product?.name || '' });
    }
  }

  const skuMatches = await findSkuMatches(
    ctx.companyId,
    page.items.flatMap(item => item.models.map(m => resolveModelSku(ctx.adapter, item, m))),
  );

  let items: PreviewItem[] = page.items.map(item => {
    const linked = linkedMap.get(item.external_item_id) || null;
    let autoMatch: PreviewItem['auto_match'] = null;
    for (const model of item.models) {
      const hit = skuMatches.get(resolveModelSku(ctx.adapter, item, model));
      if (hit) { autoMatch = hit; break; }
    }
    return {
      external_item_id: item.external_item_id,
      name: item.name,
      sku: (item.sku || '').trim(),
      image: item.image || item.images[0] || null,
      price: item.price,
      status: item.status,
      has_variation: item.has_variation,
      model_count: item.models.length,
      total_stock: item.models.reduce((sum, m) => sum + (m.stock || 0), 0),
      models: item.models.map(m => ({
        external_model_id: m.external_model_id,
        name: m.name,
        sku: resolveModelSku(ctx.adapter, item, m),
        price: m.price,
        stock: m.stock,
      })),
      linked_product: linked,
      auto_match: linked ? null : autoMatch,
    };
  });

  // ค้นหาเป็นการกรอง "หน้าที่ดึงมา" — ไม่มี platform ไหนให้ค้นทั้งร้านด้วยคำเดียวกันได้
  const q = (opts.search || '').trim().toLowerCase();
  if (q) {
    items = items.filter(i =>
      i.name.toLowerCase().includes(q)
      || i.sku.toLowerCase().includes(q)
      || i.models.some(m => m.sku.toLowerCase().includes(q))
    );
  }

  return { items, next_cursor: page.nextCursor, total: page.total };
}

// ── นำเข้า ───────────────────────────────────────────────────────────────────

/** ทำงานหนึ่งรายการ — คืนว่าไปทางไหน เพื่อให้ชั้นบนนับสรุปได้ */
async function runOne(
  ctx: ImportContext,
  item: MarketplaceImportItem,
  request: ImportRequestItem,
  options: ImportOptions,
  result: ImportResult,
): Promise<void> {
  if (request.action === 'link') {
    if (!request.target_product_id) throw new Error('ยังไม่ได้เลือกสินค้าที่จะผูก');
    const { variationIds, warnings } = await linkToExistingProduct(ctx, item, request.target_product_id);
    result.linked++;
    result.errors.push(...warnings.map(w => `${item.name}: ${w}`));
    // ผูกกับของเดิม = ยอดของเราเป็นความจริง ต้องส่งขึ้นร้านทันที
    // (await ไว้เลย — อยู่ใน stream ที่ยังเปิดอยู่ ปล่อยลอยแล้วโดนตัดกลางคัน)
    await syncStockNow(variationIds);
    return;
  }

  const { stockEntries, isNewProduct } = await upsertImportedProduct(ctx, item, options);
  if (isNewProduct) result.created++;
  else result.updated++;

  // ตั้งยอดตั้งต้นจากร้าน (fill_blank)
  await seedStockFillBlank(ctx, stockEntries);
}

/**
 * นำเข้าตามรายการที่ผู้ใช้เลือก
 * — สินค้าที่ดึงรายละเอียดไม่ได้ นับเป็น skipped พร้อมเหตุผล ไม่ทำให้ทั้งชุดล้ม
 */
export async function importItems(
  account: ProductImportAccount,
  requests: ImportRequestItem[],
  options: ImportOptions = {},
  onProgress?: ImportProgressCallback,
): Promise<ImportResult> {
  const ctx = buildContext(account);
  const result = emptyResult();
  if (requests.length === 0) return result;

  const ids = [...new Set(requests.map(r => r.external_item_id))];
  const details = new Map<string, MarketplaceImportItem>();
  if (ctx.adapter.fetchDetails) {
    for (const item of await ctx.adapter.fetchDetails(account, ids)) {
      details.set(item.external_item_id, item);
    }
  } else {
    // ไม่มี fetchDetails = ต้องไล่หน้าหาเอา (ช้า — adapter ทุกตัวควรมี)
    const wanted = new Set(ids);
    let cursor: string | undefined;
    do {
      const page = await ctx.adapter.listProducts(account, cursor, 50);
      for (const item of page.items) {
        if (wanted.has(item.external_item_id)) details.set(item.external_item_id, item);
      }
      cursor = page.nextCursor;
    } while (cursor && details.size < wanted.size);
  }

  let done = 0;
  for (const request of requests) {
    const item = details.get(request.external_item_id);
    const name = item?.name || `#${request.external_item_id}`;
    done++;
    try {
      if (!item) throw new Error('ไม่พบสินค้านี้ในร้านแล้ว');
      await runOne(ctx, item, request, options, result);
      await onProgress?.({ done, total: requests.length, item_name: name, success: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
      result.skipped++;
      result.errors.push(`${name}: ${message}`);
      console.error(`[Product Import] ${ctx.platform} ${request.external_item_id}: ${message}`);
      await onProgress?.({ done, total: requests.length, item_name: name, success: false, error: message });
    }
  }

  return result;
}

/**
 * นำเข้าทั้งร้าน — ตัวเดียวกับข้างบน แค่ป้อนด้วยการไล่หน้าเอง
 *
 * ร้านจริงมีได้หลักพันรายการ แต่ serverless มีเพดานเวลา → หยุดเองก่อนหมดเวลาแล้ว
 * คืน `next_cursor` ให้ฝั่งเรียกยิงต่อ (ทำซ้ำได้ ไม่เกิดของซ้ำ)
 */
export async function importAllProducts(
  account: ProductImportAccount,
  options: ImportOptions & { cursor?: string; pageSize?: number; timeBudgetMs?: number } = {},
  onProgress?: ImportProgressCallback,
): Promise<ImportResult> {
  const ctx = buildContext(account);
  const startedAt = Date.now();
  const budget = options.timeBudgetMs ?? 210_000;
  const result = emptyResult();

  let cursor = options.cursor;
  let done = 0;
  let total: number | undefined;

  for (;;) {
    const page = await ctx.adapter.listProducts(account, cursor, options.pageSize ?? 50);
    if (total === undefined) total = page.total;
    if (page.items.length === 0) { cursor = undefined; break; }

    for (const item of page.items) {
      done++;
      try {
        await runOne(ctx, item, { external_item_id: item.external_item_id, action: 'create' }, options, result);
        await onProgress?.({ done, total, item_name: item.name, success: true });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
        result.skipped++;
        result.errors.push(`${item.name}: ${message}`);
        console.error(`[Product Import] ${ctx.platform} ${item.external_item_id}: ${message}`);
        await onProgress?.({ done, total, item_name: item.name, success: false, error: message });
      }
    }

    cursor = page.nextCursor;
    if (!cursor) break;
    // ใกล้หมดเวลาของ request แล้ว — หยุดตรงขอบหน้าพอดี ให้รอบถัดไปเริ่มที่นี่
    if (Date.now() - startedAt > budget) {
      result.next_cursor = cursor;
      break;
    }
  }

  // stamp เฉพาะตอนไล่ครบทั้งร้าน — ค้างกลางทางแล้ว stamp = เข้าใจผิดว่า sync ครบ
  if (!result.next_cursor) {
    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ last_product_sync_at: new Date().toISOString() })
      .eq('id', ctx.accountId);
  }

  return result;
}
