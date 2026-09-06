// Web Push sender (server-only) — ยิงแจ้งเตือนไปทุก device ที่ subscribe ไว้ของ company
// ใช้จาก webhook/sync (background) เท่านั้น — ห้าม import ฝั่ง client
import webpush from 'web-push';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';
import { formatPrice } from '@/lib/utils/format';
import { logIntegrationNow } from '@/lib/integration-logger';

export interface PushPayload {
  title: string;
  body: string;
  /** เปิดหน้าไหนเมื่อกดแจ้งเตือน (path ภายในระบบ เช่น /chat?platform=line) */
  url?: string;
  /** แจ้งเตือน tag เดียวกันจะแทนที่กัน (กัน spam ต่อ conversation/order เดียวกัน) */
  tag?: string;
  /** ไอคอนบนแจ้งเตือน — ใส่เมื่ออยากให้แยกออกว่ามาจากแอปไหน (ค่าเริ่มต้น = ไอคอนแอปร้าน) */
  icon?: string;
  /**
   * ไม่ต้องเอาชื่อบริษัทนำหน้า body ให้คนที่ดูแลหลายบริษัท — ใช้เมื่อหัวข้อบอกร้าน/เพจอยู่แล้ว
   * (แชท/ออเดอร์ที่หัวเป็น "ร้าน · แพลตฟอร์ม") · ผู้ใช้ตีกลับ 7 ก.ย. 2026 ว่าซ้ำและกินที่บนมือถือ
   */
  omitCompanyName?: boolean;
}

/** สายแจ้งเตือน — ต้องตรงกับ PushAudience ใน lib/push/client.ts */
export type PushAudience = 'app' | 'superadmin';

/** ไอคอนประจำสาย — แอดมินใช้ไอคอนพื้นเข้ม จะได้รู้ตั้งแต่ยังไม่อ่านว่ามาจากแอปไหน */
const AUDIENCE_ICON: Record<PushAudience, string> = {
  app: '/icons/icon-192.png',
  superadmin: '/icons/admin-icon-192.png',
};

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
 * ใส่ `?company=` ต่อท้าย url ของแจ้งเตือน — กดแล้วแอปสลับไปบริษัทนั้นให้เอง
 * (อ่านและสลับที่ lib/company-context.tsx ตอน provider เริ่มทำงาน)
 */
export function withCompanyParam(url: string, companyId: string): string {
  if (!url.startsWith('/')) return url;
  return url + (url.includes('?') ? '&' : '?') + `company=${companyId}`;
}

/** ผู้รับของบริษัทหนึ่ง + ข้อมูลที่ต้องใช้ประกอบข้อความ — cache สั้น ๆ กัน query ซ้ำ (แชทวันละหลายร้อยใบ) */
type CompanyAudience = { name: string; userIds: string[]; multiCompanyUserIds: Set<string> };
const audienceCache = new Map<string, { at: number; value: CompanyAudience }>();
const AUDIENCE_TTL_MS = 60_000;

async function getCompanyAudience(companyId: string): Promise<CompanyAudience | null> {
  const hit = audienceCache.get(companyId);
  if (hit && Date.now() - hit.at < AUDIENCE_TTL_MS) return hit.value;

  const [{ data: company }, { data: members }] = await Promise.all([
    supabaseAdmin.from('companies').select('name').eq('id', companyId).single(),
    supabaseAdmin.from('company_members').select('user_id').eq('company_id', companyId).eq('is_active', true),
  ]);
  const userIds = [...new Set((members || []).map(m => m.user_id as string).filter(Boolean))];
  if (userIds.length === 0) return null;

  // ใครอยู่หลายบริษัทบ้าง — คนพวกนี้เท่านั้นที่ต้องบอกว่า "ของร้านไหน"
  // (คนที่มีร้านเดียวไม่ต้องเปลืองบรรทัดบอกสิ่งที่รู้อยู่แล้ว)
  const { data: allMemberships } = await supabaseAdmin
    .from('company_members')
    .select('user_id, company_id')
    .in('user_id', userIds)
    .eq('is_active', true);
  const countByUser = new Map<string, number>();
  for (const m of allMemberships || []) {
    countByUser.set(m.user_id as string, (countByUser.get(m.user_id as string) || 0) + 1);
  }
  const value: CompanyAudience = {
    name: (company?.name as string) || '',
    userIds,
    multiCompanyUserIds: new Set(userIds.filter(id => (countByUser.get(id) || 1) > 1)),
  };
  audienceCache.set(companyId, { at: Date.now(), value });
  return value;
}

