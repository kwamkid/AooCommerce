// บรอดแคสต์ LINE — ส่งข้อความหาลูกค้าหลายคนพร้อมกันจากระบบเรา
//
// ทำไมต้องส่งจากที่นี่: Messaging API ของ LINE **อ่านประวัติแชทไม่ได้** และข้อความที่
// ร้านส่งจาก LINE Official Account Manager (บรอดแคสต์/ตอบมือ) **ไม่เข้ามาที่ webhook เรา**
// ⇒ ส่งจากระบบเราเท่านั้นที่ทำให้ข้อความไปโผล่ในห้องแชทของลูกค้าทุกคน และรู้ตัวว่า
// กินโควตารายเดือนของ OA ไปเท่าไหร่ (ข้อความ push/multicast/broadcast กินโควตาทุกใบ —
// การตอบด้วย reply token ไม่กิน)
//
// งานส่งจริงออกแบบให้ **กดซ้ำได้เสมอ**: หั่นผู้รับเป็นล็อตละ 500 แล้วผูก
// `X-Line-Retry-Key` (uuid) ไว้กับล็อตตั้งแต่ก่อนยิง — ฟังก์ชันตายกลางทาง/หมดเวลา
// แล้วเรียกใหม่ ล็อตเดิมจะไม่ถูกส่งซ้ำเพราะ LINE จำ retry key ไว้ให้

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getChatAccount, getLineCredsFromAccount } from '@/lib/chat-config';
import { logIntegrationNow } from '@/lib/integration-logger';
import { resolveChatRecipients } from '@/lib/broadcast/recipients';
import type { BroadcastAudienceFilter, BroadcastAudienceType } from '@/lib/broadcast/recipients';
import { LINE_TEXT_MAX, MULTICAST_BATCH_SIZE } from '@/lib/line/constants';
import { discountPercent, imageAspectRatio, posterTap, TAP_MESSAGE_MAX } from '@/lib/broadcast/content';
import type { BroadcastContent, BroadcastProductCard } from '@/lib/broadcast/content';

const LINE_API = 'https://api.line.me/v2/bot';

export { LINE_TEXT_MAX, MULTICAST_BATCH_SIZE };

// ─── Types ────────────────────────────────────────────────────────────

// ชนิดของกลุ่มผู้รับ + ตัวกรอง ย้ายไปอยู่ที่ตัวหาผู้รับกลาง (ใช้ร่วมกับสายกลุ่มเป้าหมายโฆษณา)
// — re-export ไว้ให้ที่ที่ import จากไฟล์นี้อยู่เดิมใช้ได้เหมือนเดิม
export type { BroadcastAudienceType, BroadcastAudienceFilter } from '@/lib/broadcast/recipients';

// 'scheduled' = ตั้งเวลาไว้ รอ cron หยิบ · 'cancelled' = ผู้ใช้ยกเลิกก่อนถึงเวลา
// (ตัวส่งต้องข้ามสองสถานะนี้เสมอ — ใบที่ยังไม่ถึงเวลา/ถูกยกเลิกแล้วห้ามหลุดไปถึงลูกค้า)
export type BroadcastStatus =
  | 'scheduled' | 'pending' | 'sending' | 'sent' | 'partial' | 'failed' | 'cancelled';

/** ปุ่มบนการ์ด/ปุ่มตอบเร็ว — uri = เปิดลิงก์ · message = ส่งข้อความกลับเข้าห้องแชท */
export type LineAction =
  | { type: 'uri'; label: string; uri: string }
  | { type: 'message'; label: string; text: string };

export interface LineQuickReply {
  items: { type: 'action'; action: LineAction }[];
}

export interface LineCarouselColumn {
  thumbnailImageUrl?: string;
  title?: string;
  text: string;
  actions: LineAction[];
}

/**
 * โครง Flex แบบหลวม ๆ — พอให้ประกอบการ์ดได้โดยไม่ต้องพิมพ์สเปคทั้งชุดของ LINE
 * (ที่ต้องแน่คือ hero/body/footer มีอะไรบ้าง ส่วนข้างในเป็น JSON ที่ LINE ตรวจเอง)
 */
export interface LineFlexBubble {
  type: 'bubble';
  /** 'giga' ≈ เต็มความกว้างห้องแชท · 'mega' = การ์ดในแถวเลื่อน (ไม่ใส่ = ขนาดมาตรฐาน) */
  size?: 'nano' | 'micro' | 'kilo' | 'mega' | 'giga';
  /** แตะที่ไหนของการ์ดก็ได้ — ใช้กับการ์ดที่ไม่มีปุ่ม (แบบรูปเต็ม) */
  action?: LineAction;
  hero?: Record<string, unknown>;
  body?: Record<string, unknown>;
  footer?: Record<string, unknown>;
}

/** แถวการ์ดเลื่อนได้ — การ์ดสินค้าใช้ตัวนี้แทน template carousel รุ่นเก่า */
export interface LineFlexCarousel {
  type: 'carousel';
  contents: LineFlexBubble[];
}

export type LineFlexContainer = LineFlexBubble | LineFlexCarousel;

export type LineMessageObject =
  | { type: 'text'; text: string; quickReply?: LineQuickReply }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string; quickReply?: LineQuickReply }
  | { type: 'flex'; altText: string; contents: LineFlexContainer; quickReply?: LineQuickReply }
  | {
      type: 'template';
      altText: string;
      quickReply?: LineQuickReply;
      template:
        | { type: 'buttons'; thumbnailImageUrl?: string; title?: string; text: string; actions: LineAction[] }
        | { type: 'carousel'; columns: LineCarouselColumn[] };
    };

export interface LineQuota {
  /** 'none' = ไม่จำกัด · 'limited' = มีเพดานรายเดือน · 'unknown' = ถาม LINE ไม่สำเร็จ */
  type: 'none' | 'limited' | 'unknown';
  limit: number | null;
  used: number;
  remaining: number | null;
}

export interface BroadcastRecipient {
  contact_id: string;
  line_user_id: string;
}

