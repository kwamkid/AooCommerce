import { supabaseAdmin } from '@/lib/supabase-admin';
import { productDisplayName } from '@/lib/product-display';

// การค้นของ "การ์ดในแชท" ที่ทุก marketplace ใช้ร่วมกัน — **อ่านจากฐานข้อมูลเราเท่านั้น
// ไม่ยิง API ของแพลตฟอร์ม** (การถามแพลตฟอร์มต่อเป็นเรื่องของ lib/<platform>/chat-enrich.ts
// ซึ่งรู้จัก token/โควตาของตัวเอง)
//
// การ์ด item/order ที่แพลตฟอร์มส่งมาจะมีแต่ id ที่พนักงานอ่านไม่ออก ต้องแปลงเป็น
// "สินค้าตัวไหนของเรา / ออเดอร์ใบไหนของเรา" ตั้งแต่ตอนบันทึกข้อความ ไม่ใช่ให้หน้าจอ
// ไปยิงหาเอง — ตัวแปลงนั้นเหมือนกันทุกแพลตฟอร์ม จึงอยู่ที่นี่ที่เดียว

export type ChatEnrichPlatform = 'shopee' | 'lazada' | 'tiktok';

/** สินค้าในระบบเราที่ผูกกับ item ของแพลตฟอร์ม */
export interface LinkedProductInfo {
  product_id: string;
  variation_id: string | null;
  /** ชื่อที่พนักงานอ่านรู้เรื่อง (ชื่อในระบบเรา > ชื่อที่ platform link เก็บไว้) */
  name: string | null;
  image_url: string | null;
  /** ราคาขายของเรา — ไม่มีก็ตกไปใช้ราคาที่ link เก็บไว้ */
  price: number | null;
}

/** ออเดอร์ในระบบเราที่ sync มาจากแพลตฟอร์มแล้ว */
export interface SyncedOrderInfo {
  order_id: string;
  order_number?: string;
  order_status?: string;
  payment_status?: string;
  total_amount?: number;
}

/**
 * รูปของ variation ก่อน ถ้าไม่มีค่อยรูประดับ product
 * (การ์ดในแชทอ้างถึง "สินค้า" ทั้งตัวบนแพลตฟอร์ม ไม่ใช่ variation เดียว)
 */
export async function findProductImageUrl(
  companyId: string,
  productId: string | null,
  variationId: string | null
): Promise<string | null> {
  const filters: string[] = [];
  if (variationId) filters.push(`variation_id.eq.${variationId}`);
  if (productId) filters.push(`and(product_id.eq.${productId},variation_id.is.null)`);
  if (filters.length === 0) return null;

  const { data } = await supabaseAdmin
    .from('product_images')
    .select('image_url, variation_id, sort_order')
    .eq('company_id', companyId)
    .or(filters.join(','))
    .order('sort_order', { ascending: true });

  if (!data || data.length === 0) return null;
  const variationImage = variationId ? data.find(r => r.variation_id === variationId) : null;
  return (variationImage || data[0]).image_url || null;
}

/**
 * ประกอบข้อมูลการ์ดจาก "สินค้าในระบบเรา" ที่รู้ id แล้ว
 *
 * ใช้ร่วมทุกทางที่หาสินค้าเจอ (link ของ marketplace · retailer_id ของ Facebook Shop)
 * — ชื่อ/รูป/ราคาต้องมาจากที่เดียวกันเสมอ ไม่งั้นการ์ดของคนละช่องทางจะพูดคนละราคา
 * `fallback` = ค่าที่ช่องทางนั้นส่งมาเอง ใช้เมื่อของเราไม่มี
 */