/**
 * ส่ง push เรื่องของบริษัทหนึ่ง — ไม่ throw เด็ดขาด (fire-safe สำหรับ webhook flow)
 *
 * ⚠️ **ส่งตาม "คน" ไม่ใช่ตาม company_id ของ subscription** — เดิมกรองด้วย
 * `push_subscriptions.company_id` ซึ่งเป็นแค่ "บริษัทล่าสุดที่เครื่องนี้เปิดค้างไว้"
 * คนที่ดูแลหลายร้านจึงได้แจ้งเตือนแค่ร้านเดียว **และไม่มีอะไรบอกเลยว่าอีกร้านเงียบ
 * เพราะไม่มีลูกค้า หรือเพราะไม่ได้รับแจ้งเตือน** ต้องคอยกดสลับบริษัทไปเช็คเอง
 * ตอนนี้ยิงหาสมาชิกที่ยัง active ของบริษัทนั้นทุกคน ทุกเครื่อง — ไม่ต้องสลับบริษัทอีก
 *
 * endpoint ที่ตายแล้ว (404/410) จะถูกลบทิ้งอัตโนมัติ
 */
export async function sendPushToCompany(companyId: string, payload: PushPayload): Promise<void> {
  try {
    if (!ensureVapid()) return; // ยังไม่ตั้ง VAPID env → เงียบๆ ข้าม
    const audience = await getCompanyAudience(companyId);
    if (!audience) return;

    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, user_id')
      .in('user_id', audience.userIds)
      // เรื่องของร้านต้องไม่ไปโผล่ในแอปผู้ดูแลระบบ
      .eq('audience', 'app');
    if (error || !subs || subs.length === 0) return;

    // กดแจ้งเตือนแล้วต้องไปโผล่ในบริษัทที่ถูกต้อง ไม่ใช่บริษัทที่ค้างอยู่บนเครื่อง
    const url = withCompanyParam(payload.url || '/', companyId);

    // แยกส่งสองชุด: คนหลายร้านได้ชื่อร้านนำหน้า · คนร้านเดียวได้ข้อความเดิม
    const multi = subs.filter(s => audience.multiCompanyUserIds.has(s.user_id as string));
    const single = subs.filter(s => !audience.multiCompanyUserIds.has(s.user_id as string));

    await Promise.all([
      multi.length
        ? deliver(
            multi,
            {
              ...payload,
              url,
              body: audience.name && !payload.omitCompanyName ? `${audience.name} · ${payload.body}` : payload.body,
            },
            { companyId, audience: 'app' }
          )
        : Promise.resolve(0),
      single.length
        ? deliver(single, { ...payload, url }, { companyId, audience: 'app' })
        : Promise.resolve(0),
    ]);
  } catch (err) {
    console.error('[Push] sendPushToCompany error:', err);
  }
}

/**
 * ส่ง push ไปทุก device ของ "ผู้ใช้" ที่ระบุ — ไม่สนว่าตอนเปิดแจ้งเตือนอยู่บริษัทไหน
 * ใช้กับเรื่องที่ผูกกับตัวคน ไม่ได้ผูกกับบริษัท (เช่น superadmin เฝ้าระบบข้ามบริษัท)
 * ไม่ throw เด็ดขาด · endpoint ที่ตายแล้ว (404/410) ถูกลบทิ้งอัตโนมัติ
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload,
  opts: { audience?: PushAudience } = {}
): Promise<number> {
  try {
    if (!ensureVapid()) return 0;
    const ids = [...new Set(userIds)].filter(Boolean);
    if (ids.length === 0) return 0;

    const audience = opts.audience || 'app';
    const { data: subs, error } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', ids)
      .eq('audience', audience);
    if (error || !subs || subs.length === 0) return 0;

    // ไม่ส่ง companyId — สายนี้ยิงตามตัวคน (ข้ามบริษัท) จึงไม่มีบริษัทให้ลง log
    return await deliver(subs, { icon: AUDIENCE_ICON[audience], ...payload }, { audience });
  } catch (err) {
    console.error('[Push] sendPushToUsers error:', err);
    return 0;
  }
}

/**
 * ยิงจริงไปทีละ subscription + เก็บกวาด endpoint ที่ตายแล้ว (ใช้ร่วมทุกตัวส่ง)
 *
 * `opts.companyId` มีเมื่อรู้ว่าเป็นเรื่องของบริษัทไหน — ใช้ลง integration log ตอนยิงพลาด
 * (`integration_logs.company_id` บังคับ ไม่มีก็ลงไม่ได้ เช่นสาย superadmin ที่ยิงตามตัวคน)
 */
