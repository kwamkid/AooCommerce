// Lazada — ตัวต่อส่งสินค้าขึ้นร้าน (ยิง API + แปลงรูป เท่านั้น)
// ตรรกะร่วมอยู่ `lib/marketplace/product-export.ts` — ห้ามย้ายมาไว้ที่นี่
//
// ของที่เป็น "Lazada เท่านั้น" และต้องอยู่ในไฟล์นี้:
//   · payload เป็น **XML ก้อนเดียวส่งเป็น query param** (`lazadaApiRequest` เซ็นให้อยู่แล้ว)
//   · รูปต้อง "ย้าย" เข้า CDN ของ Lazada ก่อน (`/image/migrate` — เราส่ง URL ของเราไป)
//   · `/product/pre/check` ก่อนสร้างจริง (เจอปัญหาก่อนได้ประกาศเสีย)
//   · **ไม่มีโหมดร่าง** — โหมด "ยังไม่เปิดขาย" = สร้างแล้วยิง `/product/deactivate` ต่อทันที
//   · ตัวเลือก (สี/ขนาด) เป็น element ลูกของ `<Sku>` ที่ **ชื่อต้องตรงกับ sale prop ของหมวด**
//     (`/category/attributes/get` แถวที่ `is_sale_prop = "1"`) ไม่ใช่ชื่อประเภทตัวเลือกของเรา

import {
  ensureValidToken,
  lazadaApiRequest,
  escapeXml,
  type LazadaAccountRow,
  type LazadaCredentials,
} from '@/lib/lazada/api';
import type {
  CreateProductResult,
  ExportPayload,
  MarketplaceAttribute,
  MarketplaceBrand,
  MarketplaceCategory,
  ProductExportAccount,
  ProductExportAdapter,
} from '@/lib/marketplace/product-export-adapter';

const asLazadaAccount = (account: ProductExportAccount) => account as unknown as LazadaAccountRow;

const CREATE_PATH = '/product/create';
/** Lazada รับรูปได้สูงสุด 8 ใบต่อสินค้า (error 4169) */
const MAX_IMAGES = 8;

async function creds(account: ProductExportAccount): Promise<LazadaCredentials> {
  return ensureValidToken(asLazadaAccount(account));
}

function languageCode(region: string): string {
  return region.toLowerCase() === 'th' ? 'th_TH' : 'en_US';
}

// ── หมวดหมู่ (แคชต่อภูมิภาค 1 ชม.) ────────────────────────────────────────────

interface LazadaCategoryNode {
  category_id: number | string;
  name?: string;
  leaf?: boolean;
  var?: boolean;
  children?: LazadaCategoryNode[];
}

const categoryTreeCache = new Map<string, { categories: MarketplaceCategory[]; fetched_at: number }>();
const CATEGORY_TTL_MS = 60 * 60 * 1000;

function flattenCategories(nodes: LazadaCategoryNode[], parentId: string | null, out: MarketplaceCategory[]): void {
  for (const node of nodes) {
    const id = String(node.category_id ?? '');
    if (!id) continue;
    const children = node.children || [];
    out.push({
      id,
      parent_id: parentId,
      name: node.name || '',
      // `leaf` ไม่ได้ติดมาทุกแถว — ไม่มีลูก = ปลายกิ่ง
      is_leaf: node.leaf === true || children.length === 0,
    });
    if (children.length > 0) flattenCategories(children, id, out);
  }
}

// ── attribute ของหมวด ────────────────────────────────────────────────────────

interface LazadaAttributeRaw {
  name?: string;
  label?: string;
  input_type?: string;
  attribute_type?: string;
  is_mandatory?: string | number;
  is_sale_prop?: string | number;
  options?: { id?: string; name?: string; en_name?: string }[];
}

/** Lazada ส่งธงมาเป็น string "1"/"0" — `Number()` ตรง ๆ ก็ได้แต่ต้องกันค่าว่าง */
const isOn = (v: string | number | undefined): boolean => String(v ?? '') === '1';

async function fetchCategoryAttributes(c: LazadaCredentials, categoryId: string): Promise<LazadaAttributeRaw[]> {
  const { data, error } = await lazadaApiRequest(c, 'GET', '/category/attributes/get', {
    primary_category_id: categoryId,
    language_code: languageCode(c.region),
  });
  if (error) throw new Error(error);
  return Array.isArray(data) ? (data as LazadaAttributeRaw[]) : [];
}

