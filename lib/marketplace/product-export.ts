// ชั้นกลางของ "ส่งสินค้าของเราขึ้นร้าน marketplace" (server-only)
//
// ทำไมต้องมีไฟล์นี้: เดิมมีแค่ Shopee (`lib/shopee/product-export.ts` + route +
// หน้า wizard เฉพาะ Shopee) — Lazada/TikTok ไม่มีเลย · ถ้าก๊อปไปอีกสองชุดจะเพี้ยน
// กันเองแบบเดียวกับที่เคยเกิดกับ product import
//
// ⇒ ตรรกะที่ไม่ขึ้นกับ platform อยู่ที่นี่ที่เดียว · "ยิง API ของเจ้านั้นยังไง" อยู่ใน
//   `lib/<platform>/product-export-adapter.ts` ที่ลงทะเบียนไว้ที่ `product-export-adapter.ts`
//   **ห้าม `switch (platform)` ในไฟล์นี้**
//
// ⛔ สต็อก: ยอดที่ตั้งให้ประกาศใหม่มาจาก `collectPushQuantities` (คลังของร้านนั้น)
//    และหลังสร้างเสร็จต้อง `syncStockNow()` เสมอ — ห้ามอ่าน/เขียน `inventory` เอง

import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';
import { logIntegration } from '@/lib/integration-logger';
import { collectPushQuantities, syncStockNow } from '@/lib/marketplace/stock-push';
import {
  getProductExportAdapter,
  exportPlatformLabel,
  type CreateProductResult,
  type ExportModel,
  type ExportPayload,
  type ProductExportAccount,
  type ProductExportAdapter,
} from '@/lib/marketplace/product-export-adapter';

export type {
  ExportPayload,
  ExportModel,
  MarketplaceAttribute,
  MarketplaceCategory,
  MarketplaceBrand,
  ProductExportAccount,
} from '@/lib/marketplace/product-export-adapter';
import { sellingPrice } from '@/lib/product-display';
export { getProductExportAdapter, exportPlatformLabel } from '@/lib/marketplace/product-export-adapter';

// ── Types ────────────────────────────────────────────────────────────────────

/** ค่าที่ผู้ใช้ตั้งให้สินค้าหนึ่งตัวในหน้า wizard */
export interface ExportConfig {
  category_id: string;
  category_name?: string | null;
  brand_id?: string | null;
  brand_name?: string | null;
  /** กิโลกรัม — ไม่ส่ง = 0.5 */
  weight?: number;
  /** เซนติเมตร */
  dimensions?: { length: number; width: number; height: number };
  /** key = `MarketplaceAttribute.id` */
  attributes?: Record<string, string | string[]>;
  /**
   * รูปหน้าปกเฉพาะร้านนี้ — Shopee ไม่ยอมให้ประกาศต่างร้านใช้รูปหน้าปกเดียวกัน
   * ไม่ส่ง = ใช้รูปหลักของสินค้า · ส่งมา = แทนที่รูปแรก ที่เหลือเรียงตามเดิม
   */
  cover_image_url?: string | null;
  /**
   * ชื่อประกาศเฉพาะร้านนี้ — ไม่ส่ง = ใช้ชื่อสินค้าในระบบ
   * (ใช้ตอนแพลตฟอร์มมีเพดาน/ขั้นต่ำความยาวที่ชื่อจริงของเราไม่ผ่าน เช่น TikTok ขั้นต่ำ 25 ตัวอักษร)
   */
  title?: string | null;
  /**
   * ราคาเฉพาะร้านนี้รายตัวเลือก (`variation_id` → ราคา) — ไม่ส่ง = ใช้ราคาขายในระบบ
   * ใช้ตอนยืมราคาจากร้านที่สินค้าตัวนี้ขายอยู่แล้ว (ราคาบนแพลตฟอร์มบวกค่าธรรมเนียมไว้แล้ว)
   */
  prices?: Record<string, number> | null;
}

export interface ExportOneResult {
  success: boolean;
  product_id: string;
  product_name: string;
  external_item_id?: string;
  /** ผูกกับร้านนี้อยู่แล้ว — ไม่ได้ล้มเพราะข้อมูลผิด */
  already_linked?: boolean;
  draft?: boolean;
  errors: string[];
  warnings: string[];
  /** โหมดลองก่อน — ก้อนที่จะถูกส่งจริง (ไม่ยิง API ของแพลตฟอร์ม) */
  preview?: ExportPayload;
}