export interface BroadcastBatch {
  index: number;
  /** ผูกกับล็อตตั้งแต่ก่อนยิง — ยิงซ้ำด้วยคีย์เดิม LINE จะไม่ส่งข้อความซ้ำ */
  retry_key: string;
  user_ids: string[];
  contact_ids: string[];
  status: 'pending' | 'sent' | 'failed';
  request_id?: string | null;
  error?: string | null;
}

interface BroadcastRow {
  id: string;
  company_id: string;
  chat_account_id: string;
  created_by: string | null;
  audience_type: BroadcastAudienceType;
  audience_filter: BroadcastAudienceFilter | null;
  /** เนื้อหาชนิดกลาง — ใบเก่าก่อนมีคอลัมน์นี้เป็น null (ต้องแกะย้อนจาก messages) */
  content: BroadcastContent | null;
  messages: LineMessageObject[];
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: BroadcastStatus;
  batches: BroadcastBatch[] | null;
  platform_request_ids: string[] | null;
  started_at: string | null;
}

// ─── โควตา / ผู้ติดตาม ─────────────────────────────────────────────────

/**
 * โควตาข้อความของ OA เดือนนี้ — **ไม่ throw** ถามไม่ได้ก็คืน type 'unknown'
 * (โควตาเป็นข้อมูลประกอบการตัดสินใจ ห้ามทำให้หน้าจอพังเพราะถามไม่ได้)
 */
