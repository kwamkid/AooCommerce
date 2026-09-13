// Shopee — ตัวต่อส่งสินค้าขึ้นร้าน (ยิง API + แปลงรูป เท่านั้น)
// ตรรกะร่วมอยู่ `lib/marketplace/product-export.ts` — ห้ามย้ายมาไว้ที่นี่
//
// ของที่เป็น "Shopee เท่านั้น" และต้องอยู่ในไฟล์นี้:
//   · ช่องทางขนส่งที่ร้านเปิด (`logistic_info` บังคับตอน add_item)
//   · attribute บังคับของหมวด + **วนเติมตามที่ Shopee บ่นมาใน debug_message**
//   · ตัวเลือกเป็น tier variation (add_item ก่อน แล้ว init_tier_variation ทีหลัง)
//   · หา `model_id` จริงด้วย get_model_list (ไม่งั้น link จะเก็บเลข index ปลอม)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';
import { translateShopeeError } from '@/lib/shopee/errors';
import {
  ensureValidToken,
  uploadImageByUrl,
  addItem,
  initTierVariation,
  getShopeeLogistics,
  getShopeeCategories,
  getShopeeCategoryAttributes,
  shopeeApiRequest,
  type ShopeeAccountRow,
  type ShopeeCredentials,
} from '@/lib/shopee/api';
import type {
  CreateProductResult,
  ExportModel,
  ExportPayload,
  MarketplaceAttribute,
  MarketplaceCategory,
  ProductExportAccount,
  ProductExportAdapter,
} from '@/lib/marketplace/product-export-adapter';

const asShopeeAccount = (account: ProductExportAccount) => account as unknown as ShopeeAccountRow;

/** หนึ่งรายการใน `attribute_list` ของ add_item */
type AttributeEntry = {
  attribute_id: number;
  attribute_value_list: { value_id: number; original_value_name: string }[];
};

// ── ขนส่งที่ร้านเปิดไว้ (แคชในหน่วยความจำ 1 ชม.) ──────────────────────────────

let logisticsCache: {
  creds_key: string;
  channels: { logistics_channel_id: number; enabled: boolean }[];
  fetched_at: number;
} | null = null;

async function getEnabledLogistics(creds: ShopeeCredentials): Promise<number[]> {
  const cacheKey = `${creds.shop_id}`;
  const now = Date.now();

  if (logisticsCache && logisticsCache.creds_key === cacheKey && now - logisticsCache.fetched_at < 3600000) {
    return logisticsCache.channels.filter(ch => ch.enabled).map(ch => ch.logistics_channel_id);
  }

  const { data, error } = await getShopeeLogistics(creds);
  if (error) {
    console.error('[Shopee Export] อ่านช่องทางขนส่งไม่สำเร็จ:', error);
    return [];
  }

  const response = data as { logistics_channel_list?: { logistics_channel_id: number; enabled: boolean }[] };
  const channels = response.logistics_channel_list || [];
  logisticsCache = { creds_key: cacheKey, channels, fetched_at: now };

  return channels.filter(ch => ch.enabled).map(ch => ch.logistics_channel_id);
}

// ── attribute บังคับของหมวด ──────────────────────────────────────────────────

interface ShopeeAttributeRaw {
  attribute_id: number;
  original_attribute_name: string;
  display_attribute_name: string;
  is_mandatory: boolean;
  input_type: string;
  attribute_value_list?: { value_id: number; original_value_name: string; display_value_name: string }[];
}

/** แคชในหน่วยความจำ: categoryId → attribute_list ที่ใช้ส่งผ่านมาแล้วจริง */
const categoryAttributeCache = new Map<string, AttributeEntry[]>();

/**
 * หยิบ `shopee_attributes` ที่เคยใช้กับหมวดนี้จาก link เดิมของบริษัท
 * (สินค้าตัวที่สองในหมวดเดียวกันจะไม่ต้องยิง API ซ้ำ และได้ค่าที่ผ่านมาแล้วแน่ ๆ)
 */