export interface ExportProgress {
  done: number;
  total: number;
  product_name: string;
  success: boolean;
  error?: string;
}

export type ExportProgressCallback = (p: ExportProgress) => void | Promise<void>;

export interface ExportBulkItem {
  product_id: string;
  config: ExportConfig;
}

export interface ExportBulkResult {
  total: number;
  success_count: number;
  error_count: number;
  results: ExportOneResult[];
  /** ยังไม่ครบ — ยิงรอบถัดไปด้วย cursor นี้ (index ของรายการถัดไป) */
  next_cursor?: string;
}

interface ExportContext {
  account: ProductExportAccount;
  adapter: ProductExportAdapter;
  platform: string;
  companyId: string;
  accountId: string;
  accountName: string;
}

function buildContext(account: ProductExportAccount): ExportContext {
  const adapter = getProductExportAdapter(account.platform);
  if (!adapter) {
    throw new Error(`ยังไม่รองรับส่งสินค้าขึ้น ${exportPlatformLabel(account.platform)}`);
  }
  return {
    account,
    adapter,
    platform: account.platform as string,
    companyId: account.company_id,
    accountId: account.id,
    accountName: account.shop_name || `Shop ${account.shop_id ?? ''}`.trim(),
  };
}

// ── อ่านสินค้าของเรา ──────────────────────────────────────────────────────────

export interface ExportVariationSource {
  id: string;
  variation_label: string;
  sku: string | null;
  default_price: number;
  discount_price: number;
  attributes: Record<string, string> | null;
  image: string | null;
}

export interface ExportProductSource {
  id: string;
  code: string;
  name: string;
  description: string;
  is_composite: boolean;
  /** ไม่ null = สินค้าเดี่ยว (กติกาแยก simple/variable ของระบบ) */
  variation_label: string | null;
  images: string[];
  variations: ExportVariationSource[];
  /** link ที่มีอยู่แล้วของร้านนี้ — มี = เคยส่งขึ้นร้านนี้แล้ว */
  existing_link: { external_item_id: string } | null;
  /**
   * คำอธิบายที่เคยส่งขึ้นแพลตฟอร์มนี้ (ร้านไหนก็ได้) — ส่งซ้ำไปร้านใหม่ให้ตรงกัน
   * (พฤติกรรมเดิมของ Shopee export)
   */
  platform_description: string | null;
}

/**
 * อ่านสินค้า + ตัวเลือก + รูป + link เดิม ในรูปที่ชั้นกลางใช้
 * (ย้ายมาจาก `lib/shopee/product-export.ts` แล้วทำให้ไม่ผูกกับ platform)
 */
