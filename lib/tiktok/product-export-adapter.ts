// TikTok Shop — ตัวต่อส่งสินค้าขึ้นร้าน (ยิง API + แปลงรูป เท่านั้น)
// ตรรกะร่วมอยู่ `lib/marketplace/product-export.ts` — ห้ามย้ายมาไว้ที่นี่
//
// ของที่เป็น "TikTok เท่านั้น" และต้องอยู่ในไฟล์นี้:
//   · `save_mode` = AS_DRAFT / LISTING (มีโหมดร่างในตัว ไม่ต้อง deactivate ทีหลัง)
//   · รูปต้องอัปแบบ multipart พร้อม `use_case` (ลายเซ็นไม่เอา body มาต่อ — ดู api.ts)
//   · สต็อกผูกกับ **คลังขายของร้าน** (`type = SALES_WAREHOUSE`) ต้องหา id ก่อนเสมอ
//   · `prerequisites` บอกว่าร้านพร้อมลงขายหรือยัง (บัญชีธนาคาร/ภาษี/คลัง/ขนส่ง)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { translateTikTokError } from '@/lib/tiktok/errors';
import {
  ensureValidToken,
  tiktokApiRequest,
  tiktokMultipartRequest,
  type TikTokAccountRow,
  type TikTokCredentials,
} from '@/lib/tiktok/api';
import type {
  CreateProductResult,
  ExportPayload,
  MarketplaceAttribute,
  MarketplaceBrand,
  MarketplaceCategory,
  ProductExportAccount,
  ProductExportAdapter,
} from '@/lib/marketplace/product-export-adapter';

const asTikTokAccount = (account: ProductExportAccount) => account as unknown as TikTokAccountRow;

const CREATE_PATH = '/product/202309/products';
const LOCALE = 'th-TH';

async function creds(account: ProductExportAccount): Promise<TikTokCredentials> {
  return ensureValidToken(asTikTokAccount(account));
}

async function fail(error: string): Promise<never> {
  throw new Error(await translateTikTokError(error));
}

// ── คลังขายของร้าน ───────────────────────────────────────────────────────────

/**
 * id คลังที่จะผูกสต็อกตอนสร้างสินค้า
 *
 * แคชไว้ที่ `marketplace_accounts.metadata.tiktok_warehouse_id` — **merge ก้อน metadata
 * เสมอ ห้ามเขียนทับทั้งก้อน** (โลโก้ร้าน/shop_cipher อยู่ในนั้น เคยหายมาแล้ว)
 */
async function resolveSalesWarehouseId(account: ProductExportAccount, c: TikTokCredentials): Promise<string> {
  const cached = (account.metadata as Record<string, unknown> | null)?.tiktok_warehouse_id;
  if (typeof cached === 'string' && cached) return cached;

  const { data, error } = await tiktokApiRequest(c, 'GET', '/logistics/202309/warehouses');
  if (error) await fail(error);

  const warehouses = (data as { warehouses?: {
    id?: string; type?: string; effect_status?: string; is_default?: boolean; name?: string;
  }[] } | null)?.warehouses || [];

  const usable = warehouses.filter(w => w.type === 'SALES_WAREHOUSE' && w.effect_status === 'ENABLED');
  const picked = usable.find(w => w.is_default) || usable[0];
  if (!picked?.id) {
    throw new Error('ร้านนี้ยังไม่มีคลังสำหรับขาย (Sales Warehouse) ที่เปิดใช้งานบน TikTok Shop — ตั้งค่าคลังใน Seller Center ก่อน');
  }

  const { data: row } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('metadata')
    .eq('id', account.id)
    .maybeSingle();
  await supabaseAdmin
    .from('marketplace_accounts')
    .update({
      metadata: { ...((row?.metadata as Record<string, unknown>) || {}), tiktok_warehouse_id: picked.id },
      updated_at: new Date().toISOString(),
    })
    .eq('id', account.id);

  return picked.id;
}

// ── ร้านพร้อมลงขายหรือยัง ────────────────────────────────────────────────────

const PREREQUISITE_LABELS: Record<string, string> = {
  status: 'สถานะร้าน',
  bank_account: 'บัญชีธนาคาร',
  contact_info: 'ข้อมูลติดต่อ',
  tax_info: 'ข้อมูลภาษี',
  epr: 'ทะเบียน EPR',
  product_quantity_limit: 'โควตาจำนวนสินค้า',
  delivery_option: 'ตัวเลือกการจัดส่ง',
  pickup_warehouse: 'คลังสำหรับให้เข้ารับของ',
  return_warehouse: 'คลังรับของคืน',
  shipping_template: 'เทมเพลตค่าจัดส่ง',
};

/** ค่าที่คืนมาเป็น "JSON ซ้อนอยู่ใน string" ต้อง parse ซ้ำอีกชั้น */
function prerequisiteFailed(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw) return false;
  try {
    const parsed = JSON.parse(raw) as { check_result?: { is_failed?: boolean } };
    return parsed?.check_result?.is_failed === true;
  } catch {
    return false;
  }
}