async function getStoredCategoryAttributes(companyId: string, categoryId: number): Promise<AttributeEntry[] | null> {
  const { data } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('shopee_attributes')
    .eq('company_id', companyId)
    .eq('shopee_category_id', categoryId)
    .not('shopee_attributes', 'is', null)
    .limit(1)
    .maybeSingle();

  if (data?.shopee_attributes && Array.isArray(data.shopee_attributes)) {
    return data.shopee_attributes as AttributeEntry[];
  }
  return null;
}

async function fetchCategoryAttributes(creds: ShopeeCredentials, categoryId: number): Promise<ShopeeAttributeRaw[]> {
  const { data, error } = await getShopeeCategoryAttributes(creds, categoryId);
  if (error || !data) {
    console.error('[Shopee Export] อ่าน attribute ของหมวดไม่สำเร็จ:', error);
    return [];
  }
  return (data as { attribute_list?: ShopeeAttributeRaw[] }).attribute_list || [];
}

/**
 * ค่าเริ่มต้นของ attribute บังคับ — ลำดับ: link เดิม → แคช → ยิง API
 * (ตัวที่มีตัวเลือกให้เลือกใช้ตัวแรก · ตัวที่พิมพ์เองใช้ "N/A")
 */
async function getMandatoryAttributes(
  creds: ShopeeCredentials,
  categoryId: number,
  companyId: string,
): Promise<AttributeEntry[]> {
  const stored = await getStoredCategoryAttributes(companyId, categoryId);
  if (stored && stored.length > 0) return stored;

  const cached = categoryAttributeCache.get(`${companyId}:${categoryId}`);
  if (cached) return cached;

  const attributes = await fetchCategoryAttributes(creds, categoryId);
  const result: AttributeEntry[] = [];

  for (const attr of attributes.filter(a => a.is_mandatory)) {
    const values = attr.attribute_value_list || [];
    result.push({
      attribute_id: attr.attribute_id,
      attribute_value_list: values.length > 0
        ? [{ value_id: values[0].value_id, original_value_name: values[0].original_value_name }]
        : [{ value_id: 0, original_value_name: 'N/A' }],
    });
  }
  return result;
}

/**
 * ค่าที่ผู้ใช้กรอกในหน้า wizard ทับค่า default ของ attribute บังคับ
 * (`value_id` ของ Shopee คือ id ใน `options` ที่ `getCategoryAttributes` คืนไป
 *  ค่าที่ไม่ใช่ตัวเลข = ผู้ใช้พิมพ์เอง → value_id 0)
 */
function applyUserAttributes(base: AttributeEntry[], attributes: Record<string, string | string[]>): AttributeEntry[] {
  const out = [...base];
  for (const [attributeId, raw] of Object.entries(attributes)) {
    const id = Number(attributeId);
    if (!Number.isFinite(id) || id <= 0) continue;
    const values = (Array.isArray(raw) ? raw : [raw]).filter(v => String(v).trim() !== '');
    if (values.length === 0) continue;

    const list = values.map(v => {
      const numeric = Number(v);
      return Number.isFinite(numeric) && numeric > 0
        ? { value_id: numeric, original_value_name: '' }
        : { value_id: 0, original_value_name: String(v) };
    });

    const index = out.findIndex(a => a.attribute_id === id);
    if (index >= 0) out[index] = { attribute_id: id, attribute_value_list: list };
    else out.push({ attribute_id: id, attribute_value_list: list });
  }
  return out;
}

// ── payload ของ add_item ─────────────────────────────────────────────────────