export async function fetchProductForExport(
  productId: string,
  companyId: string,
  platform?: string,
  accountId?: string,
): Promise<ExportProductSource | null> {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, code, name, description, image, variation_label, is_composite')
    .eq('id', productId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .maybeSingle();

  if (!product) return null;

  const variationColumns = 'id, variation_label, sku, default_price, discount_price, attributes';
  // ⛔ `product_variations` ไม่มีคอลัมน์ `sort_order` — เรียงด้วย `created_at`
  //    เหมือน `/api/products` (เคยใช้ sort_order แล้ว query error เงียบ ๆ ทั้งสองชั้น
  //    → ทุกสินค้ากลายเป็น "ยังไม่มีตัวเลือก/ราคา" ส่งขึ้นร้านไม่ได้เลยสักตัว)
  const { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select(variationColumns)
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .eq('is_active', true)
    // ⛔ ต้องกรอง `deleted_at` ด้วย — ตัวเลือกที่ลบจากฟอร์มถูก soft-delete โดย
    // `is_active` ยังเป็น true อยู่ ⇒ กรองแค่ is_active จะส่งของที่ลบแล้วขึ้นร้าน
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  // ข้อมูลยุคก่อนมี `company_id` บน `product_variations` ยังมีอยู่จริง — ตัวกรองด้านบน
  // ทำให้สินค้าเก่ากลายเป็น "ไม่มีตัวเลือก" แล้วส่งขึ้นร้านไม่ได้ (ทางถอยเดิมของ Shopee)
  let rows = variations || [];
  if (rows.length === 0) {
    const { data: legacy } = await supabaseAdmin
      .from('product_variations')
      .select(variationColumns)
      .eq('product_id', productId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    rows = legacy || [];
  }

  // รูป: ระดับสินค้า (variation_id เป็น null) เรียงตาม sort_order + รูปเฉพาะตัวเลือก
  const { data: images } = await supabaseAdmin
    .from('product_images')
    .select('image_url, variation_id, sort_order')
    .eq('company_id', companyId)
    .eq('product_id', productId)
    .order('sort_order', { ascending: true });

  const productImages: string[] = [];
  const variationImage = new Map<string, string>();
  for (const row of images || []) {
    const url = row.image_url as string | null;
    if (!url) continue;
    const variationId = row.variation_id as string | null;
    if (variationId) {
      if (!variationImage.has(variationId)) variationImage.set(variationId, url);
    } else {
      productImages.push(url);
    }
  }
  if (productImages.length === 0 && product.image) productImages.push(product.image as string);

  let existingLink: { external_item_id: string } | null = null;
  if (accountId) {
    const { data: link } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('external_item_id')
      .eq('account_id', accountId)
      .eq('product_id', productId)
      .limit(1)
      .maybeSingle();
    if (link?.external_item_id) existingLink = { external_item_id: String(link.external_item_id) };
  }

  let platformDescription: string | null = null;
  if (platform) {
    const { data: anyLink } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('platform_description')
      .eq('company_id', companyId)
      .eq('product_id', productId)
      .eq('platform', platform)
      .not('platform_description', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    platformDescription = (anyLink?.platform_description as string | null) || null;
  }

  return {
    id: product.id as string,
    code: (product.code as string) || '',
    name: (product.name as string) || '',
    description: (product.description as string) || (product.name as string) || '',
    is_composite: product.is_composite === true,
    variation_label: (product.variation_label as string | null) ?? null,
    images: productImages,
    variations: rows.map(v => ({
      id: v.id as string,
      variation_label: (v.variation_label as string) || '',
      sku: (v.sku as string | null) ?? null,
      default_price: Number(v.default_price || 0),
      discount_price: Number(v.discount_price || 0),
      attributes: (v.attributes as Record<string, string> | null) ?? null,
      image: variationImage.get(v.id as string) || null,
    })),
    existing_link: existingLink,
    platform_description: platformDescription,
  };
}



/**
 * สินค้านี้ควรส่งขึ้นร้านเป็น "สินค้าเดี่ยว" หรือ "มีตัวเลือก"
 * (กติกาเดียวกับของเดิม: `variation_label` ไม่ null · ตัวเลือกเดียว · ไม่มี attribute เลย)
 */
function hasVariation(product: ExportProductSource): boolean {
  if (product.variation_label !== null) return false;
  if (product.variations.length <= 1) return false;
  return product.variations.some(v => v.attributes && Object.keys(v.attributes).length > 0);
}

// ── ประกอบ payload ───────────────────────────────────────────────────────────

/**
 * แปลงสินค้าของเรา + ค่าที่ผู้ใช้ตั้ง → รูปกลางที่ adapter รับ
 * (`uploaded_images` ยังว่าง — ชั้นกลางเติมหลังอัปรูปเสร็จ)
 */
export function buildExportPayload(
  product: ExportProductSource,
  config: ExportConfig,
  stockByVariation?: Map<string, number>,
): ExportPayload {
  const variation = hasVariation(product);
  const images = config.cover_image_url
    ? [config.cover_image_url, ...product.images.filter(u => u !== config.cover_image_url)]
    : product.images;

  const models: ExportModel[] = product.variations.map(v => ({
    variation_id: v.id,
    name: v.variation_label || product.name,
    sku: (v.sku || '').trim() || product.code,
    price: Number(config.prices?.[v.id] || 0) > 0 ? Number(config.prices?.[v.id]) : sellingPrice(v),
    stock: Math.max(0, stockByVariation?.get(v.id) ?? 0),
    attributes: variation
      ? Object.entries(v.attributes || {}).map(([type_name, value]) => ({ type_name, value: String(value) }))
      : [],
    image: v.image,
  }));

  return {
    product_id: product.id,
    code: product.code,
    name: (config.title || '').trim() || product.name,
    description: product.platform_description || product.description || product.name,
    images,
    uploaded_images: [],
    category_id: String(config.category_id),
    category_name: config.category_name ?? null,
    brand_id: config.brand_id ?? null,
    brand_name: config.brand_name ?? null,
    weight: config.weight && config.weight > 0 ? config.weight : 0.5,
    dimensions: config.dimensions,
    price: models[0]?.price || 0,
    has_variation: variation,
    models,
    attributes: config.attributes || {},
  };
}

// ── link ─────────────────────────────────────────────────────────────────────

/**
 * แถวใน `marketplace_product_links` — คอลัมน์กลางทุก platform เหมือนกัน
 * (คอลัมน์เดียวกับที่ขา import เขียน เพื่อให้ push สต็อก/ราคาเดินต่อได้ทันที)
 */
async function upsertLinks(
  ctx: ExportContext,
  payload: ExportPayload,
  result: CreateProductResult,
): Promise<void> {
  const now = new Date().toISOString();
  const modelByVariation = new Map<string, ExportModel>();
  for (const m of payload.models) if (m.variation_id) modelByVariation.set(m.variation_id, m);

  for (const exported of result.models) {
    const model = (exported.variation_id && modelByVariation.get(exported.variation_id)) || payload.models[0];
    if (!model) continue;

    const extra = ctx.adapter.linkPayload?.(payload, result, model) || {};
    const { platform_data: extraPlatformData, ...extraColumns } = extra as {
      platform_data?: Record<string, unknown>;
    } & Record<string, unknown>;

    const { error } = await supabaseAdmin.from('marketplace_product_links').upsert({
      company_id: ctx.companyId,
      platform: ctx.platform,
      account_id: ctx.accountId,
      account_name: ctx.accountName,
      product_id: payload.product_id,
      variation_id: exported.variation_id,
      // id ของ TikTok/Lazada ยาว 18-19 หลัก — เก็บเป็น string เสมอ ห้ามแปลงเป็น number
      external_item_id: result.external_item_id,
      external_model_id: exported.external_model_id,
      external_sku: exported.external_sku || model.sku || '',
      platform_product_name: payload.name || null,
      platform_price: model.price || null,
      platform_primary_image: payload.images[0] || null,
      platform_data: {
        category_id: payload.category_id || null,
        category_name: payload.category_name || null,
        brand_id: payload.brand_id || null,
        brand_name: payload.brand_name || null,
        attributes: payload.attributes,
        ...(result.platform_data || {}),
        ...(extraPlatformData || {}),
      },
      sync_enabled: true,
      last_synced_at: now,
      updated_at: now,
      ...extraColumns,
    }, { onConflict: 'account_id,external_item_id,external_model_id' });

    if (error) {
      console.error('[Product Export] บันทึกการผูกสินค้าไม่สำเร็จ:', error);
    }
  }
}

// ── การผูกที่ค้างอยู่ ─────────────────────────────────────────────────────────

/**
 * ประกาศที่ผูกไว้ยังอยู่บนร้านจริงไหม
 * ตอบ `true` เมื่อไม่แน่ใจเสมอ (แพลตฟอร์มไม่รองรับการถาม · API ล้ม) — เดาว่า
 * "ไม่อยู่" แล้วสร้างใหม่คือของเสียบนร้าน ซึ่งแก้ยากกว่า link ค้าง
 */
async function itemStillOnShop(ctx: ExportContext, externalItemId: string): Promise<boolean> {
  if (!ctx.adapter.itemExists) return true;
  try {
    return await ctx.adapter.itemExists(ctx.account, externalItemId);
  } catch {
    return true;
  }
}

/** ล้างการผูกของสินค้านี้กับร้านนี้ (ประกาศบนร้านไม่มีแล้ว) */
async function clearStaleLinks(ctx: ExportContext, productId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('marketplace_product_links')
    .delete()
    .eq('company_id', ctx.companyId)
    .eq('account_id', ctx.accountId)
    .eq('product_id', productId);
  if (error) console.error('[Product Export] ล้างการผูกที่ค้างไม่สำเร็จ:', error);
}

// ── ส่งสินค้าหนึ่งตัว ─────────────────────────────────────────────────────────

/**
 * ส่งสินค้าหนึ่งตัวขึ้นร้าน
 *
 * ลำดับ (เดียวกันทุก platform):
 *   1) ผูกกับร้านนี้อยู่แล้ว → ไม่ส่งซ้ำ (ประกาศซ้ำบนร้านเดียวกันคือของเสีย)
 *   2) สินค้าชุด (composite) → ไม่ส่ง (ไม่มีสต็อกของตัวเอง แพลตฟอร์มจัดการให้ไม่ได้)
 *   3) อ่านสินค้า + ยอดคลังของร้านนี้ → ประกอบ payload
 *   4) อัปรูป → สร้างสินค้า → upsert link ทุกตัวเลือก → log → `syncStockNow`
 */
export async function exportProduct(
  account: ProductExportAccount,
  productId: string,
  config: ExportConfig,
  opts: { draft?: boolean; dryRun?: boolean } = {},
): Promise<ExportOneResult> {
  const ctx = buildContext(account);
  const startedAt = Date.now();
  const base: ExportOneResult = { success: false, product_id: productId, product_name: '', errors: [], warnings: [] };

  try {
    const product = await fetchProductForExport(productId, ctx.companyId, ctx.platform, ctx.accountId);
    if (!product) return { ...base, errors: ['ไม่พบสินค้านี้ในระบบ (หรือถูกปิดการใช้งานไว้)'] };
    base.product_name = product.name;

    if (product.existing_link) {
      // ประกาศอาจถูกลบทิ้งที่หลังบ้านของร้านไปแล้ว — link ฝั่งเราค้างอยู่ทำให้ส่งใหม่
      // ไม่ได้ตลอดกาล ถามร้านก่อนว่ายังมีจริงไหม ไม่มีแล้วก็ล้าง link ทิ้งแล้วส่งต่อ
      const stillOnShop = await itemStillOnShop(ctx, product.existing_link.external_item_id);
      if (stillOnShop) {
        return {
          ...base,
          already_linked: true,
          external_item_id: product.existing_link.external_item_id,
          errors: [`"${product.name}" ผูกกับร้านนี้อยู่แล้ว (#${product.existing_link.external_item_id}) — แก้ที่หน้าสินค้าแทน`],
        };
      }
      await clearStaleLinks(ctx, productId);
      base.warnings.push(`ประกาศเดิม #${product.existing_link.external_item_id} ถูกลบไปจากร้านแล้ว — ล้างการผูกให้และสร้างใหม่`);
    }
    if (product.is_composite) {
      return { ...base, errors: [`"${product.name}" เป็นสินค้าชุด — ส่งขึ้นร้านไม่ได้ (ไม่มีสต็อกของตัวเอง)`] };
    }
    if (product.variations.length === 0) {
      return { ...base, errors: [`"${product.name}" ยังไม่มีตัวเลือก/ราคา — เพิ่มก่อนแล้วค่อยส่งขึ้นร้าน`] };
    }
    if (!config.category_id) {
      return { ...base, errors: [`"${product.name}" ยังไม่ได้เลือกหมวดหมู่ของ ${exportPlatformLabel(ctx.platform)}`] };
    }

    // ยอดตั้งต้นบนร้าน = ยอดของคลังที่ร้านนี้ใช้ (ตัวเดียวกับขา push สต็อก)
    const quantities = await collectPushQuantities(
      { id: ctx.accountId, company_id: ctx.companyId, platform: ctx.platform, warehouse_id: account.warehouse_id ?? null },
      product.variations.map(v => v.id),
    );

    const payload = buildExportPayload(product, config, quantities);

    if (opts.dryRun) {
      return { ...base, success: true, preview: payload };
    }

    // 1) รูป — อัปทีละ 3 ใบพร้อมกัน แต่รักษาลำดับ (รูปแรก = หน้าปก)
    const uploaded = await parallelLimit(payload.images, async (url) => {
      try {
        return await ctx.adapter.uploadImage(account, url);
      } catch (e) {
        base.warnings.push(`อัปโหลดรูปไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
        return null;
      }
    }, 3);
    payload.uploaded_images = uploaded.filter((id): id is string => !!id);

    // 2) สร้างบนร้าน
    const draft = opts.draft === true;
    const created = await ctx.adapter.createProduct(account, payload, { draft });
    base.warnings.push(...created.warnings);

    // 3) ผูกกับสินค้าของเรา
    await upsertLinks(ctx, payload, created);

    logIntegration({
      company_id: ctx.companyId,
      integration: ctx.platform,
      account_id: ctx.accountId,
      account_name: ctx.accountName,
      direction: 'outgoing',
      action: 'export_product',
      method: 'POST',
      api_path: ctx.adapter.createApiPath,
      status: 'success',
      reference_type: 'product',
      reference_id: product.id,
      reference_label: `ส่งสินค้าขึ้นร้าน: ${product.name}${draft ? ' (แบบร่าง)' : ''}`,
      request_body: {
        category_id: payload.category_id,
        brand_id: payload.brand_id,
        weight: payload.weight,
        models: payload.models.length,
        draft,
      },
      response_body: { external_item_id: created.external_item_id, models: created.models, warnings: created.warnings },
      duration_ms: Date.now() - startedAt,
    });

    // 4) ยอดของเราขึ้นร้านทันที (await — อยู่ใน stream ที่ยังเปิดอยู่ ปล่อยลอยแล้วโดนตัด)
    const variationIds = created.models.map(m => m.variation_id).filter((id): id is string => !!id);
    if (variationIds.length > 0) {
      try {
        await syncStockNow(variationIds);
      } catch (e) {
        base.warnings.push(`ส่งสต็อกขึ้นร้านไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
      }
    }

    return {
      ...base,
      success: true,
      external_item_id: created.external_item_id,
      draft: created.draft ?? draft,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ';
    console.error(`[Product Export] ${ctx.platform} ${productId}: ${message}`);
    logIntegration({
      company_id: ctx.companyId,
      integration: ctx.platform,
      account_id: ctx.accountId,
      account_name: ctx.accountName,
      direction: 'outgoing',
      action: 'export_product',
      method: 'POST',
      api_path: ctx.adapter.createApiPath,
      status: 'error',
      reference_type: 'product',
      reference_id: productId,
      reference_label: `ส่งสินค้าขึ้นร้านไม่สำเร็จ: ${base.product_name || productId}`,
      error_message: message,
      duration_ms: Date.now() - startedAt,
    });
    return { ...base, errors: [message] };
  }
}

// ── ส่งหลายตัว ───────────────────────────────────────────────────────────────

/**
 * ส่งหลายรายการเรียงทีละตัว — หยุดเองก่อนหมดเวลาแล้วคืน `next_cursor`
 * (เพดานเวลาของ serverless · ทำซ้ำได้ไม่เกิดของซ้ำเพราะข้อ 1 ของ `exportProduct`)
 */
export async function exportBulk(
  account: ProductExportAccount,
  items: ExportBulkItem[],
  opts: { draft?: boolean; cursor?: string; timeBudgetMs?: number } = {},
  onProgress?: ExportProgressCallback,
): Promise<ExportBulkResult> {
  buildContext(account); // ล้มไว ๆ ถ้า platform นี้ยังไม่มี adapter
  const startedAt = Date.now();
  const budget = opts.timeBudgetMs ?? 210_000;
  const start = Math.max(0, parseInt(opts.cursor || '0', 10) || 0);

  const results: ExportOneResult[] = [];
  let successCount = 0;
  let errorCount = 0;
  let nextCursor: string | undefined;

  for (let i = start; i < items.length; i++) {
    const item = items[i];
    const result = await exportProduct(account, item.product_id, item.config, { draft: opts.draft });
    results.push(result);
    if (result.success) successCount++;
    else errorCount++;

    await onProgress?.({
      done: i + 1,
      total: items.length,
      product_name: result.product_name || `#${item.product_id}`,
      success: result.success,
      error: result.errors[0],
    });

    // ใกล้หมดเวลาของ request แล้ว — หยุดตรงขอบรายการพอดี ให้รอบถัดไปเริ่มที่นี่
    if (i + 1 < items.length && Date.now() - startedAt > budget) {
      nextCursor = String(i + 1);
      break;
    }
  }

  return {
    total: items.length,
    success_count: successCount,
    error_count: errorCount,
    results,
    next_cursor: nextCursor,
  };
}