async function deliver(
  subs: { id: string; endpoint: string; p256dh: string; auth: string }[],
  payload: PushPayload,
  opts: { companyId?: string; audience?: PushAudience } = {}
): Promise<number> {
  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag,
    icon: payload.icon,
  });

  const staleIds: string[] = [];
  let sent = 0;
  await parallelLimit(subs, async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
        { TTL: 300, urgency: 'high' }
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        staleIds.push(sub.id); // device ยกเลิก/ลบ app แล้ว
      } else {
        console.error(`[Push] send failed (${statusCode || 'network'}):`, (err as Error)?.message);
      }
      // push service (FCM/APNs/Mozilla) = แพลตฟอร์มภายนอก → ต้องมี log ทุกครั้งที่ยิงพลาด
      // ไม่งั้น "แจ้งเตือนไม่เข้า" จะไม่มีหลักฐานเลยว่าเป็นที่เราไม่ได้ยิง หรือปลายทางปฏิเสธ
      // (ขาสำเร็จไม่ log — แชทวันละหลายร้อยใบ × ทุกเครื่อง จะท่วมตาราง)
      if (opts.companyId) {
        await logIntegrationNow({
          company_id: opts.companyId,
          integration: 'webpush',
          direction: 'outgoing',
          action: 'send_notification',
          method: 'POST',
          // เก็บแค่ host ของ endpoint — ส่วนที่เหลือเป็นคีย์ลับของ device นั้น
          api_path: new URL(sub.endpoint).host,
          request_body: { title: payload.title, tag: payload.tag, audience: opts.audience },
          response_body: (err as { body?: unknown })?.body ?? null,
          http_status: statusCode,
          status: 'error',
          error_message: (err as Error)?.message,
        }).catch(() => { /* log ล้มต้องไม่ทำให้เครื่องอื่นที่เหลือไม่ได้รับ */ });
      }
    }
  }, 8);

  if (staleIds.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds);
  }
  return sent;
}

const CHAT_PLATFORM_LABELS: Record<string, string> = {
  line: 'LINE',
  facebook: 'Facebook',
  shopee: 'Shopee',
  lazada: 'Lazada',
  tiktok: 'TikTok',
};

/**
 * หัวข้อแจ้งเตือน = ช่องทางที่มีคนทักมา ไม่ใช่ชื่อคนทัก
 *
 * ทีมงานดูหลายร้านหลายแพลตฟอร์ม สิ่งที่ต้องรู้ก่อนจะกดอ่านคือ "ต้องไปตอบที่ไหน" — ชื่อลูกค้า
 * ไปอยู่ต้นบรรทัดคู่กับข้อความแทน · ไม่รู้ชื่อร้าน = เหลือแค่ชื่อแพลตฟอร์ม ห้ามเหลือหัวข้อเปล่า
 */
export async function sendChatPush(
  companyId: string,
  opts: {
    platform: 'line' | 'facebook' | 'shopee' | 'lazada' | 'tiktok';
    senderName?: string | null;
    preview?: string | null;
    contactId: string;
    /** เวลาข้อความจริง (ms epoch หรือ ISO) — เก่าเกิน 10 นาทีจะไม่ยิง */
    messageTime?: number | string | null;
    /** ชื่อร้าน/เพจ/OA ที่ลูกค้าทักมา — ขึ้นนำหัวข้อ */
    accountName?: string | null;
    /** chat_accounts.id — ใช้ดึงรูปมาทำไอคอนบนแจ้งเตือน */
    chatAccountId?: string | null;
  }
): Promise<void> {
  if (opts.messageTime) {
    const t = typeof opts.messageTime === 'number' ? opts.messageTime : new Date(opts.messageTime).getTime();
    if (Number.isFinite(t) && Date.now() - t > CHAT_PUSH_MAX_AGE_MS) return;
  }
  const platformLabel = CHAT_PLATFORM_LABELS[opts.platform] || opts.platform;
  await sendPushToCompany(companyId, {
    title: opts.accountName ? `${opts.accountName} · ${platformLabel}` : platformLabel,
    body: `${opts.senderName || 'ลูกค้า'}: ${(opts.preview || 'ส่งข้อความใหม่').slice(0, 120)}`,
    url: `/chat?platform=${opts.platform}`,
    tag: `chat-${opts.platform}-${opts.contactId}`,
    // หัวข้อมีชื่อเพจ/OA แล้ว — ไม่ต้องซ้ำชื่อบริษัทใน body
    omitCompanyName: !!opts.accountName,
    // URL สัมพัทธ์ — service worker resolve เองตอน showNotification
    ...(opts.chatAccountId ? { icon: `/api/push/icon?chat_account=${opts.chatAccountId}` } : {}),
  });
}