function buildAddItemPayload(
  payload: ExportPayload,
  logisticsIds: number[],
  attributeList: AttributeEntry[],
  draft: boolean,
): Record<string, unknown> {
  const first = payload.models[0];
  // สินค้ามีตัวเลือก: สต็อกอยู่ที่ model — ตัวสินค้าตั้ง 0 (Shopee คิดรวมให้เอง)
  const stock = payload.has_variation ? 0 : first?.stock || 0;
  const price = Math.max(first?.price || 0, 1); // Shopee ราคาต่ำสุด = 1

  // Shopee บังคับคำอธิบาย 60–5000 ตัวอักษร
  let description = payload.description || payload.name;
  if (description.length < 60) {
    description = `${description}\n\nรายละเอียดสินค้า: ${payload.name} (${payload.code || 'N/A'})`;
    if (description.length < 60) description = description.padEnd(60, ' ');
  }

  const body: Record<string, unknown> = {
    original_price: price,
    description,
    item_name: payload.name.substring(0, 120), // เพดานของ Shopee
    seller_stock: [{ stock }],
    logistic_info: logisticsIds.map(id => ({ logistic_id: id, enabled: true })),
    weight: payload.weight,
    category_id: Number(payload.category_id),
    image: { image_id_list: payload.uploaded_images },
    // แบบร่าง = ลงประกาศแล้วปิดขายไว้ (Shopee ไม่มีสถานะ "ร่าง" จริง)
    item_status: draft ? 'UNLIST' : 'NORMAL',
    dimension: {
      package_length: Math.round(payload.dimensions?.length || 10),
      package_width: Math.round(payload.dimensions?.width || 10),
      package_height: Math.round(payload.dimensions?.height || 10),
    },
    condition: 'NEW',
    brand: {
      brand_id: Number(payload.brand_id) || 0, // 0 = No Brand
      original_brand_name: payload.brand_name || '',
    },
  };

  if (attributeList.length > 0) body.attribute_list = attributeList;
  if (!payload.has_variation && first?.sku) body.item_sku = first.sku;

  return body;
}

// ── ตัวเลือก (tier variation) ────────────────────────────────────────────────

function buildTierVariation(models: ExportModel[]) {
  const tierNames: string[] = [];
  const optionsByName = new Map<string, string[]>();

  for (const model of models) {
    for (const { type_name, value } of model.attributes) {
      if (!optionsByName.has(type_name)) {
        tierNames.push(type_name);
        optionsByName.set(type_name, []);
      }
      const options = optionsByName.get(type_name)!;
      if (!options.includes(value)) options.push(value);
    }
  }

  return {
    tierNames,
    tierVariation: tierNames.map(name => ({
      name,
      option_list: (optionsByName.get(name) || []).map(option => ({ option })),
    })),
    tierModels: models.map(model => ({
      tier_index: tierNames.map(name => {
        const value = model.attributes.find(a => a.type_name === name)?.value || '';
        return (optionsByName.get(name) || []).indexOf(value);
      }),
      seller_stock: [{ stock: model.stock || 0 }],
      original_price: model.price || 0,
      model_sku: model.sku || undefined,
    })),
  };
}

// ── รูป ──────────────────────────────────────────────────────────────────────

/**
 * อัปรูปหลายใบขึ้น media space (คงลำดับเดิม) — ยังถูกใช้โดย `sync-one-product.ts`
 * เวลาผลักรูปใหม่ขึ้นประกาศเดิม
 */