function toInputType(raw: LazadaAttributeRaw): MarketplaceAttribute['input_type'] {
  if ((raw.input_type || '').toLowerCase().includes('multi')) return 'multi';
  return (raw.options || []).length > 0 ? 'select' : 'text';
}

// ── แบรนด์ (ไล่หน้าเท่าที่จำเป็นแล้วจำไว้) ─────────────────────────────────────

const BRAND_PAGE_SIZE = 200;
const BRAND_MAX_PAGES_PER_SEARCH = 10;

const brandCache = new Map<string, { items: MarketplaceBrand[]; nextStartRow: number; exhausted: boolean }>();

/**
 * Lazada ไม่มีพารามิเตอร์ค้นชื่อแบรนด์ — มีแต่ไล่ทีละหน้า (ทั้งระบบมีหลักหมื่น)
 * จึงไล่เท่าที่ยังหาไม่เจอ แล้ว**เก็บของที่ไล่มาแล้วไว้ในหน่วยความจำ** ให้ครั้งต่อไปเร็วขึ้น
 */
async function searchBrandsPaged(c: LazadaCredentials, query: string): Promise<MarketplaceBrand[]> {
  const key = c.region;
  const state = brandCache.get(key) || { items: [], nextStartRow: 0, exhausted: false };
  brandCache.set(key, state);

  const q = query.trim().toLowerCase();
  const match = (b: MarketplaceBrand) => !q || b.name.toLowerCase().includes(q);

  let hits = state.items.filter(match);
  let pages = 0;
  while (hits.length < 50 && !state.exhausted && pages < BRAND_MAX_PAGES_PER_SEARCH) {
    const { data, error } = await lazadaApiRequest(c, 'GET', '/category/brands/query', {
      startRow: state.nextStartRow,
      pageSize: BRAND_PAGE_SIZE,
    });
    if (error) throw new Error(error);

    const rows = ((data as { module?: { brand_id?: string; name?: string }[] } | null)?.module) || [];
    if (rows.length === 0) { state.exhausted = true; break; }

    state.items.push(...rows.map(r => ({ id: String(r.brand_id || ''), name: r.name || '' })).filter(b => !!b.id));
    state.nextStartRow += rows.length;
    if (rows.length < BRAND_PAGE_SIZE) state.exhausted = true;

    hits = state.items.filter(match);
    pages++;
  }

  return hits.slice(0, 50);
}

// ── XML payload ──────────────────────────────────────────────────────────────

/** ค่าอิสระของผู้ใช้อาจมี `&` หรือ `<` — ห่อ CDATA ไว้ทั้งก้อน (error 5 ของ Lazada) */
function cdata(value: string): string {
  return `<![CDATA[${String(value).replace(/]]>/g, ']]]]><![CDATA[>')}]]>`;
}

function tag(name: string, value: string | number): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

interface LazadaXmlContext {
  /** ชื่อประเภทตัวเลือกของเรา → ชื่อ sale prop ของหมวดนั้น (เช่น 'สี' → 'color_family') */
  salePropByTypeName: Map<string, string>;
}

function buildProductXml(payload: ExportPayload, ctx: LazadaXmlContext): string {
  const images = payload.uploaded_images.slice(0, MAX_IMAGES);

  const attributeLines = [
    `<name>${cdata(payload.name)}</name>`,
    `<description>${cdata(payload.description || payload.name)}</description>`,
    `<short_description>${cdata((payload.description || payload.name).slice(0, 500))}</short_description>`,
    `<brand>${cdata(payload.brand_name || 'No Brand')}</brand>`,
  ];
  for (const [name, raw] of Object.entries(payload.attributes)) {
    const values = (Array.isArray(raw) ? raw : [raw]).filter(v => String(v).trim() !== '');
    if (values.length === 0) continue;
    // Lazada รับค่าหลายค่าเป็นสตริงคั่นด้วยคอมมาในแท็กเดียว
    attributeLines.push(`<${name}>${cdata(values.join(','))}</${name}>`);
  }

  const skus = payload.models.map(model => {
    const saleProps = payload.has_variation
      ? model.attributes
          .map(a => {
            const propName = ctx.salePropByTypeName.get(a.type_name);
            return propName ? tag(propName, a.value) : '';
          })
          .join('')
      : '';
    // หมายเหตุ: รูปเฉพาะตัวเลือกต้องผ่าน `/image/migrate` อีกชุด — ยังไม่ส่ง
    // (รูปหลักของสินค้าใช้ร่วมกันทุกตัวเลือกไปก่อน)
    return '<Sku>'
      + tag('SellerSku', model.sku)
      + saleProps
      + tag('quantity', Math.max(0, model.stock || 0))
      + tag('price', model.price || 0)
      + tag('package_length', Math.max(1, Math.round(payload.dimensions?.length || 10)))
      + tag('package_width', Math.max(1, Math.round(payload.dimensions?.width || 10)))
      + tag('package_height', Math.max(1, Math.round(payload.dimensions?.height || 10)))
      + tag('package_weight', payload.weight)
      + '</Sku>';
  }).join('');

  return '<Request><Product>'
    + tag('PrimaryCategory', payload.category_id)
    + `<Images>${images.map(url => `<Image>${escapeXml(url)}</Image>`).join('')}</Images>`
    + `<Attributes>${attributeLines.join('')}</Attributes>`
    + `<Skus>${skus}</Skus>`
    + '</Product></Request>';
}

