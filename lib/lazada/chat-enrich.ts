import { logIntegrationNow } from '@/lib/integration-logger';
import { findLinkedProduct, findSyncedOrder } from '@/lib/marketplace/chat-enrich';
import { parseLazadaMessageContent, type LazadaImMessage } from '@/lib/lazada/chat';
import type { LazadaAccountRow } from '@/lib/lazada/api';

// เติมเนื้อให้ "การ์ด" ที่ Lazada ส่งมา (โครงเดียวกับ lib/shopee/chat-enrich.ts)
//
// การ์ดสินค้า/ออเดอร์ของ Lazada บอกชื่อกับรูปมาด้วยก็จริง แต่เป็น **ของฝั่ง Lazada** —
// พนักงานยังตอบไม่ได้ว่าเป็นสินค้าตัวไหนในคลังเรา / ออเดอร์ใบนี้อยู่สถานะอะไรในระบบเรา
// ที่นี่จึงจับคู่กับสินค้า/ออเดอร์ของเราตั้งแต่ตอนบันทึกข้อความ แล้วทับด้วยข้อมูลของเรา
//
// ⚠️ การเติมเนื้อ **ห้ามทำให้บันทึกข้อความล้ม** — ทุกจุดที่หาไม่เจอ/พังต้องคืนการ์ดที่
// ยังมีชื่อ/รูป/ราคาที่ Lazada ให้มา (ยังใช้งานได้) ไม่ใช่ throw
//
// ต่างจาก Shopee ตรงที่ **ไม่ยิง API ของ Lazada เลย** — การ์ดมีเนื้อมาพร้อมอยู่แล้ว
// จึงไม่ต้องเปลืองโควตาถามซ้ำ

/** สินค้า 1 ใบที่แนบมากับข้อความ — เก็บลง `lazada_messages.raw_message.item` */
export interface LazadaItemCard {
  item_id: string;
  sku_id?: string;
  /** ชื่อที่พนักงานอ่านรู้เรื่อง (ชื่อในระบบเรา > ชื่อบน Lazada) */
  name: string | null;
  image_url: string | null;
  price: number | null;
  voucher_price?: number | null;
  /** uuid สินค้าในระบบเรา — null = ยังไม่ได้ผูก (กด "เปิดในระบบ" ไม่ได้) */
  product_id: string | null;
  variation_id: string | null;
  platform_url?: string;
}

/** ออเดอร์ 1 ใบที่แนบมากับข้อความ — เก็บลง `lazada_messages.raw_message.order` */
export interface LazadaOrderCard {
  order_sn: string;
  /** uuid ออเดอร์ในระบบเรา — ไม่มี = ยังไม่ sync เข้ามา */
  order_id?: string;
  order_number?: string;
  order_status?: string;
  payment_status?: string;
  total_amount?: number;
  item_name?: string;
  image_url?: string;
  /** 'ReturnOrder' = คำขอคืนสินค้าที่บอทของ Lazada เปิดให้ */
  order_type?: string;
  platform_url?: string;
}

/** บริบทของการเติมเนื้อหนึ่งรอบ — cache กันค้นซ้ำเมื่อสินค้า/ออเดอร์เดิมโผล่หลายครั้ง */
export interface LazadaEnrichContext {
  account: LazadaAccountRow;
  itemCache: Map<string, LazadaItemCard>;
  orderCache: Map<string, LazadaOrderCard>;
}

export function createLazadaEnrichContext(account: LazadaAccountRow): LazadaEnrichContext {
  return { account, itemCache: new Map(), orderCache: new Map() };
}

interface LazadaItemHint {
  title?: string;
  price?: number;
  old_price?: number;
  voucher_price?: number;
  image_url?: string;
  stock?: string;
}

interface LazadaOrderHint {
  title?: string;
  item_name?: string;
  image_url?: string;
  total?: number;
  order_type?: string;
  action_url?: string;
}

async function logEnrichFailure(ctx: LazadaEnrichContext, reference: string, err: unknown) {
  try {
    await logIntegrationNow({
      company_id: ctx.account.company_id,
      integration: 'lazada',
      account_id: ctx.account.id,
      account_name: ctx.account.shop_name,
      direction: 'outgoing',
      action: 'chat_enrich',
      status: 'error',
      error_message: err instanceof Error ? err.message : String(err),
      reference_type: 'chat',
      reference_id: reference,
    });
  } catch {
    /* log ล้มก็ห้ามลามไปทำให้ข้อความบันทึกไม่ลง */
  }
}

