// Web Push sender (server-only) — ยิงแจ้งเตือนไปทุก device ที่ subscribe ไว้ของ company
// ใช้จาก webhook/sync (background) เท่านั้น — ห้าม import ฝั่ง client
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';
import { formatPrice } from '@/lib/utils/format';

export interface PushPayload {
  title: string;
  body: string;
  /** เปิดหน้าไหนเมื่อกดแจ้งเตือน (path ภายในระบบ เช่น /chat?platform=line) */
  url?: string;
  /** แจ้งเตือน tag เดียวกันจะแทนที่กัน (กัน spam ต่อ conversation/order เดียวกัน) */
  tag?: string;
}

// แชทเก่ากว่านี้ไม่ยิง push — กัน backfill ครั้งแรก / webhook retry เก่าๆ ปลุกเครื่องทั้งบริษัท
const CHAT_PUSH_MAX_AGE_MS = 10 * 60 * 1000;
// ออเดอร์ที่สร้างจาก initial sync ย้อนหลัง (เชื่อมร้านครั้งแรก) ไม่ push
const NEW_ORDER_PUSH_MAX_AGE_MS = 30 * 60 * 1000;

let vapidConfigured = false;
function ensureVapid(): boolean {
  if (vapidConfigured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@aoocommerce.com', publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

/**
 * ส่ง push ไปทุก subscription ของ company — ไม่ throw เด็ดขาด (fire-safe สำหรับ webhook flow)
 * endpoint ที่ตายแล้ว (404/410) จะถูกลบทิ้งอัตโนมัติ
 */
export async function sendPushToCompany(companyId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureVapid()) return; // ยังไม่ตั้ง VAPID env → เงียบๆ ข้าม
    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('company_id', companyId);
    if (error || !subs || subs.length === 0) return;

    await deliver(subs, payload);
  } catch (err) {
    console.error('[Push] sendPushToCompany error:', err);
  }
}

/**
 * ส่ง push ไปทุก device ของ "ผู้ใช้" ที่ระบุ — ไม่สนว่าตอนเปิดแจ้งเตือนอยู่บริษัทไหน
 * ใช้กับเรื่องที่ผูกกับตัวคน ไม่ได้ผูกกับบริษัท (เช่น superadmin เฝ้าระบบข้ามบริษัท)
 * ไม่ throw เด็ดขาด · endpoint ที่ตายแล้ว (404/410) ถูกลบทิ้งอัตโนมัติ
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<void> {
  try {
    if (!ensureVapid()) return;
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return;

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', ids);
    if (error || !subs || subs.length === 0) return;

    await deliver(subs, payload);
  } catch (err) {
    console.error('[Push] sendPushToUsers error:', err);
  }
}

/** ยิงจริงไปทีละ subscription + เก็บกวาด endpoint ที่ตายแล้ว (ใช้ร่วมทุกตัวส่ง) */
async function deliver(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload
): Promise<void> {
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag,
  });

  const staleIds: string[] = [];
  await parallelLimit(subs, async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 300, urgency: 'high' }
      );
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(sub.id); // device ยกเลิก/ลบ app แล้ว
      } else {
        console.error(`[Push] send failed (${statusCode || 'network'}):`, (err as Error)?.message);
      }
    }
  }, 8);

  if (staleIds.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds);
  }
}

const CHAT_PLATFORM_LABELS: Record<string, string> = {
  line: 'LINE',
  facebook: 'Facebook',
  shopee: 'Shopee',
  lazada: 'Lazada',
};

/** แจ้งเตือนแชทขาเข้า — เรียกหลัง insert message สำเร็จเท่านั้น */
export async function sendChatPush(
  companyId: string,
  opts: {
    platform: 'line' | 'facebook' | 'shopee' | 'lazada';
    senderName?: string | null;
    preview?: string | null;
    contactId: string;
    /** เวลาข้อความจริง (ms epoch หรือ ISO) — เก่าเกิน 10 นาทีจะไม่ยิง */
    messageTime?: number | string | null;
  }
): Promise<void> {
  if (opts.messageTime) {
    const t = typeof opts.messageTime === 'number' ? opts.messageTime : new Date(opts.messageTime).getTime();
    if (Number.isFinite(t) && Date.now() - t > CHAT_PUSH_MAX_AGE_MS) return;
  }
  const platformLabel = CHAT_PLATFORM_LABELS[opts.platform] || opts.platform;
  await sendPushToCompany(companyId, {
    title: `💬 ${opts.senderName || 'ลูกค้า'} (${platformLabel})`,
    body: (opts.preview || 'ส่งข้อความใหม่').slice(0, 120),
    url: `/chat?platform=${opts.platform}`,
    tag: `chat-${opts.platform}-${opts.contactId}`,
  });
}

const ORDER_SOURCE_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  lazada: 'Lazada',
  storefront: 'หน้าร้านออนไลน์',
};

/** แจ้งเตือนออเดอร์ใหม่ — เรียกเฉพาะตอนสร้างออเดอร์ใหม่ (ไม่ใช่ตอน update สถานะ) */
export async function sendNewOrderPush(
  companyId: string,
  opts: {
    orderId: string;
    orderNo?: string | null;
    source: string;
    totalAmount?: number | null;
    customerName?: string | null;
  }
): Promise<void> {
  const sourceLabel = ORDER_SOURCE_LABELS[opts.source] || opts.source;
  const amount = opts.totalAmount ? ` ฿${formatPrice(Number(opts.totalAmount))}` : '';
  await sendPushToCompany(companyId, {
    title: `🛒 ออเดอร์ใหม่จาก ${sourceLabel}`,
    body: `${opts.orderNo || ''}${opts.customerName ? ` — ${opts.customerName}` : ''}${amount}`.trim() || 'มีคำสั่งซื้อใหม่เข้ามา',
    url: `/orders/${opts.orderId}`,
    tag: `order-${opts.orderId}`,
  });
}

/**
 * แจ้งเตือนออเดอร์ใหม่แบบดึงข้อมูลจาก DB เอง — เรียกหลังสร้างออเดอร์สำเร็จ
 * @param orderTimeMs เวลาออเดอร์จริงจาก platform (ms) — เก่าเกิน 30 นาที = sync ย้อนหลัง จะไม่ push
 */
export async function sendNewOrderPushById(
  companyId: string,
  orderId: string,
  orderTimeMs?: number | null
): Promise<void> {
  try {
    const t = orderTimeMs ?? null;
    if (t && Number.isFinite(t) && Date.now() - t > NEW_ORDER_PUSH_MAX_AGE_MS) return;

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, source, total_amount, created_at, customers(name)')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .single();
    if (!order) return;
    if (!t && order.created_at && Date.now() - new Date(order.created_at).getTime() > NEW_ORDER_PUSH_MAX_AGE_MS) return;

    const customer = order.customers as { name?: string } | { name?: string }[] | null;
    const customerName = Array.isArray(customer) ? customer[0]?.name : customer?.name;
    await sendNewOrderPush(companyId, {
      orderId: order.id,
      orderNo: order.order_number,
      source: order.source || 'marketplace',
      totalAmount: order.total_amount,
      customerName: customerName || null,
    });
  } catch (err) {
    console.error('[Push] sendNewOrderPushById error:', err);
  }
}