/** ล้มรายตัวของ Lazada อยู่ใน `detail[]` — รหัส error ตัวเดียวบอกอะไรไม่ได้เลย */
function detailErrors(raw: Record<string, unknown> | undefined): string[] {
  const detail = (raw?.detail ?? (raw?.data as Record<string, unknown> | undefined)?.detail) as
    | { sku_id?: string | number; seller_sku?: string; message?: string; field?: string }[]
    | undefined;
  return (detail || [])
    .filter(d => !!d?.message)
    .map(d => `${d.seller_sku || d.sku_id || d.field || 'SKU'}: ${d.message}`);
}

// ── adapter ──────────────────────────────────────────────────────────────────

export const lazadaProductExportAdapter: ProductExportAdapter = {
  createApiPath: CREATE_PATH,

  async getCategories(account): Promise<MarketplaceCategory[]> {
    const c = await creds(account);
    const cached = categoryTreeCache.get(c.region);
    if (cached && Date.now() - cached.fetched_at < CATEGORY_TTL_MS) return cached.categories;

    const { data, error } = await lazadaApiRequest(c, 'GET', '/category/tree/get', {
      language_code: languageCode(c.region),
    });
    if (error) throw new Error(error);

    const out: MarketplaceCategory[] = [];
    flattenCategories(Array.isArray(data) ? (data as LazadaCategoryNode[]) : [], null, out);
    categoryTreeCache.set(c.region, { categories: out, fetched_at: Date.now() });
    return out;
  },

  async getCategoryAttributes(account, categoryId): Promise<MarketplaceAttribute[]> {
    const c = await creds(account);
    const rows = await fetchCategoryAttributes(c, categoryId);

    return rows
      // sale prop = ตัวเลือกของสินค้า (สี/ขนาด) ซึ่งมาจากตัวเลือกของเราอยู่แล้ว ไม่ต้องให้กรอกซ้ำ
      .filter(a => !isOn(a.is_sale_prop) && !!a.name)
      // ช่องพวกนี้ชั้นกลางกรอกให้อยู่แล้วจากข้อมูลสินค้า
      .filter(a => !['name', 'description', 'short_description', 'brand'].includes(String(a.name)))
      .map(a => ({
        id: String(a.name),
        name: a.label || String(a.name),
        required: isOn(a.is_mandatory),
        input_type: toInputType(a),
        options: (a.options || []).map(o => ({ id: o.name || String(o.id || ''), name: o.name || o.en_name || '' })).filter(o => !!o.id),
      }));
  },

  async searchBrands(account, query): Promise<MarketplaceBrand[]> {
    const c = await creds(account);
    return searchBrandsPaged(c, query);
  },

  async uploadImage(account, imageUrl): Promise<string> {
    const c = await creds(account);
    // Lazada ดึงรูปจาก URL ของเราเอง — URL ต้องเปิดสาธารณะและตอบ 200 (error 302/304)
    const xml = `<Request><Image><Url>${escapeXml(imageUrl)}</Url></Image></Request>`;
    const { data, error } = await lazadaApiRequest(c, 'POST', '/image/migrate', { payload: xml });
    if (error) throw new Error(error);

    const url = (data as { image?: { url?: string } } | null)?.image?.url;
    if (!url) throw new Error('Lazada ไม่ได้คืน URL ของรูปที่ย้ายเข้าระบบ');
    return url;
  },

  async createProduct(account, payload, opts): Promise<CreateProductResult> {
    const c = await creds(account);
    const warnings: string[] = [];

    // ชื่อ element ของตัวเลือกต้องเป็นชื่อ sale prop ของหมวด ไม่ใช่ชื่อประเภทตัวเลือกของเรา
    const salePropByTypeName = new Map<string, string>();
    if (payload.has_variation) {
      const attrs = await fetchCategoryAttributes(c, payload.category_id);
      const saleProps = attrs.filter(a => isOn(a.is_sale_prop) && !!a.name).map(a => String(a.name));
      const typeNames: string[] = [];
      for (const model of payload.models) {
        for (const a of model.attributes) if (!typeNames.includes(a.type_name)) typeNames.push(a.type_name);
      }
      typeNames.forEach((typeName, index) => {
        const prop = saleProps[index];
        if (prop) {
          salePropByTypeName.set(typeName, prop);
          warnings.push(`ตัวเลือก "${typeName}" ถูกส่งขึ้น Lazada เป็น "${prop}" ตามหมวดที่เลือก`);
        } else {
          warnings.push(`หมวดนี้ของ Lazada ไม่มีช่องตัวเลือกรองรับ "${typeName}" — ตัวเลือกนี้ถูกข้าม`);
        }
      });
    }

    const xml = buildProductXml(payload, { salePropByTypeName });

    // เช็คก่อนสร้าง — ล้มตรงนี้ยังไม่มีประกาศเสียค้างอยู่บนร้าน
    const pre = await lazadaApiRequest(c, 'POST', '/product/pre/check', { payload: xml });
    if (pre.error) {
      const details = detailErrors(pre.raw);
      throw new Error(details.length > 0 ? `${pre.error} — ${details.join(' · ')}` : pre.error);
    }

    const { data, error, raw } = await lazadaApiRequest(c, 'POST', CREATE_PATH, { payload: xml });
    if (error) {
      const details = detailErrors(raw);
      throw new Error(details.length > 0 ? `${error} — ${details.join(' · ')}` : error);
    }

    const result = data as {
      item_id?: string | number;
      sku_list?: { sku_id?: string | number; seller_sku?: string; shop_sku?: string }[];
    } | null;

    const itemId = result?.item_id;
    if (!itemId) throw new Error('Lazada ไม่ได้คืน item_id');
    warnings.push(...detailErrors(raw));

    const skuList = result?.sku_list || [];
    const models = payload.models.map((model, index) => {
      const matched = skuList.find(s => s.seller_sku && s.seller_sku === model.sku) || skuList[index];
      if (!matched?.sku_id) warnings.push(`ตัวเลือก "${model.name}" ไม่ได้รับ SkuId กลับมาจาก Lazada`);
      return {
        variation_id: model.variation_id,
        external_model_id: String(matched?.sku_id || ''),
        external_sku: matched?.seller_sku || model.sku,
      };
    }).filter(m => !!m.external_model_id);

    // Lazada ไม่มีโหมดร่าง — "ยังไม่เปิดขาย" = สร้างแล้วปิดขายทันที
    let deactivated = false;
    if (opts.draft) {
      const body = `<Request><Product>${tag('ItemId', String(itemId))}</Product></Request>`;
      const { error: offError } = await lazadaApiRequest(c, 'POST', '/product/deactivate', { apiRequestBody: body });
      if (offError) warnings.push(`สร้างสินค้าแล้วแต่ปิดขายไม่สำเร็จ: ${offError} — ปิดเองใน Lazada Seller Center`);
      else deactivated = true;
    }

    return {
      external_item_id: String(itemId),
      models,
      warnings,
      platform_data: { sale_prop_map: Object.fromEntries(salePropByTypeName) },
      draft: deactivated,
    };
  },

  async deactivate(account, externalItemId): Promise<void> {
    const c = await creds(account);
    const body = `<Request><Product>${tag('ItemId', externalItemId)}</Product></Request>`;
    const { error } = await lazadaApiRequest(c, 'POST', '/product/deactivate', { apiRequestBody: body });
    if (error) throw new Error(error);
  },

  linkPayload(payload, result) {
    return {
      external_item_status: result.draft ? 'InActive' : 'Active',
      platform_description: payload.description || null,
      weight: payload.weight,
    };
  },
};