async function resolveItemCard(
  ctx: LazadaEnrichContext,
  itemId: string,
  skuId: string | undefined,
  hint: LazadaItemHint,
  platformUrl: string | undefined
): Promise<LazadaItemCard> {
  const cacheKey = `${itemId}:${skuId ?? ''}`;
  const cached = ctx.itemCache.get(cacheKey);
  if (cached) return cached;

  // ค่าที่ Lazada ให้มา = ค่าตั้งต้น (ยังใช้ได้แม้จับคู่กับสินค้าเราไม่ได้)
  const card: LazadaItemCard = {
    item_id: itemId,
    sku_id: skuId,
    name: hint.title ?? null,
    image_url: hint.image_url ?? null,
    price: hint.price ?? null,
    voucher_price: hint.voucher_price ?? null,
    product_id: null,
    variation_id: null,
    platform_url: platformUrl,
  };

  const linked = await findLinkedProduct(ctx.account.company_id, 'lazada', itemId, skuId);
  if (linked) {
    card.name = linked.name ?? card.name;
    card.image_url = linked.image_url ?? card.image_url;
    card.price = linked.price ?? card.price;
    card.product_id = linked.product_id;
    card.variation_id = linked.variation_id;
  }

  ctx.itemCache.set(cacheKey, card);
  return card;
}

async function resolveOrderCard(
  ctx: LazadaEnrichContext,
  orderSn: string,
  hint: LazadaOrderHint
): Promise<LazadaOrderCard> {
  const cached = ctx.orderCache.get(orderSn);
  if (cached) return cached;

  const card: LazadaOrderCard = {
    order_sn: orderSn,
    total_amount: hint.total,
    item_name: hint.item_name,
    image_url: hint.image_url,
    order_type: hint.order_type,
    platform_url: hint.action_url,
  };

  const found = await findSyncedOrder(ctx.account.company_id, 'lazada', orderSn);
  if (found) {
    card.order_id = found.order_id;
    card.order_number = found.order_number;
    card.order_status = found.order_status;
    card.payment_status = found.payment_status;
    card.total_amount = found.total_amount ?? card.total_amount;
  }

  ctx.orderCache.set(orderSn, card);
  return card;
}

/**
 * แปลงข้อความ IM หนึ่งใบให้พร้อมบันทึก — parse โครงตาม template แล้วเติมเนื้อการ์ด
 * ผลลัพธ์ใช้ลง `lazada_messages` ได้ตรง ๆ (content / message_type / raw_message)
 */
export async function normalizeLazadaMessage(
  msg: LazadaImMessage,
  ctx: LazadaEnrichContext
): Promise<{ messageContent: string; messageType: string; metadata: Record<string, unknown> }> {
  const parsed = parseLazadaMessageContent(msg);
  let { messageContent } = parsed;
  const { messageType, metadata } = parsed;

  try {
    if (messageType === 'item') {
      const itemId = typeof metadata.item_id === 'string' ? metadata.item_id : undefined;
      if (itemId) {
        const hint = (metadata.lazada_item as LazadaItemHint | undefined) ?? {};
        const card = await resolveItemCard(
          ctx,
          itemId,
          typeof metadata.sku_id === 'string' ? metadata.sku_id : undefined,
          hint,
          typeof metadata.itemUrl === 'string' ? metadata.itemUrl : undefined
        );
        metadata.item = card;
        // ชื่อในระบบเราคือชื่อที่พนักงานค้นหาต่อได้ — พรีวิวในรายชื่อแชทจึงควรใช้ชื่อนี้
        if (card.product_id && card.name) messageContent = `[สินค้า] ${card.name}`;
      }
    } else if (messageType === 'order') {
      const orderSn = typeof metadata.order_sn === 'string' ? metadata.order_sn : undefined;
      if (orderSn) {
        const hint = (metadata.lazada_order as LazadaOrderHint | undefined) ?? {};
        const card = await resolveOrderCard(ctx, orderSn, hint);
        metadata.order = card;
        if (card.order_id) metadata.order_id = card.order_id;
      }
    }
  } catch (err) {
    // หาไม่เจอ/DB สะดุด → ปล่อยให้เป็นการ์ดตามข้อมูลที่ Lazada ให้มา (ยังอ่านรู้เรื่อง)
    await logEnrichFailure(ctx, `${messageType}:${msg.message_id}`, err);
  }

  return { messageContent, messageType, metadata };
}