export async function getLineQuota(accessToken: string): Promise<LineQuota> {
  const unknown: LineQuota = { type: 'unknown', limit: null, used: 0, remaining: null };
  try {
    const [quotaRes, usageRes] = await Promise.all([
      fetch(`${LINE_API}/message/quota`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      fetch(`${LINE_API}/message/quota/consumption`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);
    if (!quotaRes.ok) return unknown;

    const quota = (await quotaRes.json()) as { type?: string; value?: number };
    const usage = usageRes.ok
      ? ((await usageRes.json()) as { totalUsage?: number })
      : { totalUsage: undefined };

    const used = typeof usage.totalUsage === 'number' ? usage.totalUsage : 0;
    if (quota.type === 'limited' && typeof quota.value === 'number') {
      return { type: 'limited', limit: quota.value, used, remaining: Math.max(0, quota.value - used) };
    }
    if (quota.type === 'none') return { type: 'none', limit: null, used, remaining: null };
    return { ...unknown, used };
  } catch {
    return unknown;
  }
}

/** โควตาไม่พอสำหรับจำนวนผู้รับนี้หรือไม่ (ไม่รู้เพดาน = ไม่ขวาง) */
export function quotaBlocks(quota: LineQuota, recipientCount: number): boolean {
  return quota.type === 'limited' && quota.remaining !== null && quota.remaining < recipientCount;
}

/** วันที่แบบ YYYYMMDD ตามโซนเวลาที่ LINE ใช้ (UTC+9) ย้อนหลัง n วัน */
function jstDateString(daysAgo: number): string {
  const d = new Date(Date.now() + 9 * 3600_000 - daysAgo * 86_400_000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export interface LineFollowerStats {
  /** คนที่ยิงข้อความถึงได้จริงตอนนี้ — ตรงกับเลข "เพื่อน" ที่ LINE OA Manager โชว์ */
  reachable: number | null;
  /** ยอดสะสมที่เคยกดแอดมาทั้งหมด (ไม่ลดเมื่อบล็อก/ลบบัญชี) — ไว้อธิบายส่วนต่างเท่านั้น */
  totalAdds: number | null;
  /** จำนวนที่บล็อก OA อยู่ */
  blocks: number | null;
}

/**
 * จำนวนผู้ติดตาม OA จาก `/insight/followers` — LINE สรุปเป็นรายวันและพร้อมช้ากว่าเวลาจริง
 * จึงถามของ "เมื่อวาน" · ยังไม่พร้อม (`unready`) หรือถามไม่ได้ = null ทุกช่อง (ห้ามเดาเป็น 0)
 *
 * ⚠️ **`followers` ของ LINE ไม่ใช่จำนวนเพื่อนปัจจุบัน** — เอกสารระบุว่ามันคือยอดสะสมของการ
 * กดแอด และ **ไม่ลดลงเมื่อผู้ใช้บล็อกหรือลบบัญชีตัวเอง** · ของจริงที่วัดได้ 8 ก.ย. 2026:
 * aDay Fresh followers=41,490 แต่ OA Manager โชว์เพื่อน 15,751 = `targetedReaches` (15,752)
 * ไม่ใช่ followers และไม่ใช่ followers−blocks (23,837) เพราะยังมีบัญชีที่ถูกลบทิ้งปนอยู่
 * ⇒ **จำนวนผู้รับต้องใช้ `targetedReaches` เสมอ** (ตกไป followers−blocks เฉพาะตอน LINE
 * ส่ง 0 มา ซึ่งเกิดเมื่อกลุ่มเป้าหมายน้อยกว่า 20 คน)
 */
export async function getLineFollowerStats(accessToken: string): Promise<LineFollowerStats> {
  const empty: LineFollowerStats = { reachable: null, totalAdds: null, blocks: null };
  try {
    const res = await fetch(`${LINE_API}/insight/followers?date=${jstDateString(1)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return empty;
    const data = (await res.json()) as {
      status?: string; followers?: number; targetedReaches?: number; blocks?: number;
    };
    if (data.status !== 'ready') return empty;

    const totalAdds = typeof data.followers === 'number' ? data.followers : null;
    const blocks = typeof data.blocks === 'number' ? data.blocks : null;
    const targeted = typeof data.targetedReaches === 'number' ? data.targetedReaches : null;

    // targetedReaches = 0 แปลว่า "น้อยกว่า 20 คน" ไม่ใช่ "ไม่มีใครเลย" — ตกไปใช้ยอดหักบล็อก
    const reachable = targeted && targeted > 0
      ? targeted
      : totalAdds !== null && blocks !== null
        ? Math.max(totalAdds - blocks, 0)
        : totalAdds;

    return { reachable, totalAdds, blocks };
  } catch {
    return empty;
  }
}

// ─── ผู้รับ ────────────────────────────────────────────────────────────

/**
 * รายชื่อผู้รับของบรอดแคสต์ใบหนึ่ง — **ตัวห่อบาง ๆ ของ `resolveChatRecipients`**
 *
 * ตรรกะทั้งหมด (แท็ก · ประวัติการซื้อ · ตัวกรองซ้อน · ตัดคนซ้ำ) อยู่ที่
 * [lib/broadcast/recipients.ts](../broadcast/recipients.ts) ซึ่งสายกลุ่มเป้าหมายโฆษณาใช้
 * ตัวเดียวกัน — ที่นี่แค่แปลงผลกลับเป็นรูปที่ตัวส่ง LINE ใช้อยู่เดิม
 *
 * นับเฉพาะผู้ติดต่อที่ยัง active และเป็น **บุคคล** (`line_user_id` ขึ้นต้นด้วย U —
 * ห้อง group/room ขึ้นต้นด้วย C/R ยิง multicast ไม่ได้)
 *
 * `audience_type='all'` คืนรายชื่อชุดเดียวกับ `'contacts'` — ตัวส่งจริงของโหมดนั้น
 * คือ broadcast API (ส่งถึงผู้ติดตามทุกคนซึ่งเราไม่รู้ว่าเป็นใคร) รายชื่อนี้ใช้แค่
 * เขียนข้อความลงห้องแชทของคนที่เรารู้จัก
 */
export async function resolveBroadcastRecipients(
  companyId: string,
  chatAccountId: string,
  audienceType: BroadcastAudienceType,
  filter?: BroadcastAudienceFilter | null,
): Promise<BroadcastRecipient[]> {
  const rows = await resolveChatRecipients(companyId, 'line', chatAccountId, audienceType, filter);
  return rows.map(r => ({ contact_id: r.contact_id, line_user_id: r.platform_user_id }));
}

/**
 * ระบบรู้ประวัติการซื้อของผู้ติดต่อกี่คน — `total` = ผู้ติดต่อที่ยิงถึงได้ทั้งหมดของ OA นี้
 * `linked` = ส่วนที่ผูกกับข้อมูลลูกค้าแล้ว (มีทางรู้ว่าเคยซื้อไหม)
 *
 * ⚠️ ต้องโชว์คู่กันเสมอบนหน้าจอที่แบ่งกลุ่มตามการซื้อ — LINE ไม่ให้เบอร์/อีเมล
 * คนที่ยังไม่ผูกจะถูกนับเป็น "ยังไม่เคยซื้อ" ทั้งหมด ผู้ใช้ต้องรู้ว่านั่นแปลว่า
 * "ไม่มีหลักฐานว่าซื้อ" ไม่ใช่ "ยืนยันแล้วว่าไม่เคยซื้อ"
 * (เงื่อนไขต้องตรงกับ resolveBroadcastRecipients เป๊ะ — active + line_user_id ขึ้นต้น U)
 */
export async function getLineContactCounts(
  companyId: string,
  chatAccountId: string,
): Promise<{ total: number; linked: number }> {
  const base = () => supabaseAdmin
    .from('line_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('chat_account_id', chatAccountId)
    .eq('status', 'active')
    .like('line_user_id', 'U%');

  const [totalRes, linkedRes] = await Promise.all([
    base(),
    base().not('customer_id', 'is', null),
  ]);
  return { total: totalRes.count ?? 0, linked: linkedRes.count ?? 0 };
}

// ─── ข้อความ ──────────────────────────────────────────────────────────

/** แปลงข้อความที่ผู้ใช้กรอกเป็น message object ของ LINE (ข้อความก่อน แล้วรูป) */
/**
 * แปลงเนื้อหาชนิดกลางเป็น message object ของ LINE
 *
 * ⚠️ **LINE นับโควตาต่อ "การส่ง 1 ครั้ง" (สูงสุด 3 bubble ยังนับเป็น 1)** — การ์ดที่มี
 * รูป + หัวข้อ + ข้อความ + ปุ่ม เป็น object เดียว จึงไม่แพงกว่าส่งข้อความเปล่าเลย
 * แต่เกิน 3 object เมื่อไหร่กลายเป็น 2 credit ต่อคน จึงกันเพดานไว้ที่นี่
 */
export const LINE_MAX_BUBBLES = 3;

/** ปุ่มตอบเร็ว — แนบไปกับ object สุดท้าย ไม่นับเป็น bubble เพิ่ม */
function buildQuickReply(labels: string[] | undefined): LineQuickReply | undefined {
  const items = (labels || []).map(l => l.trim()).filter(Boolean);
  if (items.length === 0) return undefined;
  return {
    items: items.map(label => ({
      type: 'action' as const,
      // message action = ลูกค้ากดแล้วข้อความนั้นถูกส่งเข้าห้องแชทเหมือนพิมพ์เอง
      // ⇒ ได้บทสนทนาให้แอดมินปิดการขายต่อ (และเปิดหน้าต่างตอบกลับของแพลตฟอร์มอื่นด้วย)
      action: { type: 'message' as const, label, text: label },
    })),
  };
}

/** ปุ่ม/การกดของการ์ดสินค้า — ไม่มีลิงก์ก็ยังต้องกดได้ (LINE บังคับ ≥1 action ต่อการ์ด) */
function productAction(p: BroadcastProductCard): LineAction {
  if (p.url) return { type: 'uri', label: 'สั่งเลย', uri: p.url };
  // ไม่มีหน้าร้านออนไลน์ก็ยังขายได้ — กดแล้วข้อความเข้าห้องแชทให้แอดมินปิดการขายต่อ
  return { type: 'message', label: 'สนใจสินค้านี้', text: `สนใจ ${p.name}`.slice(0, 300) };
}

/**
 * ราคาบนป้ายลอยของการ์ดแบบรูปเต็ม — สั้นที่สุดที่ยังอ่านออก
 * (ป้ายลอยทับรูปอยู่ ยาวกว่านี้จะบังของที่ลูกค้าอยากดู)
 */
function moneyText(n: number): string {
  return `${n.toLocaleString('th-TH')}.-`;
}

/** สีในก้อนนี้เป็นเลขฐานสิบหกได้ — เป็น JSON ของ LINE ไม่ใช่คลาสบนหน้าจอเรา */
const FLEX_BRAND = '#F4511E';
const FLEX_WHITE = '#FFFFFF';
/** ป้ายราคาบนรูป — ดำโปร่ง (ตัวอักษรขาวอ่านออกไม่ว่ารูปข้างล่างจะสีอะไร) */
const FLEX_PILL_BG = '#00000099';
const FLEX_TEXT = '#333333';
const FLEX_MUTED = '#999999';

/**
 * การ์ดที่มีแต่รูปเต็มความกว้างห้องแชท (Flex giga)
 *
 * ใช้กับ **โปสเตอร์** (ลิงก์บังคับ) และ **ประกาศแบบรูปเต็มจอ** (ลิงก์ใส่หรือไม่ใส่ก็ได้) —
 * ต่างจากฟองรูปธรรมดาตรงที่กว้างเต็มจอและกดได้ · สัดส่วนตามรูปจริง ไม่ครอบหัวท้ายทิ้ง
 */
function fullWidthImageBubble(
  imageUrl: string,
  aspectRatio: string,
  linkUrl: string | null,
): LineFlexBubble {
  return {
    type: 'bubble',
    size: 'giga',
    hero: {
      type: 'image',
      url: imageUrl,
      size: 'full',
      aspectRatio,
      aspectMode: 'cover',
      ...(linkUrl ? { action: { type: 'uri', label: 'เปิด', uri: linkUrl } } : {}),
    },
  };
}

/**
 * ส่วนรูปของการ์ดสินค้า — รูปจัตุรัส + ป้าย "ลด N%" มุมซ้ายบน (+ ป้ายราคากลางล่างเมื่อ
 * เป็นการ์ดแบบรูปเต็มซึ่งไม่มีเนื้อข้างล่างให้ใส่ราคา)
 *
 * ป้ายวางแบบ absolute ทับบนรูปในกล่องเดียวกัน — ยืนยันกับตัวตรวจของ LINE แล้วว่าใช้ได้
 */
function productHeroBox(p: BroadcastProductCard, withPriceOverlay: boolean): Record<string, unknown> {
  const off = discountPercent(p);
  const contents: Record<string, unknown>[] = [{
    type: 'image',
    url: p.image_url,
    size: 'full',
    aspectRatio: '1:1',
    aspectMode: 'cover',
    action: productAction(p),
  }];

  if (off !== null) {
    contents.push({
      type: 'box',
      layout: 'vertical',
      position: 'absolute',
      offsetTop: '12px',
      offsetStart: '12px',
      backgroundColor: FLEX_BRAND,
      cornerRadius: '999px',
      paddingTop: '4px',
      paddingBottom: '4px',
      paddingStart: '12px',
      paddingEnd: '12px',
      contents: [{ type: 'text', text: `ลด ${off}%`, color: FLEX_WHITE, size: 'sm', weight: 'bold' }],
    });
  }

  if (withPriceOverlay && p.price != null) {
    contents.push({
      type: 'box',
      layout: 'vertical',
      position: 'absolute',
      offsetBottom: '12px',
      offsetStart: '0px',
      offsetEnd: '0px',
      alignItems: 'center',
      contents: [{
        type: 'box',
        layout: 'vertical',
        backgroundColor: FLEX_PILL_BG,
        cornerRadius: '999px',
        paddingTop: '6px',
        paddingBottom: '6px',
        paddingStart: '18px',
        paddingEnd: '18px',
        contents: [{
          type: 'text',
          text: moneyText(p.price),
          color: FLEX_WHITE,
          size: 'xl',
          weight: 'bold',
          align: 'center',
        }],
      }],
    });
  }

  return { type: 'box', layout: 'vertical', paddingAll: '0px', contents };
}

/** การ์ดสินค้าหนึ่งใบในแถวเลื่อน */
function productBubble(p: BroadcastProductCard, cardStyle: 'image' | 'detail'): LineFlexBubble {
  const hasImage = !!p.image_url && /^https:\/\//i.test(p.image_url);
  // แบบรูปเต็มที่ไม่มีรูป = การ์ดว่างเปล่า — ตกไปใช้แบบมีชื่อ+ปุ่มให้ใบนั้นแทน
  // (ทิ้งทั้งใบไม่ได้ ผู้ใช้เลือกสินค้านั้นมาเอง)
  const style = cardStyle === 'image' && hasImage ? 'image' : 'detail';
  const off = discountPercent(p);

  if (style === 'image') {
    return {
      type: 'bubble',
      size: 'mega',
      hero: productHeroBox(p, true),
      // ไม่มีปุ่ม จึงต้องกดได้ทั้งใบ
      action: productAction(p),
    };
  }

  const bodyContents: Record<string, unknown>[] = [
    { type: 'text', text: p.name, weight: 'bold', size: 'md', wrap: true, maxLines: 2 },
  ];
  if (p.price != null) {
    bodyContents.push({ type: 'text', text: moneyText(p.price), size: 'sm', color: FLEX_TEXT });
    if (off !== null && p.compare_at_price != null) {
      bodyContents.push({
        type: 'text',
        text: moneyText(p.compare_at_price),
        size: 'sm',
        color: FLEX_MUTED,
        decoration: 'line-through',
      });
    }
  }

  return {
    type: 'bubble',
    size: 'mega',
    ...(hasImage ? { hero: productHeroBox(p, false) } : {}),
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
    footer: {
      type: 'box',
      layout: 'vertical',
      contents: [{ type: 'button', height: 'sm', style: 'primary', action: productAction(p) }],
    },
  };
}

export function buildLineMessagesFromContent(content: BroadcastContent): LineMessageObject[] {
  const title = (content.title || '').trim();
  const text = (content.text || '').trim();
  const imageUrl = (content.image_url || '').trim();
  const linkUrl = (content.link_url || '').trim();
  const quickReply = buildQuickReply(content.quick_replies);
  let messages: LineMessageObject[] = [];

  if (content.kind === 'poster') {
    // รูปทั้งใบคือเนื้อหา — ข้อความ ราคา ปุ่ม อยู่ในรูปที่ร้านออกแบบมาเอง
    if (!imageUrl) throw new Error('โปสเตอร์ต้องมีรูป');
    if (!/^https:\/\//i.test(imageUrl)) throw new Error('ลิงก์รูปต้องเป็น https');
    if (!/^https:\/\//i.test(linkUrl)) throw new Error('โปสเตอร์ต้องมีลิงก์ปลายทางแบบ https');
    messages = [{
      type: 'flex',
      altText: 'โปสเตอร์',
      contents: fullWidthImageBubble(imageUrl, imageAspectRatio(content), linkUrl),
    }];

  } else if (content.kind === 'promo') {
    // การ์ดเดียวจบ: รูปอยู่ในตัวการ์ด ไม่ต้องส่งรูปแยก
    //
    // ทำไมเป็น Flex ไม่ใช่ template buttons: template บีบรูปเป็น 1.51:1 (หรือ 1:1) เสมอ
    // ⇒ โปสเตอร์แนวตั้งโดนครอบหัวท้ายทิ้ง · Flex บอกสัดส่วนเองได้ตามรูปจริง
    // และยังเป็น message object เดียวเท่าเดิม (โควตา 1 ข้อความเท่าข้อความเปล่า)
    const buttons = (content.buttons || []).filter(b => b.label.trim() && b.url.trim());
    const firstButton = buttons[0];
    messages = [{
      type: 'flex',
      altText: (title || text).slice(0, 400),
      contents: {
        type: 'bubble',
        // เต็มความกว้างห้องแชท — การ์ดขนาดมาตรฐานเหลือขอบว่างสองข้างจนแบนเนอร์ดูจิ๋ว
        size: 'giga',
        ...(imageUrl ? {
          hero: {
            type: 'image',
            url: imageUrl,
            size: 'full',
            aspectRatio: imageAspectRatio(content),
            aspectMode: 'cover',
            // แตะรูปแล้วเปิดลิงก์ของปุ่มแรก — โปสเตอร์คือสิ่งที่คนแตะก่อนปุ่ม
            ...(firstButton
              ? { action: { type: 'uri', label: firstButton.label.trim(), uri: firstButton.url.trim() } }
              : {}),
          },
        } : {}),
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: [
            ...(title ? [{ type: 'text', text: title, weight: 'bold', size: 'lg', wrap: true }] : []),
            { type: 'text', text, size: 'sm', color: '#666666', wrap: true },
          ],
        },
        ...(buttons.length ? {
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: buttons.map((b, i) => ({
              type: 'button',
              height: 'sm',
              // ปุ่มแรก = สิ่งที่อยากให้กดที่สุด จึงเป็นปุ่มทึบ ที่เหลือเป็นปุ่มรอง
              style: i === 0 ? 'primary' : 'secondary',
              action: { type: 'uri', label: b.label.trim(), uri: b.url.trim() },
            })),
          },
        } : {}),
      },
    }];

  } else if (content.kind === 'products') {
    const products = content.products || [];
    const cardStyle = content.card_style === 'image' ? 'image' : 'detail';
    const bubbles = products.map(p => productBubble(p, cardStyle));

    // ข้อความเกริ่นเป็น bubble แรก (ถ้ามี) แล้วตามด้วยแถวการ์ด — รวมยังไม่เกิน 3
    if (text) messages.push({ type: 'text', text });
    messages.push({
      type: 'flex',
      altText: (text || title || 'สินค้าแนะนำ').slice(0, 400),
      contents: { type: 'carousel', contents: bubbles },
    });

  } else {
    if (text) {
      if (text.length > LINE_TEXT_MAX) {
        throw new Error(`ข้อความยาวเกิน ${LINE_TEXT_MAX.toLocaleString()} ตัวอักษร`);
      }
      messages.push({ type: 'text', text });
    }
    if (imageUrl) {
      if (!/^https:\/\//i.test(imageUrl)) throw new Error('ลิงก์รูปต้องเป็น https');
      if (content.image_style === 'rich') {
        // รูปเต็มความกว้างห้องแชท + กดได้ — ฟองรูปธรรมดาโดนย่อจนโปสเตอร์อ่านไม่ออก
        messages.push({
          type: 'flex',
          altText: 'รูปภาพ',
          contents: fullWidthImageBubble(imageUrl, imageAspectRatio(content), linkUrl || null),
        });
      } else {
        messages.push({ type: 'image', originalContentUrl: imageUrl, previewImageUrl: imageUrl });
      }
    }
  }

  if (messages.length === 0) throw new Error('ต้องมีข้อความหรือรูปอย่างน้อยหนึ่งอย่าง');
  if (messages.length > LINE_MAX_BUBBLES) {
    throw new Error(`ส่งได้ไม่เกิน ${LINE_MAX_BUBBLES} ส่วนต่อหนึ่งข้อความ`);
  }

  // ปุ่มตอบเร็วเกาะไปกับ object สุดท้ายเสมอ (LINE แสดงของ object ท้ายสุดเท่านั้น)
  if (quickReply) messages[messages.length - 1] = { ...messages[messages.length - 1], quickReply };

  return messages;
}

export function planBroadcastBatches(recipients: BroadcastRecipient[]): BroadcastBatch[] {
  const batches: BroadcastBatch[] = [];
  for (let i = 0; i < recipients.length; i += MULTICAST_BATCH_SIZE) {
    const slice = recipients.slice(i, i + MULTICAST_BATCH_SIZE);
    batches.push({
      index: batches.length,
      retry_key: crypto.randomUUID(),
      user_ids: slice.map(r => r.line_user_id),
      contact_ids: slice.map(r => r.contact_id),
      status: 'pending',
    });
  }
  return batches;
}

// ─── ตัวส่ง ───────────────────────────────────────────────────────────

interface LineSendResult {
  ok: boolean;
  httpStatus: number;
  requestId: string | null;
  error?: string;
}

async function callLineSend(
  path: '/message/multicast' | '/message/broadcast',
  accessToken: string,
  retryKey: string,
  body: Record<string, unknown>,
): Promise<LineSendResult> {
  try {
    const res = await fetch(`${LINE_API}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'X-Line-Retry-Key': retryKey,
      },
      body: JSON.stringify(body),
    });
    const requestId = res.headers.get('X-Line-Request-Id') || res.headers.get('x-line-request-id');
    if (res.ok) return { ok: true, httpStatus: res.status, requestId };
    const err = (await res.json().catch(() => ({}))) as { message?: string };
    return { ok: false, httpStatus: res.status, requestId, error: err.message || `LINE API ${res.status}` };
  } catch (e) {
    return { ok: false, httpStatus: 0, requestId: null, error: e instanceof Error ? e.message : 'network error' };
  }
}

function normalizeBatches(value: unknown): BroadcastBatch[] {
  return Array.isArray(value) ? (value as BroadcastBatch[]) : [];
}

/** สำเนาหนึ่งแถวที่จะไปโผล่ในห้องแชท — หนึ่ง message object = หนึ่งแถว */
export interface BroadcastThreadRow {
  message_type: string;
  content: string;
  raw: Record<string, unknown>;
}

/** ข้อความ + รูปแรกที่เจอในโครง Flex — ใช้ทำบรรทัดอ่านง่ายและรูปประกอบของแถวสำเนา */
function collectFlex(node: unknown, out: { texts: string[]; imageUrl: string | null }): void {
  if (!node || typeof node !== 'object') return;
  const n = node as Record<string, unknown>;
  if (n.type === 'image' && typeof n.url === 'string' && !out.imageUrl) out.imageUrl = n.url;
  if (n.type === 'text' && typeof n.text === 'string') out.texts.push(n.text);
  for (const key of ['contents', 'hero', 'header', 'body', 'footer']) {
    const child = n[key];
    if (Array.isArray(child)) for (const c of child) collectFlex(c, out);
    else if (child) collectFlex(child, out);
  }
}

/**
 * สำเนาในห้องแชท — **หนึ่งแถวต่อ message object** ที่หน้าแชทวาดได้เองจริง ๆ
 *
 * แถวชนิด 'flex' พก `raw_message.flexContents` ไปด้วย หน้าแชทจึงวาดการ์ดผ่าน
 * `LineFlexRenderer` ได้เหมือนข้อความ Flex ทั่วไป (ของเดิมถอดการ์ดเป็นข้อความก้อนเดียว
 * แอดมินจึงเห็นคนละอย่างกับที่ลูกค้าได้รับ) · `content` ยังต้องอ่านรู้เรื่อง เพราะ
 * รายชื่อแชทกับแจ้งเตือนใช้บรรทัดนั้น
 */
function threadRows(
  messages: LineMessageObject[],
  content?: BroadcastContent | null,
): BroadcastThreadRow[] {
  const rows: BroadcastThreadRow[] = [];

  for (const m of messages) {
    if (m.type === 'text') {
      rows.push({ message_type: 'text', content: m.text, raw: {} });
      continue;
    }
    if (m.type === 'image') {
      rows.push({ message_type: 'image', content: '[รูปภาพ]', raw: { imageUrl: m.originalContentUrl } });
      continue;
    }
    if (m.type === 'flex') {
      const found = { texts: [] as string[], imageUrl: null as string | null };
      collectFlex(m.contents, found);

      let line: string;
      if (content?.kind === 'products') {
        // ชื่อสินค้าอ่านรู้เรื่องกว่าข้อความบนการ์ด (แบบรูปเต็มมีแค่ป้ายลดกับราคา)
        const names = (content.products || []).map(p => p.name).filter(Boolean);
        line = names.length ? names.map(n => `• ${n}`).join('\n') : m.altText;
      } else if (content?.kind === 'poster' || (found.texts.length === 0 && found.imageUrl)) {
        line = '[โปสเตอร์]';
      } else {
        line = found.texts.slice(0, 4).join('\n') || m.altText;
      }

      rows.push({
        message_type: 'flex',
        content: line,
        raw: { flexContents: m.contents, ...(found.imageUrl ? { imageUrl: found.imageUrl } : {}) },
      });
      continue;
    }

    // ใบเก่าที่ส่งด้วย template — หน้าแชทมีตัววาดของมันอยู่แล้ว (LineTemplateRenderer)
    const t = m.template;
    if (t.type === 'buttons') {
      rows.push({
        message_type: 'template',
        content: [t.title, t.text].filter(Boolean).join('\n') || m.altText,
        raw: { template: t, ...(t.thumbnailImageUrl ? { imageUrl: t.thumbnailImageUrl } : {}) },
      });
    } else {
      const names = t.columns.map(c => c.title).filter(Boolean);
      const thumb = t.columns.find(c => c.thumbnailImageUrl)?.thumbnailImageUrl;
      rows.push({
        message_type: 'template',
        content: names.map(n => `• ${n}`).join('\n') || m.altText,
        raw: { template: t, ...(thumb ? { imageUrl: thumb } : {}) },
      });
    }
  }

  return rows;
}

/**
 * เขียนข้อความลงห้องแชทของผู้รับ
 *
 * ⚠️ **ห้ามแตะ `last_message_at` / `unread_count`** — บรอดแคสต์ไม่ใช่บทสนทนา
 * ถ้าขยับสองค่านี้ รายชื่อแชททั้งร้านจะถูกสลับลำดับใหม่หมดในคราวเดียว
 */
async function insertThreadRows(
  row: BroadcastRow,
  contactIds: string[],
  rows: BroadcastThreadRow[],
  sentBy: string | null,
): Promise<void> {
  if (contactIds.length === 0 || rows.length === 0) return;
  const baseMs = Date.now();

  for (let r = 0; r < rows.length; r++) {
    const shape = rows[r];
    // ห่างกันมิลลิวินาทีละใบ — เวลาเท่ากันเป๊ะแล้วหน้าแชทเรียงสลับกันได้
    const at = new Date(baseMs + r).toISOString();
    const raw: Record<string, unknown> = { ...shape.raw, broadcast_id: row.id };

    for (let i = 0; i < contactIds.length; i += 200) {
      const chunk = contactIds.slice(i, i + 200).map(contactId => ({
        company_id: row.company_id,
        line_contact_id: contactId,
        direction: 'outgoing',
        message_type: shape.message_type,
        content: shape.content,
        raw_message: raw,
        sent_by: sentBy,
        sent_at: at,
        created_at: at,
      }));
      const { error } = await supabaseAdmin.from('line_messages').insert(chunk);
      if (error) {
        // ข้อความออกไปหาลูกค้าแล้ว — เขียนสำเนาลงห้องแชทไม่ได้ก็ห้ามล้มทั้งงาน
        console.error('[LineBroadcast] insert thread rows failed:', error.message);
      }
    }
  }
}

/** `sent_by` มี FK ไป user_profiles — ผู้ใช้ที่ยังไม่มีโปรไฟล์ต้องเป็น null ไม่งั้น insert ล้มทั้งชุด */
async function resolveSentBy(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from('user_profiles').select('id').eq('id', userId).maybeSingle();
  return data ? userId : null;
}

/**
 * ส่งบรอดแคสต์ใบหนึ่งจนจบ — **เรียกซ้ำได้เสมอ**
 *
 * เดินจากสถานะที่บันทึกไว้ในแถว: ล็อตที่ `sent` แล้วข้าม · ล็อตที่ยังไม่ส่งใช้ retry key
 * เดิมของมัน · หมดงบเวลาก่อนจบก็คงสถานะ `sending` ไว้ให้เรียกต่อ (ปุ่ม "ส่งต่อ" ในหน้ารายการ)
 */
export async function runLineBroadcast(
  broadcastId: string,
  opts: { timeBudgetMs?: number } = {},
): Promise<void> {
  const startedAtMs = Date.now();
  const timeBudgetMs = opts.timeBudgetMs ?? 240_000;

  const patch = (values: Record<string, unknown>) =>
    supabaseAdmin.from('broadcasts').update(values).eq('id', broadcastId);

  try {
    const { data } = await supabaseAdmin.from('broadcasts').select('*').eq('id', broadcastId).single();
    const row = (data as BroadcastRow | null) ?? null;
    if (!row) return;
    if (['sent', 'failed', 'cancelled', 'scheduled'].includes(row.status)) return;

    await patch({ status: 'sending', started_at: row.started_at || new Date().toISOString() });

    const account = await getChatAccount(row.chat_account_id);
    const creds = account && account.company_id === row.company_id ? getLineCredsFromAccount(account) : null;
    if (!creds) {
      await patch({
        status: 'failed',
        error: 'ไม่พบ token ของ LINE OA นี้ — ตรวจที่ ตั้งค่า > ช่องทาง Chat',
        finished_at: new Date().toISOString(),
      });
      return;
    }

    const token = creds.channel_access_token;
    const messages = Array.isArray(row.messages) ? row.messages : [];
    const rows = threadRows(messages, row.content);
    const sentBy = await resolveSentBy(row.created_by);
    const requestIds = Array.isArray(row.platform_request_ids) ? [...row.platform_request_ids] : [];

    // ─ โหมด "ทุกคนที่แอดเพื่อน" — ยิง broadcast ใบเดียว ─────────────────
    if (row.audience_type === 'all') {
      let batches = normalizeBatches(row.batches);
      if (batches.length === 0) {
        // จด retry key ก่อนยิง — ยิงแล้วฟังก์ชันตาย เรียกใหม่จะได้ไม่ส่งซ้ำ
        batches = [{ index: 0, retry_key: crypto.randomUUID(), user_ids: [], contact_ids: [], status: 'pending' }];
        await patch({ batches });
      }
      const batch = batches[0];

      if (batch.status !== 'sent') {
        const res = await callLineSend('/message/broadcast', token, batch.retry_key, { messages });
        if (!res.ok) {
          batch.status = 'failed';
          batch.error = res.error || null;
          await logIntegrationNow({
            company_id: row.company_id,
            integration: 'line',
            account_id: row.chat_account_id,
            direction: 'outgoing',
            action: 'broadcast',
            method: 'POST',
            api_path: '/v2/bot/message/broadcast',
            http_status: res.httpStatus,
            status: 'error',
            error_message: res.error,
            reference_type: 'broadcast',
            reference_id: broadcastId,
          });
          await patch({
            batches,
            failed_count: 1,
            status: res.httpStatus === 429 ? 'partial' : 'failed',
            error: res.error || null,
            finished_at: new Date().toISOString(),
          });
          return;
        }
        batch.status = 'sent';
        if (res.requestId) requestIds.push(res.requestId);
        await patch({ batches, platform_request_ids: requestIds });
      }

      // ข้อความไปถึงผู้ติดตามทุกคนแล้ว — เขียนสำเนาลงห้องแชทของคนที่เรารู้จัก
      const recipients = await resolveBroadcastRecipients(row.company_id, row.chat_account_id, 'contacts', null);
      await insertThreadRows(row, recipients.map(r => r.contact_id), rows, sentBy);

      // recipient_count ของโหมดนี้ = จำนวนผู้ติดตามที่ LINE รายงานตอนสร้าง (โควตาที่ถูกใช้จริง)
      // ห้ามทับด้วยจำนวนผู้ติดต่อที่เรารู้จัก ไม่งั้นหน้ารายการจะโชว์ 1,400/1,400 ทั้งที่ยิงไป 5,000
      const reached = row.recipient_count > 0 ? row.recipient_count : recipients.length;
      await patch({
        recipient_count: reached,
        sent_count: reached,
        status: 'sent',
        error: null,
        finished_at: new Date().toISOString(),
      });
      await logIntegrationNow({
        company_id: row.company_id,
        integration: 'line',
        account_id: row.chat_account_id,
        direction: 'outgoing',
        action: 'broadcast',
        method: 'POST',
        api_path: '/v2/bot/message/broadcast',
        status: 'success',
        reference_type: 'broadcast',
        reference_id: broadcastId,
        reference_label: `ผู้รับ ${recipients.length} คน`,
      });
      return;
    }

    // ─ โหมดเจาะกลุ่ม — multicast ล็อตละ 500 ────────────────────────────
    let batches = normalizeBatches(row.batches);
    if (batches.length === 0) {
      const recipients = await resolveBroadcastRecipients(
        row.company_id, row.chat_account_id, row.audience_type, row.audience_filter,
      );
      if (recipients.length === 0) {
        await patch({
          status: 'failed',
          error: 'ไม่มีผู้รับที่ตรงเงื่อนไข',
          recipient_count: 0,
          finished_at: new Date().toISOString(),
        });
        return;
      }
      batches = planBroadcastBatches(recipients);
      // จดแผนล็อต (พร้อม retry key) ก่อนยิงใบแรกเสมอ
      await patch({ batches, recipient_count: recipients.length });
    }

    // ⚠️ นับจากสถานะของล็อตเสมอ ห้ามบวกสะสม — กด "ส่งต่อ" แล้วล็อตที่เคย failed ถูกลองใหม่
    //    ถ้าบวกสะสมจะนับซ้ำ ตัวเลขบนหน้าจอจะเกินจำนวนผู้รับจริง
    const tally = (status: BroadcastBatch['status']) =>
      batches.filter(b => b.status === status).reduce((sum, b) => sum + b.user_ids.length, 0);
    let sentCount = tally('sent');
    let failedCount = tally('failed');
    let pausedError: string | null = null;

    for (const batch of batches) {
      if (batch.status === 'sent') continue;
      if (Date.now() - startedAtMs > timeBudgetMs) {
        // หมดงบเวลา — คงสถานะ sending ไว้ ผู้เรียกกด "ส่งต่อ" แล้วเดินต่อจากล็อตนี้
        await patch({ batches, sent_count: sentCount, failed_count: failedCount });
        return;
      }

      const res = await callLineSend('/message/multicast', token, batch.retry_key, {
        to: batch.user_ids,
        messages,
      });

      if (res.ok) {
        batch.status = 'sent';
        batch.error = null;
        if (res.requestId) requestIds.push(res.requestId);
        await insertThreadRows(row, batch.contact_ids, rows, sentBy);
        sentCount = tally('sent');
        failedCount = tally('failed');   // ล็อตนี้อาจเคยอยู่ใน failed มาก่อน
        await patch({ batches, sent_count: sentCount, failed_count: failedCount, platform_request_ids: requestIds });
      } else if (res.httpStatus === 429) {
        // โดนจำกัดอัตรา — ล็อตนี้ยัง pending (retry key เดิม) หยุดไว้ก่อน
        batch.status = 'pending';
        batch.error = res.error || null;
        failedCount = tally('failed');
        pausedError = res.error || 'LINE จำกัดอัตราการส่งชั่วคราว — กด "ส่งต่อ" อีกครั้งภายหลัง';
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'line',
          account_id: row.chat_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/v2/bot/message/multicast',
          http_status: res.httpStatus,
          status: 'error',
          error_message: res.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        await patch({
          batches, sent_count: sentCount, failed_count: failedCount,
          status: 'partial', error: pausedError,
        });
        return;
      } else {
        batch.status = 'failed';
        batch.error = res.error || null;
        failedCount = tally('failed');
        await logIntegrationNow({
          company_id: row.company_id,
          integration: 'line',
          account_id: row.chat_account_id,
          direction: 'outgoing',
          action: 'broadcast',
          method: 'POST',
          api_path: '/v2/bot/message/multicast',
          http_status: res.httpStatus,
          status: 'error',
          error_message: res.error,
          reference_type: 'broadcast',
          reference_id: broadcastId,
        });
        await patch({ batches, failed_count: failedCount, error: res.error || null });
      }

      // เว้นจังหวะระหว่างล็อต — ยิงรัวเป็นชุดคือทางลัดไปหา 429
      await new Promise(r => setTimeout(r, 100));
    }

    const anySent = batches.some(b => b.status === 'sent');
    const anyFailed = batches.some(b => b.status !== 'sent');
    // ไม่มีล็อตไหนออกไปได้เลย = ล้มเหลว (ไม่ใช่ "ส่งไม่ครบ") — คนอ่านต้องแยกสองเคสนี้ออก
    const finalStatus: BroadcastStatus = !anySent ? 'failed' : anyFailed ? 'partial' : 'sent';

    await patch({
      batches,
      sent_count: sentCount,
      failed_count: failedCount,
      platform_request_ids: requestIds,
      status: finalStatus,
      finished_at: new Date().toISOString(),
    });

    await logIntegrationNow({
      company_id: row.company_id,
      integration: 'line',
      account_id: row.chat_account_id,
      direction: 'outgoing',
      action: 'broadcast',
      method: 'POST',
      api_path: '/v2/bot/message/multicast',
      status: finalStatus === 'sent' ? 'success' : 'error',
      error_message: finalStatus === 'sent' ? undefined : `ส่งไม่สำเร็จ ${failedCount} คน`,
      reference_type: 'broadcast',
      reference_id: broadcastId,
      reference_label: `ผู้รับ ${sentCount} คน`,
    });
  } catch (e) {
    // อะไรที่หลุดมาถึงตรงนี้คือ bug — บันทึกไว้ที่แถว ห้ามให้ route ล้มตาม
    const message = e instanceof Error ? e.message : 'unknown error';
    console.error('[LineBroadcast] unexpected error:', message);
    await patch({ status: 'failed', error: message, finished_at: new Date().toISOString() });
  }
}
