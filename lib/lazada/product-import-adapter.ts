// Lazada — ตัวต่อนำเข้าสินค้า (ยิง API + แปลงรูป เท่านั้น)
// ตรรกะร่วมอยู่ `lib/marketplace/product-import.ts` — ห้ามย้ายมาไว้ที่นี่
//
// Lazada คืน **ทุกอย่างในคอลเดียว** (`/products/get`): ชื่อ ไทย/อังกฤษ · description HTML ·
// รูป product · ทุก SKU พร้อม saleProp/ราคา/สต็อก/รูป → ไม่ต้องยิง detail รายตัวตอนไล่หน้า
// (แต่ `fetchDetails` ยังต้องมี เพราะผู้ใช้เลือกสินค้าข้ามหน้าได้)

import {
  ensureValidToken,
  getLazadaProducts,
  lazadaApiRequest,
  parseLazadaImages,
  type LazadaAccountRow,
  type LazadaProduct,
  type LazadaSku,
} from '@/lib/lazada/api';
import type {
  MarketplaceImportItem,
  MarketplaceImportModel,
  ProductImportAccount,
  ProductImportAdapter,
  ProductImportPage,
} from '@/lib/marketplace/product-import-adapter';

const asLazadaAccount = (account: ProductImportAccount) => account as unknown as LazadaAccountRow;

/** offset ของ Lazada ตันที่ 10000 (เอกสารระบุเอง) */
const MAX_OFFSET = 10000;

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

/** มีตัวเลือกจริงไหม — ดูจาก saleProp ไม่ใช่จำนวน SKU (บาง shop มี SKU เดียวแต่มี saleProp) */
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

function toImportItem(product: LazadaProduct): MarketplaceImportItem {
  const skus = product.skus || [];
  const images = parseLazadaImages(product.images);
  const variation = hasVariation(product);

  const models: MarketplaceImportModel[] = skus.map(sku => {
    const listPrice = Number(sku.price || 0);
    const special = Number(sku.special_price || 0);
    return {
      external_model_id: String(sku.SkuId),
      name: skuLabel(sku),
      sku: (sku.SellerSku || '').trim(),
      // ราคาขายจริง = ราคาโปรเมื่อถูกกว่าจริง · ราคาตั้ง = `price` เสมอ
      price: special > 0 && special < listPrice ? special : listPrice,
      original_price: listPrice,
      stock: Number(sku.quantity ?? sku.Available ?? 0),
      image: skuImages(sku)[0] || null,
      attributes: sku.saleProp || {},
    };
  });

  return {
    external_item_id: String(product.item_id),
    name: productName(product),
    sku: (skus.find(s => s.SellerSku)?.SellerSku || '').trim(),
    image: images[0] || null,
    images,
    price: models[0]?.price || 0,
    status: product.status || null,
    has_variation: variation,
    models,
    variation_type_names: variation ? salePropNames(product) : [],
    description: attrString(product, 'description') || null,
    category_id: product.primary_category != null ? String(product.primary_category) : null,
    category_name: null,
    brand_name: attrString(product, 'brand') || null,
    weight: Number(skus[0]?.package_weight || 0) || null,
    raw: product,
  };
}

export const lazadaProductImportAdapter: ProductImportAdapter = {
  listApiPath: '/products/get',
  codePrefix: 'LZ-',

  async listProducts(account, cursor, pageSize = 20): Promise<ProductImportPage> {
    const creds = await ensureValidToken(asLazadaAccount(account));
    const offset = Math.max(Number(cursor || 0) || 0, 0);
    const limit = Math.min(Math.max(pageSize, 1), 50);

    const page = await getLazadaProducts(creds, { offset, limit, filter: 'all' });
    if (page.error) throw new Error(page.error);

    const next = offset + page.products.length;
    const hasMore = page.products.length > 0 && next < page.total && next < MAX_OFFSET;

    return {
      items: page.products.map(toImportItem),
      total: page.total,
      nextCursor: hasMore ? String(next) : undefined,
    };
  },

  async fetchDetails(account, ids): Promise<MarketplaceImportItem[]> {
    const creds = await ensureValidToken(asLazadaAccount(account));
    const out: MarketplaceImportItem[] = [];
    // `/products/get` กรองตาม item_id ไม่ได้ — ดึงทีละใบด้วย `/product/item/get`
    // (throttle ของ Lazada อยู่ในตัว request helper แล้ว จึงยิงเรียงตัวไปเลย)
    for (const id of ids) {
      const { data, error } = await lazadaApiRequest(creds, 'GET', '/product/item/get', { item_id: id });
      if (error) throw new Error(`Lazada item ${id}: ${error}`);
      const product = (data || {}) as LazadaProduct;
      if (!product.item_id) throw new Error(`Lazada item ${id}: ไม่พบสินค้านี้ในร้าน`);
      out.push(toImportItem(product));
    }
    return out;
  },

  linkPayload(item, model) {
    const product = item.raw as LazadaProduct | undefined;
    const sku = (product?.skus || []).find(s => String(s.SkuId) === model.external_model_id);
    return {
      // Lazada: `platform_price` ยึดราคาตั้ง (`price`) ตามพฤติกรรมเดิมของ import
      platform_price: Number(sku?.price || 0) || null,
      platform_description: item.description || null,
      weight: Number(sku?.package_weight || 0) || null,
      // property ของหมวดหมู่มีเป็นสิบตัวและต่างกันทุกหมวด — เก็บทั้งก้อนไว้ ไม่ตัดทิ้ง
      platform_data: {
        category_id: item.category_id ?? null,
        brand_name: item.brand_name || null,
        name_en: product ? attrString(product, 'name_en') || null : null,
        short_description: product ? attrString(product, 'short_description') || null : null,
        video_url: product ? videoUrl(product) : null,
        sale_prop: sku?.saleProp || {},
        shop_sku: sku?.ShopSku || null,
        product_url: sku?.Url || null,
        attributes: product?.attributes || {},
      },
    };
  },
};