/** โยน error ภาษาไทยที่บอกว่าต้องไปแก้อะไรใน Seller Center — ไม่ใช่แค่ "ล้มเหลว" */
async function assertShopReady(c: TikTokCredentials): Promise<void> {
  const { data, error } = await tiktokApiRequest(c, 'GET', '/product/202309/prerequisites');
  if (error) {
    // เช็คไม่ได้ ≠ ร้านไม่พร้อม — ปล่อยผ่านแล้วให้ createProduct เป็นคนบอกความจริง
    console.warn('[TikTok Export] เช็คความพร้อมร้านไม่สำเร็จ:', error);
    return;
  }

  const shop = (data as { shop?: Record<string, unknown> } | null)?.shop;
  if (!shop) return;

  const problems: string[] = [];
  for (const [key, value] of Object.entries(shop)) {
    if (typeof value === 'string') {
      if (prerequisiteFailed(value)) problems.push(PREREQUISITE_LABELS[key] || key);
      continue;
    }
    for (const [subKey, subValue] of Object.entries((value as Record<string, unknown>) || {})) {
      if (prerequisiteFailed(subValue)) problems.push(PREREQUISITE_LABELS[subKey] || subKey);
    }
  }

  if (problems.length > 0) {
    throw new Error(`ร้าน TikTok Shop ยังไม่พร้อมลงขายสินค้า — ต้องตั้งค่าให้ครบก่อน: ${problems.join(' · ')} (ทำที่ TikTok Seller Center)`);
  }
}

// ── payload ──────────────────────────────────────────────────────────────────

/** ≤3 ทศนิยม ตามที่ TikTok รับสำหรับหน่วยกิโลกรัม */
function weightValue(kg: number): string {
  return String(Math.max(0.001, Math.round(kg * 1000) / 1000));
}

/**
 * ค่าที่ผู้ใช้เลือกจากรายการ = id (ตัวเลขยาว) · ค่าที่พิมพ์เอง = ชื่อ
 * (TikTok รับได้ทั้งคู่ — ให้ทั้งสองพร้อมกัน id ชนะ จึงต้องเลือกส่งอย่างเดียว)
 */
function attributeValue(value: string): { id?: string; name?: string } {
  return /^\d{3,}$/.test(value) ? { id: value } : { name: value };
}

function buildCreateBody(payload: ExportPayload, warehouseId: string, draft: boolean): Record<string, unknown> {
  const body: Record<string, unknown> = {
    title: payload.name,
    description: payload.description || payload.name,
    category_id: payload.category_id,
    save_mode: draft ? 'AS_DRAFT' : 'LISTING',
    main_images: payload.uploaded_images.slice(0, 9).map(uri => ({ uri })),
    package_weight: { value: weightValue(payload.weight), unit: 'KILOGRAM' },
    skus: payload.models.map(model => ({
      seller_sku: model.sku.slice(0, 50),
      sales_attributes: payload.has_variation
        ? model.attributes.map(a => ({ name: a.type_name.slice(0, 20), value_name: a.value }))
        : undefined,
      price: { amount: String(model.price || 0), currency: 'THB' },
      inventory: [{ warehouse_id: warehouseId, quantity: Math.max(0, model.stock || 0) }],
    })),
  };

  if (payload.brand_id) body.brand_id = payload.brand_id;
  if (payload.dimensions) {
    body.package_dimensions = {
      length: String(Math.max(1, Math.round(payload.dimensions.length))),
      width: String(Math.max(1, Math.round(payload.dimensions.width))),
      height: String(Math.max(1, Math.round(payload.dimensions.height))),
      unit: 'CENTIMETER',
    };
  }

  const productAttributes = Object.entries(payload.attributes)
    .map(([id, raw]) => ({
      id,
      values: (Array.isArray(raw) ? raw : [raw]).filter(v => String(v).trim() !== '').map(v => attributeValue(String(v))),
    }))
    .filter(a => a.values.length > 0);
  if (productAttributes.length > 0) body.product_attributes = productAttributes;

  return body;
}

// ── adapter ──────────────────────────────────────────────────────────────────