async function buildProductInfo(
  companyId: string,
  productId: string,
  variationId: string | null,
  fallback?: { name?: string | null; image?: string | null; price?: number | null }
): Promise<LinkedProductInfo> {
  const [{ data: product }, { data: variation }] = await Promise.all([
    supabaseAdmin.from('products').select('id, name, code').eq('id', productId).maybeSingle(),
    variationId
      ? supabaseAdmin
          .from('product_variations')
          .select('id, variation_label, sku, attributes, default_price, discount_price')
          .eq('id', variationId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const name = product
    ? productDisplayName({
        product_name: product.name,
        product_code: product.code,
        variation_label: variation?.variation_label ?? null,
        sku: variation?.sku ?? null,
        attributes: (variation?.attributes as Record<string, string> | null) ?? null,
      })
    : fallback?.name || null;

  const ourPrice = variation
    ? (Number(variation.discount_price) > 0 ? Number(variation.discount_price) : Number(variation.default_price))
    : null;

  return {
    product_id: productId,
    variation_id: variationId,
    name: name || fallback?.name || null,
    image_url:
      (await findProductImageUrl(companyId, productId, variationId)) ||
      fallback?.image ||
      null,
    price: ourPrice && ourPrice > 0 ? ourPrice : (fallback?.price ?? null),
  };
}

/**
 * id สินค้าของแพลตฟอร์ม → สินค้าในระบบเรา
 *
 * `externalModelId` (model/sku/variation ของแพลตฟอร์ม) เป็นตัวเลือก — ส่งมาเมื่อการ์ด
 * บอกถึง variation ตัวใดตัวหนึ่ง จะได้ราคา/รูปของตัวนั้นจริง ๆ · หา variation ที่ระบุ
 * ไม่เจอให้ตกไปใช้ link ตัวใดตัวหนึ่งของ item เดียวกัน (ดีกว่าคืนการ์ดเปล่า)
 */
export async function findLinkedProduct(
  companyId: string,
  platform: ChatEnrichPlatform,
  externalItemId: string,
  externalModelId?: string | null
): Promise<LinkedProductInfo | null> {
  const selectLink = () =>
    supabaseAdmin
      .from('marketplace_product_links')
      .select('product_id, variation_id, platform_product_name, platform_price, platform_primary_image')
      .eq('company_id', companyId)
      .eq('platform', platform)
      .eq('external_item_id', externalItemId);

  let link: {
    product_id: string | null;
    variation_id: string | null;
    platform_product_name: string | null;
    platform_price: number | string | null;
    platform_primary_image: string | null;
  } | null = null;

  if (externalModelId) {
    const { data } = await selectLink().eq('external_model_id', externalModelId).limit(1).maybeSingle();
    link = data ?? null;
  }
  if (!link) {
    const { data } = await selectLink().limit(1).maybeSingle();
    link = data ?? null;
  }
  if (!link?.product_id) return null;

  return buildProductInfo(companyId, link.product_id, link.variation_id ?? null, {
    name: link.platform_product_name,
    image: link.platform_primary_image,
    price: Number(link.platform_price) || null,
  });
}

/**
 * รหัสสินค้าที่ร้านตั้งไว้ในแคตตาล็อกของ Facebook/Instagram Shop (`retailer_id`)
 * → สินค้าในระบบเรา
 *
 * Facebook ไม่มีตาราง link แบบ marketplace (สินค้าอยู่ใน Commerce Manager ไม่ได้ผูก
 * กับเรา) — สิ่งเดียวที่โยงกลับได้คือรหัสที่ร้านพิมพ์เอง จึงไล่หาจาก SKU ของ variation
 * ก่อน แล้วค่อยรหัสสินค้า · หาไม่เจอ = คืน null แล้วใช้ชื่อ/รูป/ราคาที่ Facebook ส่งมา
 */
export async function findProductByRetailerId(
  companyId: string,
  retailerId: string
): Promise<LinkedProductInfo | null> {
  const code = (retailerId || '').trim();
  if (!code) return null;

  const { data: variation } = await supabaseAdmin
    .from('product_variations')
    .select('id, product_id')
    .eq('company_id', companyId)
    .eq('sku', code)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();
  if (variation?.product_id) return buildProductInfo(companyId, variation.product_id, variation.id);

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', code)
    .limit(1)
    .maybeSingle();
  if (product?.id) return buildProductInfo(companyId, product.id, null);

  return null;
}

/** เลขออเดอร์ของแพลตฟอร์ม → ออเดอร์ที่ sync เข้าระบบแล้ว (ไม่เจอ = ยังไม่ sync) */
export async function findSyncedOrder(
  companyId: string,
  source: string,
  externalOrderSn: string
): Promise<SyncedOrderInfo | null> {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, order_status, payment_status, total_amount')
    .eq('company_id', companyId)
    .eq('source', source)
    .eq('external_order_sn', externalOrderSn)
    .limit(1)
    .maybeSingle();

  if (!order) return null;
  return {
    order_id: order.id,
    order_number: order.order_number || undefined,
    order_status: order.order_status || undefined,
    payment_status: order.payment_status || undefined,
    total_amount: order.total_amount != null ? Number(order.total_amount) : undefined,
  };
}
