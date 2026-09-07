import { logIntegrationNow } from '@/lib/integration-logger';
import { ensureValidToken, shopeeApiRequest, type ShopeeAccountRow, type ShopeeCredentials } from '@/lib/shopee/api';
import { findLinkedProduct, findSyncedOrder } from '@/lib/marketplace/chat-enrich';

// เติมเนื้อให้ "การ์ด" ที่ Shopee ส่งมาแต่ id
//
// push code 10 ของชนิด item/order ส่งมาแค่ `{shop_id, item_id}` / `{order_sn}` —
// หน้าแชทจึงได้ฟอง "[สินค้า]" ที่พนักงานเดาไม่ออกว่าลูกค้าถามถึงตัวไหน
// ที่นี่แปลง id เป็นของจริงจากฐานข้อมูลเรา (สินค้าที่ผูกไว้ / ออเดอร์ที่ sync มาแล้ว)
// แล้วค่อยตกไปถาม Shopee เฉพาะสินค้าที่ยังไม่มีในระบบ
//
// ⚠️ การเติมเนื้อ **ห้ามทำให้บันทึกข้อความล้ม** — ทุกจุดที่หาไม่เจอ/ยิงไม่ผ่าน
// ต้องคืนการ์ดเปล่าที่ยังมี id เสมอ (ฟองแบบเดิม) ไม่ใช่ throw

/** สินค้า 1 ใบที่แนบมากับข้อความ — เก็บลง `shopee_messages.raw_message.item` */
export interface ShopeeItemCard {
  item_id: string;
  shop_id: number | null;
  /** ชื่อที่พนักงานอ่านรู้เรื่อง (ชื่อในระบบเรา > ชื่อบน Shopee) */
  name: string | null;
  image_url: string | null;
  /** ราคาขายของเรา (ตัวที่ลูกค้าเห็นบนหน้าร้านเรา) — ไม่มี link = ราคาบน Shopee */
  price: number | null;
  /** uuid สินค้าในระบบเรา — null = ยังไม่ได้ผูกกับสินค้าตัวไหน (กด "เปิดในระบบ" ไม่ได้) */
  product_id: string | null;
  variation_id: string | null;
  shopee_url: string;
}

/** ออเดอร์ 1 ใบที่แนบมากับข้อความ — เก็บลง `shopee_messages.raw_message.order` */
export interface ShopeeOrderCard {
  order_sn: string;
  /** uuid ออเดอร์ในระบบเรา — ไม่มี = ยังไม่ sync เข้ามา (กด "เปิดออเดอร์" ไม่ได้) */
  order_id?: string;
  order_number?: string;
  order_status?: string;
  payment_status?: string;
  total_amount?: number;
}

/**
 * บริบทของการเติมเนื้อหนึ่งรอบ (หนึ่ง push / หนึ่งหน้าของ get_message)
 * - cache กันยิงซ้ำเมื่อลูกค้าส่งสินค้าตัวเดิมหลายครั้งในหน้าเดียว
 * - creds ขอครั้งเดียวและเฉพาะเมื่อจำเป็น (ส่วนใหญ่ตอบได้จาก DB ไม่ต้องยิง Shopee)
 */
export interface ShopeeEnrichContext {
  account: ShopeeAccountRow;
  itemCache: Map<string, ShopeeItemCard>;
  orderCache: Map<string, ShopeeOrderCard>;
  credsPromise?: Promise<ShopeeCredentials | null>;
}

export function createShopeeEnrichContext(account: ShopeeAccountRow): ShopeeEnrichContext {
  return { account, itemCache: new Map(), orderCache: new Map() };
}

/**
 * creds ที่นี่ใช้ยิง **Product API** (get_item_base_info) ไม่ใช่ sellerchat —
 * จึงเป็น token ชุดหลักโดยตั้งใจ (ขาแชทมี quota/app คนละถัง ไม่ต้องเอามาปนกัน)
 */
function getCreds(ctx: ShopeeEnrichContext): Promise<ShopeeCredentials | null> {
  if (!ctx.credsPromise) {
    ctx.credsPromise = ensureValidToken(ctx.account).catch(() => null);
  }
  return ctx.credsPromise;
}

export function shopeeItemUrl(shopId: number | string | null | undefined, itemId: string): string {
  return shopId ? `https://shopee.co.th/product/${shopId}/${itemId}` : `https://shopee.co.th/product/-/${itemId}`;
}