export const tiktokProductExportAdapter: ProductExportAdapter = {
  createApiPath: CREATE_PATH,

  async getCategories(account): Promise<MarketplaceCategory[]> {
    const c = await creds(account);
    const { data, error } = await tiktokApiRequest(c, 'GET', '/product/202309/categories', { locale: LOCALE });
    if (error) await fail(error);

    const categories = (data as { categories?: {
      id?: string; parent_id?: string; local_name?: string; is_leaf?: boolean; permission_statuses?: string[];
    }[] } | null)?.categories || [];

    return categories
      // หมวดที่ร้านลงไม่ได้ ไม่ควรโผล่ให้เลือกแล้วไปล้มตอนสร้าง
      .filter(c2 => !(c2.permission_statuses || []).includes('PROHIBITED'))
      .map(c2 => ({
        id: String(c2.id || ''),
        parent_id: c2.parent_id && c2.parent_id !== '0' ? String(c2.parent_id) : null,
        name: c2.local_name || '',
        is_leaf: c2.is_leaf === true,
      }))
      .filter(c2 => !!c2.id);
  },

  async getCategoryAttributes(account, categoryId): Promise<MarketplaceAttribute[]> {
    const c = await creds(account);
    const { data, error } = await tiktokApiRequest(
      c, 'GET', `/product/202309/categories/${encodeURIComponent(categoryId)}/attributes`, { locale: LOCALE },
    );
    if (error) await fail(error);

    const attributes = (data as { attributes?: {
      id?: string; name?: string; type?: string;
      // ⚠️ สเปกของ TikTok สะกด `is_requried` ผิดจริง — รับทั้งสองชื่อไว้
      is_requried?: boolean; is_required?: boolean;
      is_multiple_selection?: boolean;
      values?: { id?: string; name?: string }[];
    }[] } | null)?.attributes || [];

    return attributes
      // SALES_PROPERTY = ตัวเลือกของสินค้า (สี/ขนาด) ซึ่งมาจากตัวเลือกของเราอยู่แล้ว
      .filter(a => a.type !== 'SALES_PROPERTY')
      .map(a => {
        const options = (a.values || []).map(v => ({ id: String(v.id || ''), name: v.name || '' })).filter(v => !!v.id);
        return {
          id: String(a.id || ''),
          name: a.name || '',
          required: a.is_requried === true || a.is_required === true,
          input_type: options.length === 0 ? 'text' : a.is_multiple_selection ? 'multi' : 'select',
          options,
        } as MarketplaceAttribute;
      })
      .filter(a => !!a.id);
  },

  async searchBrands(account, query): Promise<MarketplaceBrand[]> {
    const c = await creds(account);
    const params: Record<string, string> = { page_size: '50' };
    if (query.trim()) params.brand_name = query.trim();

    const { data, error } = await tiktokApiRequest(c, 'GET', '/product/202309/brands', params);
    if (error) await fail(error);

    const brands = (data as { brands?: { id?: string; name?: string }[] } | null)?.brands || [];
    return brands.map(b => ({ id: String(b.id || ''), name: b.name || '' })).filter(b => !!b.id);
  },

  async uploadImage(account, imageUrl): Promise<string> {
    const c = await creds(account);

    const res = await fetch(imageUrl);
    if (!res.ok) throw new Error(`โหลดรูปจากคลังของเราไม่สำเร็จ (HTTP ${res.status})`);
    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';

    const form = new FormData();
    form.append('data', new Blob([buffer], { type: contentType }), `image.${ext}`);
    form.append('use_case', 'MAIN_IMAGE');

    const { data, error } = await tiktokMultipartRequest(c, '/product/202309/images/upload', form);
    if (error) await fail(error);

    const uri = (data as { uri?: string } | null)?.uri;
    if (!uri) throw new Error('TikTok ไม่ได้คืน uri ของรูปที่อัปโหลด');
    return uri;
  },

  async createProduct(account, payload, opts): Promise<CreateProductResult> {
    const c = await creds(account);
    await assertShopReady(c);

    const warehouseId = await resolveSalesWarehouseId(account, c);
    const body = buildCreateBody(payload, warehouseId, opts.draft);

    const { data, error } = await tiktokApiRequest(c, 'POST', CREATE_PATH, {}, body);
    if (error) await fail(error);

    const result = data as {
      product_id?: string;
      skus?: { id?: string; seller_sku?: string }[];
      warnings?: { message?: string }[];
    } | null;

    const productId = result?.product_id;
    if (!productId) throw new Error('TikTok ไม่ได้คืน product_id');

    const createdSkus = result?.skus || [];
    const warnings = (result?.warnings || []).map(w => w.message || '').filter(Boolean);

    // จับคู่กลับด้วย seller_sku (ตัวที่เราส่งไปเอง) — ไม่มีค่อยยึดลำดับ
    const models = payload.models.map((model, index) => {
      const matched = createdSkus.find(s => s.seller_sku && s.seller_sku === model.sku.slice(0, 50)) || createdSkus[index];
      if (!matched?.id) warnings.push(`ตัวเลือก "${model.name}" ไม่ได้รับ sku id กลับมาจาก TikTok`);
      return {
        variation_id: model.variation_id,
        external_model_id: String(matched?.id || ''),
        external_sku: matched?.seller_sku || model.sku,
      };
    }).filter(m => !!m.external_model_id);

    return {
      external_item_id: String(productId),
      models,
      warnings,
      platform_data: { warehouse_id: warehouseId, save_mode: opts.draft ? 'AS_DRAFT' : 'LISTING' },
      draft: opts.draft,
    };
  },

  linkPayload(payload, result) {
    return {
      external_item_status: result.draft ? 'DRAFT' : 'ACTIVATE',
      platform_description: payload.description || null,
      weight: payload.weight,
      platform_data: {
        // ขา push สต็อกอ่านคลังจากคีย์นี้ (ดู `lib/tiktok/stock-adapter.ts`)
        tiktok_warehouse_ids: [(result.platform_data?.warehouse_id as string) || ''].filter(Boolean),
      },
    };
  },
};