export async function uploadProductImages(
  creds: ShopeeCredentials,
  imageUrls: string[],
): Promise<{ image_id_list: string[]; errors: string[] }> {
  const errors: string[] = [];
  const urls = imageUrls.slice(0, 9); // Shopee รับสูงสุด 9 รูป

  const results = await parallelLimit(urls, async (url) => {
    try {
      const { data, error } = await uploadImageByUrl(creds, url);
      if (error) {
        errors.push(`อัปโหลดรูปไม่สำเร็จ: ${error}`);
        return null;
      }
      return (data as { image_info?: { image_id: string } }).image_info?.image_id || null;
    } catch (e) {
      errors.push(`อัปโหลดรูปไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
      return null;
    }
  }, 3);

  return { image_id_list: results.filter((id): id is string => id !== null), errors };
}

// ── adapter ──────────────────────────────────────────────────────────────────

export const shopeeProductExportAdapter: ProductExportAdapter = {
  createApiPath: '/api/v2/product/add_item',

  async getCategories(account): Promise<MarketplaceCategory[]> {
    const creds = await ensureValidToken(asShopeeAccount(account));
    const { data, error } = await getShopeeCategories(creds);
    if (error) throw new Error(await translateShopeeError(error));

    const list = (data as { category_list?: {
      category_id: number;
      parent_category_id: number;
      display_category_name: string;
      original_category_name: string;
      has_children: boolean;
    }[] }).category_list || [];

    // เก็บแคชให้ขา import ใช้ต่อ (ชื่อหมวดในแถว link มาจากตารางนี้)
    if (list.length > 0) {
      await supabaseAdmin.from('marketplace_category_cache').upsert({
        account_id: account.id,
        company_id: account.company_id,
        category_data: list,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'account_id' });
    }

    return list.map(c => ({
      id: String(c.category_id),
      parent_id: c.parent_category_id ? String(c.parent_category_id) : null,
      name: c.display_category_name || c.original_category_name,
      is_leaf: !c.has_children,
    }));
  },

  async getCategoryAttributes(account, categoryId): Promise<MarketplaceAttribute[]> {
    const creds = await ensureValidToken(asShopeeAccount(account));
    const attributes = await fetchCategoryAttributes(creds, Number(categoryId));
    return attributes.map(attr => {
      const options = (attr.attribute_value_list || []).map(v => ({
        id: String(v.value_id),
        name: v.display_value_name || v.original_value_name,
      }));
      const multi = /MULTI/i.test(attr.input_type || '');
      return {
        id: String(attr.attribute_id),
        name: attr.display_attribute_name || attr.original_attribute_name,
        required: attr.is_mandatory === true,
        input_type: options.length === 0 ? 'text' : multi ? 'multi' : 'select',
        options,
      };
    });
  },

  async uploadImage(account, imageUrl): Promise<string> {
    const creds = await ensureValidToken(asShopeeAccount(account));
    const { data, error } = await uploadImageByUrl(creds, imageUrl);
    if (error) throw new Error(await translateShopeeError(error));
    const imageId = (data as { image_info?: { image_id: string } }).image_info?.image_id;
    if (!imageId) throw new Error('Shopee ไม่ได้คืน image_id');
    return imageId;
  },

  async createProduct(account, payload, opts): Promise<CreateProductResult> {
    const creds = await ensureValidToken(asShopeeAccount(account));
    const warnings: string[] = [];
    const categoryId = Number(payload.category_id);

    const logisticsIds = await getEnabledLogistics(creds);
    if (logisticsIds.length === 0) {
      throw new Error('ไม่พบช่องทางขนส่งที่เปิดใช้งานในร้านนี้ — เปิดขนส่งใน Shopee Seller Center ก่อน');
    }

    let attributeList = applyUserAttributes(
      await getMandatoryAttributes(creds, categoryId, account.company_id),
      payload.attributes,
    );

    let body = buildAddItemPayload(payload, logisticsIds, attributeList, opts.draft);
    let addResult = await addItem(creds, body);

    // Shopee บอกชื่อ attribute ที่ขาดมาใน debug_message ทีละตัว — เติมแล้วยิงใหม่จนกว่าจะผ่าน
    let retries = 0;
    while (addResult.error && retries < 10) {
      const match = (addResult.debug_message || '').match(/Attribute is mandatory:\s*id:\s*(\d+),\s*name:\s*([^"}\]]+)/i);
      if (!match) break;

      const missingId = parseInt(match[1], 10);
      if (attributeList.some(a => a.attribute_id === missingId)) break; // เติมแล้วยังไม่ผ่าน = วนต่อไม่มีประโยชน์

      attributeList = [...attributeList, { attribute_id: missingId, attribute_value_list: [{ value_id: 0, original_value_name: 'N/A' }] }];
      warnings.push(`เติมคุณสมบัติบังคับ "${match[2].trim()}" ให้อัตโนมัติเป็น N/A`);
      body = buildAddItemPayload(payload, logisticsIds, attributeList, opts.draft);
      addResult = await addItem(creds, body);
      retries++;
    }

    if (addResult.error) throw new Error(await translateShopeeError(addResult.error));

    const itemId = (addResult.data as { item_id?: number })?.item_id;
    if (!itemId) throw new Error('Shopee ไม่ได้คืน item_id');

    categoryAttributeCache.set(`${account.company_id}:${categoryId}`, attributeList);

    // สินค้าเดี่ยว: Shopee ใช้ model_id 0
    if (!payload.has_variation || payload.models.length <= 1) {
      return {
        external_item_id: String(itemId),
        models: [{ variation_id: payload.models[0]?.variation_id ?? null, external_model_id: '0' }],
        warnings,
        platform_data: { attributes: attributeList },
        draft: opts.draft,
      };
    }

    // สินค้ามีตัวเลือก: Shopee ให้รอ 5 วินาทีหลัง add_item ก่อนเรียก init_tier_variation
    await new Promise(resolve => setTimeout(resolve, 5000));
    const { tierNames, tierVariation, tierModels } = buildTierVariation(payload.models);

    if (tierNames.length === 0) {
      warnings.push('ไม่พบชื่อประเภทตัวเลือกของสินค้านี้ — สร้างบนร้านเป็นสินค้าเดี่ยว');
      return {
        external_item_id: String(itemId),
        models: [{ variation_id: payload.models[0]?.variation_id ?? null, external_model_id: '0' }],
        warnings,
        platform_data: { attributes: attributeList },
        draft: opts.draft,
      };
    }

    const { error: tierError } = await initTierVariation(creds, itemId, tierVariation, tierModels);
    if (tierError) {
      // สินค้าถูกสร้างไปแล้ว — ไม่ล้มทั้งใบ แต่ต้องบอกให้ไปเติมตัวเลือกเองบนร้าน
      warnings.push(`สร้างตัวเลือกบนร้านไม่สำเร็จ: ${await translateShopeeError(tierError)}`);
      return {
        external_item_id: String(itemId),
        models: [{ variation_id: payload.models[0]?.variation_id ?? null, external_model_id: '0' }],
        warnings,
        platform_data: { attributes: attributeList },
        draft: opts.draft,
      };
    }

    // model_id จริงต้องถามกลับ — ถ้าเก็บเลข index ไว้ ขา push สต็อกจะยิงใส่ model ที่ไม่มีอยู่
    const models: CreateProductResult['models'] = [];
    try {
      const { data: modelData } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_model_list', { item_id: itemId });
      const shopeeModels = (modelData as { model?: { model_id: number; model_sku: string }[] })?.model || [];
      payload.models.forEach((model, index) => {
        const matched = (model.sku && shopeeModels.find(m => m.model_sku === model.sku)) || shopeeModels[index];
        models.push({
          variation_id: model.variation_id,
          external_model_id: matched ? String(matched.model_id) : String(index),
          external_sku: matched?.model_sku || model.sku,
        });
      });
    } catch (e) {
      warnings.push(`อ่าน model_id จาก Shopee ไม่สำเร็จ: ${e instanceof Error ? e.message : 'ไม่ทราบสาเหตุ'}`);
      payload.models.forEach((model, index) => {
        models.push({ variation_id: model.variation_id, external_model_id: String(index) });
      });
    }

    return {
      external_item_id: String(itemId),
      models,
      warnings,
      platform_data: { attributes: attributeList },
      draft: opts.draft,
    };
  },

  linkPayload(payload, result) {
    const attributes = (result.platform_data?.attributes as AttributeEntry[] | undefined) || null;
    return {
      external_item_status: result.draft ? 'UNLIST' : 'NORMAL',
      platform_description: payload.description || null,
      weight: payload.weight,
      shopee_category_id: Number(payload.category_id) || null,
      shopee_category_name: payload.category_name || null,
      shopee_attributes: attributes && attributes.length > 0 ? attributes : null,
      shopee_brand_id: Number(payload.brand_id) || null,
      shopee_brand_name: payload.brand_name || null,
    };
  },
};