async function logEnrichFailure(ctx: ShopeeEnrichContext, apiPath: string, reference: string, err: unknown) {
  try {
    await logIntegrationNow({
      company_id: ctx.account.company_id,
      integration: 'shopee',
      account_id: ctx.account.id,
      account_name: ctx.account.shop_name,
      direction: 'outgoing',
      action: 'chat_enrich',
      api_path: apiPath,
      status: 'error',
      error_message: err instanceof Error ? err.message : String(err),
      reference_type: 'chat',
      reference_id: reference,
    });
  } catch {
    /* log ล้มก็ห้ามลามไปทำให้ข้อความบันทึกไม่ลง */
  }
}

/**
 * แปลง item_id ของ Shopee เป็นการ์ดสินค้า
 * ลำดับ: link ที่ผูกไว้ → สินค้าในระบบเรา → (ไม่มี link) ถาม Shopee → การ์ดเปล่า
 */
export async function resolveShopeeItemCard(
  ctx: ShopeeEnrichContext,
  itemId: string,
  shopIdFromMessage?: number | string | null
): Promise<ShopeeItemCard> {
  const shopId = Number(shopIdFromMessage ?? ctx.account.shop_id) || null;
  const cached = ctx.itemCache.get(itemId);
  if (cached) return cached;

  const fallback: ShopeeItemCard = {
    item_id: itemId,
    shop_id: shopId,
    name: null,
    image_url: null,
    price: null,
    product_id: null,
    variation_id: null,
    shopee_url: shopeeItemUrl(shopId, itemId),
  };

  try {
    // 1) link ของบริษัทนี้ — การ์ดบอกแค่ item ไม่บอก model จึงหยิบ link ตัวใดตัวหนึ่งของ item นั้น
    const linked = await findLinkedProduct(ctx.account.company_id, 'shopee', itemId);
    if (linked) {
      const card: ShopeeItemCard = {
        ...fallback,
        name: linked.name,
        image_url: linked.image_url,
        price: linked.price,
        product_id: linked.product_id,
        variation_id: linked.variation_id,
      };
      ctx.itemCache.set(itemId, card);
      return card;
    }

    // 2) ยังไม่มีในระบบ → ถาม Shopee (เฉพาะกรณีนี้เท่านั้น เพื่อไม่เปลืองโควตา product)
    const creds = await getCreds(ctx);
    if (creds) {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/product/get_item_base_info', {
        item_id_list: itemId,
      });
      if (!error && data) {
        const item = (data as {
          item_list?: Array<{
            item_name?: string;
            image?: { image_url_list?: string[] };
            price_info?: Array<{ current_price?: number; original_price?: number }>;
          }>;
        }).item_list?.[0];
        if (item) {
          const price = item.price_info?.[0];
          const card: ShopeeItemCard = {
            ...fallback,
            name: item.item_name || null,
            image_url: item.image?.image_url_list?.[0] || null,
            // สินค้าที่มี model จะไม่มี price_info (ราคาอยู่ที่ระดับ model) → ปล่อยว่าง ดีกว่าโชว์เลขมั่ว
            price: price?.current_price ?? price?.original_price ?? null,
          };
          ctx.itemCache.set(itemId, card);
          return card;
        }
      }
    }
  } catch (err) {
    await logEnrichFailure(ctx, '/api/v2/product/get_item_base_info', `item:${itemId}`, err);
  }

  ctx.itemCache.set(itemId, fallback);
  return fallback;
}

/** แปลง order_sn เป็นการ์ดออเดอร์จากออเดอร์ที่ sync เข้าระบบแล้ว */
export async function resolveShopeeOrderCard(
  ctx: ShopeeEnrichContext,
  orderSn: string
): Promise<ShopeeOrderCard> {
  const cached = ctx.orderCache.get(orderSn);
  if (cached) return cached;

  let card: ShopeeOrderCard = { order_sn: orderSn };
  try {
    const order = await findSyncedOrder(ctx.account.company_id, 'shopee', orderSn);
    if (order) card = { order_sn: orderSn, ...order };
  } catch (err) {
    await logEnrichFailure(ctx, 'orders', `order:${orderSn}`, err);
  }

  ctx.orderCache.set(orderSn, card);
  return card;
}