const ORDER_SOURCE_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  lazada: 'Lazada',
  storefront: 'หน้าร้านออนไลน์',
};

/**
 * แจ้งเตือนออเดอร์ใหม่ — เรียกเฉพาะตอนสร้างออเดอร์ใหม่ (ไม่ใช่ตอน update สถานะ)
 *
 * หัวข้อเป็นชุดเดียวกับแจ้งเตือนแชท (`{ร้าน} · {แพลตฟอร์ม}`) เพื่อให้กวาดตาดูสายเดียวกันได้
 * **ไม่ใส่เลขที่ออเดอร์** — กดแล้วเปิดใบนั้นอยู่แล้ว เอาที่ว่างไปบอกยอดกับชื่อลูกค้าดีกว่า
 */
export async function sendNewOrderPush(
  companyId: string,
  opts: {
    orderId: string;
    orderNo?: string | null;
    source: string;
    totalAmount?: number | null;
    customerName?: string | null;
    /** ชื่อร้านบนแพลตฟอร์ม — ไม่มี (เช่น หน้าร้านออนไลน์) ใช้ชื่อแพลตฟอร์มอย่างเดียว */
    shopName?: string | null;
    /** marketplace_accounts.id — ใช้ดึงโลโก้ร้านมาทำไอคอนบนแจ้งเตือน */
    marketplaceAccountId?: string | null;
  }
): Promise<void> {
  const sourceLabel = ORDER_SOURCE_LABELS[opts.source] || opts.source;
  // ตัด ".00" ทิ้งเมื่อยอดเป็นจำนวนเต็ม — แจ้งเตือนมีที่ให้กวาดตาแค่บรรทัดเดียว
  // ("฿1,290" ไม่ใช่ "฿1,290.00") แต่ยอดที่มีสตางค์จริงยังต้องแสดงครบ ("฿477.15")
  const amount = opts.totalAmount
    ? ` ฿${formatPrice(Number(opts.totalAmount)).replace(/\.00$/, '')}`
    : '';
  await sendPushToCompany(companyId, {
    title: opts.shopName ? `${opts.shopName} · ${sourceLabel}` : sourceLabel,
    body: `ออเดอร์ใหม่${amount}${opts.customerName ? ` · ${opts.customerName}` : ''}`,
    // หัวข้อมีชื่อร้านแล้ว — ไม่ต้องซ้ำชื่อบริษัทใน body
    omitCompanyName: !!opts.shopName,
    url: `/orders/${opts.orderId}`,
    tag: `order-${opts.orderId}`,
    // ออเดอร์หน้าร้านออนไลน์ไม่มีร้านบนแพลตฟอร์ม → ไม่ส่ง icon, SW ใช้ไอคอนแอป
    ...(opts.marketplaceAccountId
      ? { icon: `/api/push/icon?marketplace_account=${opts.marketplaceAccountId}` }
      : {}),
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
      .select('id, order_number, source, total_amount, created_at, customers(name), marketplace_account_id')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .single();
    if (!order) return;
    if (!t && order.created_at && Date.now() - new Date(order.created_at).getTime() > NEW_ORDER_PUSH_MAX_AGE_MS) return;

    const customer = order.customers as { name?: string } | { name?: string }[] | null;
    const customerName = Array.isArray(customer) ? customer[0]?.name : customer?.name;

    // ชื่อร้านถามแยกใบ ไม่ embed มากับ query ข้างบน — embed ที่พัง (FK เปลี่ยนชื่อ,
    // สิทธิ์, ฯลฯ) จะทำให้ทั้ง query คืน null แล้ว **แจ้งเตือนหายทั้งใบ** ซึ่งแย่กว่า
    // การไม่รู้ชื่อร้านมาก · ถามไม่ได้ = หัวข้อเหลือชื่อแพลตฟอร์ม แต่ push ยังออก
    const marketplaceAccountId = (order.marketplace_account_id as string | null) || null;
    let shopName: string | null = null;
    if (marketplaceAccountId) {
      const { data: shop } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('shop_name')
        .eq('id', marketplaceAccountId)
        .maybeSingle();
      shopName = (shop?.shop_name as string | null) || null;
    }

    await sendNewOrderPush(companyId, {
      orderId: order.id,
      orderNo: order.order_number,
      source: order.source || 'marketplace',
      totalAmount: order.total_amount,
      customerName: customerName || null,
      shopName,
      marketplaceAccountId,
    });
  } catch (err) {
    console.error('[Push] sendNewOrderPushById error:', err);
  }
}
