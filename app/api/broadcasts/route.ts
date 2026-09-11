import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getLineCredsFromAccount } from '@/lib/chat-config';
import {
  BROADCAST_PLATFORMS,
  isBroadcastPlatform,
  type BroadcastPlatform,
} from '@/lib/broadcast/platforms';
import { resolveBroadcastTarget } from '@/lib/broadcast/accounts';
import type { StoredAudienceFilter } from '@/lib/broadcast/audience';
import { runBroadcast } from '@/lib/broadcast/run';
import {
  buildLineMessagesFromContent,
  getLineFollowerStats,
  getLineQuota,
  quotaBlocks,
  resolveBroadcastRecipients,
  type BroadcastAudienceFilter,
  type BroadcastAudienceType,
} from '@/lib/line/broadcast';
import { resolveTikTokRecipients } from '@/lib/tiktok/broadcast';
import {
  blockProductActions,
  broadcastContentPreview,
  broadcastPreviewImage,
  validateBroadcastContent,
  normalizeAction,
  type BroadcastAction,
  type BroadcastBlock,
  type BroadcastButton,
  type BroadcastCard,
  type BroadcastContent,
  type BroadcastProductCard,
  type BroadcastGalleryImage,
} from '@/lib/broadcast/content';
import { fillStorefrontProductLinks } from '@/lib/broadcast/product-links';
import { resolveAccountPicture } from '@/lib/chat/account-picture';

// ส่งจริงเกิดใน after() ของ POST — ต้องให้ฟังก์ชันอยู่ได้นานพอที่จะไล่ล็อตจนจบ
export const maxDuration = 300;

/** กลุ่มผู้รับที่แต่ละช่องทางรองรับ — ส่งค่าที่ช่องทางนั้นไม่รู้จักมา = ปฏิเสธ */
const AUDIENCE_BY_PLATFORM: Record<string, string[]> = {
  line: [
    'all', 'contacts', 'tags', 'contacts_pick',
    'not_bought', 'bought', 'bought_within', 'bought_before', 'bought_once',
  ],
  tiktok: ['buyers_365d', 'tags'],
};

/** เก็บเฉพาะตัวกรองที่กลุ่มนั้นใช้จริง — เก็บทั้งก้อนแล้วอ่านย้อนหลังจะแยกไม่ออกว่าอันไหนมีผล */
function buildStoredFilter(audienceType: string, f: BroadcastAudienceFilter) {
  // ตัวกรองซ้อนใช้ได้กับทุกกลุ่มที่มีรายชื่อจริง — ยกเว้น 'all' (ยิงถึงผู้ติดตามที่เราไม่รู้จัก)
  // และ 'contacts_pick' (เลือกมาเองแล้ว ไม่ต้องกรองซ้ำ)
  const refine = (audienceType === 'all' || audienceType === 'contacts_pick')
    ? {}
    : {
        ...(Number(f.min_messages) > 0 ? { min_messages: Math.floor(Number(f.min_messages)) } : {}),
        ...(Number(f.last_chat_days) > 0 ? { last_chat_days: Math.floor(Number(f.last_chat_days)) } : {}),
      };

  if (audienceType === 'tags') return { tag_ids: f.tag_ids || [], ...refine };
  if (audienceType === 'contacts_pick') return { contact_ids: f.contact_ids || [] };
  if (audienceType === 'bought_within' || audienceType === 'bought_before') {
    return { days: Math.max(1, Number(f.days) || 30), ...refine };
  }
  return refine;
}

interface BroadcastListRow {
  id: string;
  platform: string;
  chat_account_id: string | null;
  marketplace_account_id: string | null;
  created_by: string | null;
  audience_type: string;
  audience_filter: StoredAudienceFilter | null;
  preview: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  error: string | null;
  scheduled_at: string | null;
  cancelled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  /** ใช้แค่หา content_kind — ไม่ส่งกลับไปทั้งก้อน (หน้ารายการไม่ต้องใช้ และมันใหญ่) */
  content: BroadcastContent | null;
  messages: unknown;
}

interface ReplyStatsRow {
  broadcast_id: string;
  recipient_count: number;
  replied_count: number;
  awaiting_count: number;
  ordered_count: number;
  /** numeric ของ Postgres มาเป็นสตริง */
  ordered_amount: string | number;
}

/** ใบที่เริ่มส่งแล้ว = มีผลลัพธ์ให้วัด (ตั้งเวลา/ยกเลิก/ล้ม ยังไม่มีอะไรให้นับ) */
const MEASURABLE_STATUSES = ['sending', 'sent', 'partial'];

/**
 * วันจากตัวเลือกช่วงวัน (`yyyy-MM-dd` ตามเวลาไทย) → เวลา UTC ของเที่ยงคืนวันนั้น (+ `addDays`)
 * · รูปแบบผิด = null (ไม่กรองฝั่งนั้น) · ตัดมิลลิวินาทีทิ้ง ค่าจะได้ไม่มีจุดปนในตัวกรอง `or` ของ PostgREST
 */
function bangkokDayStart(day: string | null, addDays = 0): string | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const d = new Date(`${day}T00:00:00+07:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + addDays);
  return `${d.toISOString().slice(0, 19)}Z`;
}

/** ตั้งเวลาต้องเผื่อให้ cron (ทุก 5 นาที) หยิบทัน และไม่ให้ตั้งไกลจนลืมว่าตั้งไว้ */
const SCHEDULE_MIN_MS = 2 * 60_000;
const SCHEDULE_MAX_MS = 90 * 86_400_000;
const SCHEDULE_ERROR = 'เวลาที่ตั้งต้องอยู่หลังจากนี้อย่างน้อย 2 นาที และไม่เกิน 90 วัน';

// GET — รายการบรอดแคสต์ของบริษัท (ใหม่สุดก่อน)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 200);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    // ช่วงวัน — กรองด้วย "วันที่ส่ง" ตัวเดียวกับที่หน้ารายการโชว์: เวลาเริ่มส่ง → ยังไม่เริ่ม
    // (ตั้งเวลา/ยกเลิก) ใช้เวลาที่ตั้ง → ไม่มีทั้งคู่ใช้เวลาสร้าง · กรองแค่ created_at ไม่ได้ —
    // ใบที่สร้าง 31 ส.ค. ตั้งส่ง 1 ก.ย. จะไปโผล่ใน "เดือนที่แล้ว" ทั้งที่หน้ารายการบอกว่าส่ง 1 ก.ย.
    const from = bangkokDayStart(searchParams.get('date_from'));
    const to = bangkokDayStart(searchParams.get('date_to'), 1);
    const filtered = !!(from || to);

    let listQuery = supabaseAdmin
      .from('broadcasts')
      .select('id, platform, chat_account_id, marketplace_account_id, created_by, audience_type, audience_filter, preview, recipient_count, sent_count, failed_count, status, error, scheduled_at, cancelled_at, started_at, finished_at, created_at, content, messages', { count: 'exact' })
      .eq('company_id', auth.companyId);
    if (filtered) {
      const within = (col: string) =>
        [from && `${col}.gte.${from}`, to && `${col}.lt.${to}`].filter(Boolean).join(',');
      listQuery = listQuery.or([
        `and(${within('started_at')})`,
        `and(started_at.is.null,scheduled_at.not.is.null,${within('scheduled_at')})`,
        `and(started_at.is.null,scheduled_at.is.null,${within('created_at')})`,
      ].join(','));
    }

    // รอบแรกถามพร้อมกัน: หน้าที่ขอ + มีใบที่ยังส่งไม่จบไหม (= หน้ารายการต้อง poll ต่อ)
    // ใบที่ "ตั้งเวลาไว้" ไม่นับ — cron เป็นคนหยิบไปส่ง อีกนานกว่าจะขยับ
    const [listRes, activeRes] = await Promise.all([
      listQuery.order('created_at', { ascending: false }).range(offset, offset + limit - 1),
      supabaseAdmin
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', auth.companyId)
        .in('status', ['pending', 'sending']),
    ]);
    if (listRes.error) throw listRes.error;

    const rows = (listRes.data || []) as unknown as BroadcastListRow[];
    const total = listRes.count ?? rows.length;

    // รอบสอง (พร้อมกันหมด — ของเดิมถามต่อกันเป็นทอด 4 รอบ):
    //  · ชื่อบัญชี + ชื่อผู้ส่ง — บัญชีอยู่คนละตารางตามช่องทาง และ created_by ไม่มี FK ไป user_profiles จึง embed ไม่ได้
    //  · ผลตอบกลับ/สั่งซื้อ — ตามได้เฉพาะช่องทางที่มีห้องแชทของเราเอง
    //  · ช่วงที่เลือกว่าง → ร้านเคยส่งเลยไหม (ว่างเพราะช่วงวัน ≠ ไม่เคยส่ง — หน้ารายการโชว์คนละแบบ)
    const chatIds = [...new Set(rows.map(r => r.chat_account_id).filter((v): v is string => !!v))];
    const shopIds = [...new Set(rows.map(r => r.marketplace_account_id).filter((v): v is string => !!v))];
    const userIds = [...new Set(rows.map(r => r.created_by).filter((v): v is string => !!v))];
    const statIds = rows
      .filter(r => r.chat_account_id && MEASURABLE_STATUSES.includes(r.status))
      .map(r => r.id);

    const [chatRes, shopRes, usersRes, statsRes, anyRes] = await Promise.all([
      chatIds.length
        ? supabaseAdmin.from('chat_accounts').select('id, account_name, platform, credentials').in('id', chatIds)
        : Promise.resolve({ data: [] as { id: string; account_name: string; platform: string; credentials: unknown }[] }),
      shopIds.length
        ? supabaseAdmin.from('marketplace_accounts').select('id, shop_name, metadata').in('id', shopIds)
        : Promise.resolve({ data: [] as { id: string; shop_name: string; metadata: unknown }[] }),
      userIds.length
        ? supabaseAdmin.from('user_profiles').select('id, name').in('id', userIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      statIds.length
        ? supabaseAdmin.rpc('get_broadcast_reply_stats', { p_company_id: auth.companyId, p_broadcast_ids: statIds })
        : Promise.resolve({ data: [] as ReplyStatsRow[], error: null }),
      total === 0 && filtered
        ? supabaseAdmin.from('broadcasts').select('id', { count: 'exact', head: true }).eq('company_id', auth.companyId)
        : Promise.resolve({ count: total }),
    ]);

    // ตัวเลขวัดผลอ่านไม่ได้ต้องไม่ทำให้หน้ารายการพัง — ปล่อยเป็น null แล้วรายการยังใช้ได้
    if (statsRes.error) console.error('[broadcast] get_broadcast_reply_stats:', statsRes.error.message);
    const statsById = new Map(((statsRes.data || []) as ReplyStatsRow[]).map(s => [s.broadcast_id, s]));

    // ชื่อ + รูปบัญชี (กฎหารูปชุดเดียวกับหน้าแชท/กลุ่มเป้าหมาย) — credentials อ่านที่ server เพื่อหารูปเท่านั้น ห้ามส่งออก
    const accounts = new Map<string, { name: string | null; picture: string | null }>();
    for (const a of chatRes.data || []) {
      accounts.set(a.id, {
        name: a.account_name || null,
        picture: resolveAccountPicture(a.platform, (a.credentials as Record<string, unknown> | null) ?? null, {}),
      });
    }
    for (const a of shopRes.data || []) {
      const logo = (a.metadata as Record<string, unknown> | null)?.shop_logo;
      accounts.set(a.id, { name: a.shop_name || null, picture: typeof logo === 'string' && logo ? logo : null });
    }
    const userName = new Map((usersRes.data || []).map(u => [u.id, u.name]));

    return NextResponse.json({
      broadcasts: rows.map(({ content, messages, ...r }) => {
        const st = statsById.get(r.id);
        const account = accounts.get(r.chat_account_id || r.marketplace_account_id || '');
        return {
          ...r,
          preview_image: broadcastPreviewImage(content, messages),
          account_name: account?.name ?? null,
          account_picture_url: account?.picture ?? null,
          created_by_name: r.created_by ? userName.get(r.created_by) || null : null,
          stats: st
            ? {
                replied_count: Number(st.replied_count) || 0,
                awaiting_count: Number(st.awaiting_count) || 0,
                ordered_count: Number(st.ordered_count) || 0,
                ordered_amount: Number(st.ordered_amount) || 0,
              }
            : null,
        };
      }),
      total,
      has_any: (anyRes.count ?? 0) > 0,
      sending: (activeRes.count ?? 0) > 0,
    });
  } catch (e) {
    console.error('GET broadcasts error:', e);
    return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
  }
}

/** ขนาดรูปจาก client — ค่าที่ไม่ใช่จำนวนเต็มบวกถือว่า "ไม่รู้ขนาด" */
function toDim(value: unknown): number | null {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** จำนวนเงินจาก client — ค่าที่อ่านไม่ออกถือว่า "ไม่รู้ราคา" (ห้ามเดาเป็น 0) */
function toMoney(value: unknown, min: number): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n >= min ? n : null;
}

/** ลิงก์จาก client — รับเฉพาะสตริงที่มีเนื้อ (ตรวจ https ต่อที่ validateBroadcastContent) */
function toUrl(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * การ์ดสินค้าจาก client — **รับเฉพาะช่องที่เรารู้จัก**
 * body มาจากเบราว์เซอร์ เก็บทั้งก้อนลง DB แล้วจะมีอะไรก็ไม่รู้ติดไปกับข้อความที่ส่งลูกค้า
 */
function toProductCard(raw: unknown): BroadcastProductCard {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    product_id: typeof r.product_id === 'string' ? r.product_id : null,
    variation_id: typeof r.variation_id === 'string' ? r.variation_id : null,
    name: String(r.name ?? '').slice(0, 200),
    image_url: typeof r.image_url === 'string' ? r.image_url : null,
    price: toMoney(r.price, 0),
    compare_at_price: toMoney(r.compare_at_price, 1),
    url: toUrl(r.url),
  };
}

/** ปุ่มบนการ์ดจาก client — ป้าย + "กดแล้วเกิดอะไร" (รับ `url` เปล่า ๆ ของใบเก่าด้วย) */
function toButton(raw: unknown): BroadcastButton {
  const r = (raw || {}) as Record<string, unknown>;
  const legacyUrl = toUrl(r.url);
  return {
    label: String(r.label ?? '').slice(0, 50),
    action: normalizeAction(r.action, toProductCard) ?? (legacyUrl ? { type: 'url', url: legacyUrl } : null),
  };
}

/** รูปหนึ่งใบของ gallery จาก client — URL + ขนาด + "กดแล้วเกิดอะไร" */
function toGalleryImage(raw: unknown): BroadcastGalleryImage {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    image_url: toUrl(r.image_url) || '',
    image_width: toDim(r.image_width),
    image_height: toDim(r.image_height),
    action: normalizeAction(r.action, toProductCard),
  };
}

/** การ์ดหนึ่งใบของบล็อกการ์ด — รับเฉพาะช่องที่รู้จัก (ความยาว/จำนวนจริงตรวจที่ validateBroadcastContent) */
function toCard(raw: unknown): BroadcastCard {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    product: r.product ? toProductCard(r.product) : null,
    image_url: toUrl(r.image_url),
    title: String(r.title ?? '').slice(0, 500),
    text: String(r.text ?? '').slice(0, 1000),
    buttons: (Array.isArray(r.buttons) ? r.buttons : []).map(b => {
      const br = (b || {}) as Record<string, unknown>;
      return { label: String(br.label ?? '').slice(0, 50), action: normalizeAction(br.action, toProductCard) };
    }),
    tap_action: normalizeAction(r.tap_action, toProductCard),
  };
}

/** บล็อกหนึ่งอันจาก client — ชนิดที่ไม่รู้จัก = null (POST ปฏิเสธทั้งใบ ไม่ตัดทิ้งเงียบ ๆ) */
function toBlock(raw: unknown): BroadcastBlock | null {
  const r = (raw || {}) as Record<string, unknown>;
  if (r.type === 'text') return { type: 'text', text: typeof r.text === 'string' ? r.text : '' };
  if (r.type === 'image' || r.type === 'rich') {
    const image = { image_url: toUrl(r.image_url) || '', image_width: toDim(r.image_width), image_height: toDim(r.image_height) };
    return r.type === 'image'
      ? { type: 'image', ...image }
      : { type: 'rich', ...image, action: normalizeAction(r.action, toProductCard) };
  }
  if (r.type === 'cards') {
    return {
      type: 'cards',
      ratio: r.ratio === '3:4' ? '3:4' : '1:1',
      cards: (Array.isArray(r.cards) ? r.cards : []).map(toCard),
    };
  }
  return null;
}

// POST — สร้างบรอดแคสต์แล้วเริ่มส่งทันที
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const accountId: string = body.account_id || '';
    const audienceType: string = body.audience_type;
    const audienceFilter: BroadcastAudienceFilter = body.audience_filter || {};

    if (!isBroadcastPlatform(body.platform)) {
      return NextResponse.json({ error: 'ช่องทางไม่ถูกต้อง' }, { status: 400 });
    }
    const platform: BroadcastPlatform = body.platform;
    if (!accountId) return NextResponse.json({ error: 'กรุณาเลือกบัญชีที่จะใช้ส่ง' }, { status: 400 });
    if (!(AUDIENCE_BY_PLATFORM[platform] || []).includes(audienceType)) {
      return NextResponse.json({ error: 'กลุ่มผู้รับไม่ถูกต้องสำหรับช่องทางนี้' }, { status: 400 });
    }

    // ตั้งเวลาส่ง (ไม่ส่งมา = ส่งทันทีเหมือนเดิม)
    let scheduledAt: string | null = null;
    if (body.scheduled_at) {
      const at = new Date(body.scheduled_at).getTime();
      if (isNaN(at)) return NextResponse.json({ error: SCHEDULE_ERROR }, { status: 400 });
      const delta = at - Date.now();
      if (delta < SCHEDULE_MIN_MS || delta > SCHEDULE_MAX_MS) {
        return NextResponse.json({ error: SCHEDULE_ERROR }, { status: 400 });
      }
      scheduledAt = new Date(at).toISOString();
    }

    const { target, error: targetError } = await resolveBroadcastTarget(auth.companyId, platform, accountId);
    if (!target) return NextResponse.json({ error: targetError }, { status: 400 });

    // เนื้อหาเป็น "ชนิดกลาง" — ตรวจด้วยฟังก์ชันเดียวกับที่หน้าจอใช้ ผู้ใช้จึงไม่มีทาง
    // เจอกรณีที่หน้าจอบอกว่าได้แล้ว API ปฏิเสธ
    // แบบบล็อก (ใบใหม่ทั้งหมด) เก็บทุกอย่างใน blocks — ช่องของชนิดเดิมไม่รับ (client แนบมาก็ไม่เก็บ)
    const isBlocks = body.content?.kind === 'blocks';
    const blocks: (BroadcastBlock | null)[] = isBlocks && Array.isArray(body.content?.blocks)
      ? body.content.blocks.map(toBlock)
      : [];
    if (blocks.some(b => !b)) return NextResponse.json({ error: 'บล็อกไม่ถูกต้อง' }, { status: 400 });
    const content: BroadcastContent = isBlocks ? {
      kind: 'blocks',
      text: '',
      blocks: blocks as BroadcastBlock[],
      quick_replies: body.content?.quick_replies || [],
    } : {
      kind: body.content?.kind || 'announce',
      title: body.content?.title || '',
      text: body.content?.text || '',
      image_url: body.content?.image_url || null,
      // ขนาดรูปที่หน้าจอวัดมา — ใช้บอกสัดส่วนการ์ด Flex ของ LINE (ไม่ส่งมา = ทรงเดิม)
      image_width: toDim(body.content?.image_width),
      image_height: toDim(body.content?.image_height),
      // รูปของ announce เป็นฟองรูปธรรมดาหรือรูปเต็มจอ · ค่าที่ไม่รู้จักตกเป็นแบบเดิม
      image_style: body.content?.image_style === 'rich' ? 'rich' : 'bubble',
      link_url: toUrl(body.content?.link_url),
      // โปสเตอร์: กดรูปแล้วเกิดอะไร (ทะเบียนกลาง) — ส่ง link_url เปล่า ๆ แบบใบเก่ามาก็ยังอ่านออก
      tap_action: normalizeAction(body.content?.tap_action, toProductCard)
        ?? (toUrl(body.content?.link_url) ? { type: 'url', url: toUrl(body.content?.link_url) as string } : null),
      card_style: body.content?.card_style === 'image' ? 'image' : 'detail',
      buttons: (Array.isArray(body.content?.buttons) ? body.content.buttons : []).map(toButton),
      images: (Array.isArray(body.content?.images) ? body.content.images : []).map(toGalleryImage),
      products: (Array.isArray(body.content?.products) ? body.content.products : []).map(toProductCard),
      quick_replies: body.content?.quick_replies || [],
    };
    const contentError = validateBroadcastContent(platform, content);
    if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });

    // ลิงก์การ์ดสินค้าเติมให้เองจากหน้าร้านออนไลน์ — **ลิงก์เปลี่ยนเองเมื่อร้านเปิด
    // storefront ไม่ต้องแก้ใบ** · ทำก่อนแปลงเป็นข้อความของแพลตฟอร์ม ไม่งั้นการ์ดที่ส่ง
    // ออกไปจะยังเป็นปุ่ม "สนใจสินค้านี้" ทั้งที่มีหน้าสินค้าให้ลิงก์แล้ว
    // "ไปที่สินค้า" ทุกจุด (รูปโปสเตอร์ · ปุ่มโปรโมชัน) — เติมลิงก์หน้าสินค้าในหน้าร้านออนไลน์ให้
    // ตัวเลือกนี้ผูกกับหน้าร้านโดยตรง: เติมไม่ได้ (ร้านยังไม่เปิด / สินค้าไม่แสดงบนหน้าร้าน) = ปฏิเสธ
    // ไม่ตกไปเป็นข้อความเงียบ ๆ เหมือนปุ่มการ์ดสินค้า
    const productActions: Extract<BroadcastAction, { type: 'product' }>[] = [];
    if (content.kind === 'poster' && content.tap_action?.type === 'product' && content.tap_action.product) {
      productActions.push(content.tap_action);
    }
    for (const b of content.buttons || []) {
      if (b.action?.type === 'product' && b.action.product) productActions.push(b.action);
    }
    for (const img of content.images || []) {
      if (img.action?.type === 'product' && img.action.product) productActions.push(img.action);
    }
    // บล็อก: กดรูปเต็มจอ · กดตัวการ์ด · ปุ่มบนการ์ด
    if (content.kind === 'blocks') productActions.push(...blockProductActions(content.blocks || []));
    if (productActions.length > 0) {
      const filled = await fillStorefrontProductLinks(
        auth.companyId,
        productActions.map(a => a.product as BroadcastProductCard),
      );
      productActions.forEach((a, i) => { a.product = filled[i]; });
      if (filled.some(p => !p.url)) {
        return NextResponse.json({
          error: 'ไปที่สินค้าได้เมื่อร้านเปิดหน้าร้านออนไลน์และสินค้าแสดงบนหน้าร้าน — เลือกเปิดลิงก์หรือส่งข้อความกลับแทน',
        }, { status: 400 });
      }
    }
    if ((content.products || []).length > 0) {
      content.products = await fillStorefrontProductLinks(auth.companyId, content.products || []);
    }

    let messages: unknown;
    let recipientCount: number;
    const preview = broadcastContentPreview(content);

    // ─── LINE ───────────────────────────────────────────────────────────
    if (platform === 'line') {
      const creds = getLineCredsFromAccount(target.row);
      if (!creds) {
        return NextResponse.json({ error: 'ช่องทางนี้ยังไม่ได้ตั้งค่า token — ตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' }, { status: 400 });
      }
      try {
        messages = buildLineMessagesFromContent(content);
      } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'ข้อความไม่ถูกต้อง' }, { status: 400 });
      }

      // โหมด 'all' ยิงถึงผู้ติดตามทุกคนซึ่งเราไม่มีรายชื่อ ใช้ตัวเลขจาก LINE แทน
      // (reachable = targetedReaches ไม่ใช่ followers — ดูเหตุผลใน getLineFollowerStats)
      if (audienceType === 'all') {
        const stats = await getLineFollowerStats(creds.channel_access_token);
        if (stats.reachable !== null) {
          recipientCount = stats.reachable;
        } else {
          const known = await resolveBroadcastRecipients(auth.companyId, accountId, 'contacts', null);
          recipientCount = known.length;
        }
      } else {
        const recipients = await resolveBroadcastRecipients(
          auth.companyId, accountId, audienceType as BroadcastAudienceType, audienceFilter,
        );
        if (recipients.length === 0) {
          return NextResponse.json({ error: 'ไม่มีผู้รับที่ตรงเงื่อนไข' }, { status: 400 });
        }
        recipientCount = recipients.length;
      }

      // โควตาไม่พอ = ปฏิเสธตั้งแต่ต้น — ยิงไปครึ่งทางแล้วโดนตัดคือของแพงกว่า
      const quota = await getLineQuota(creds.channel_access_token);
      if (quotaBlocks(quota, recipientCount)) {
        return NextResponse.json({
          error: `โควตาข้อความของ OA เหลือ ${quota.remaining?.toLocaleString()} ข้อความ แต่ต้องใช้ ${recipientCount.toLocaleString()} ข้อความ`,
        }, { status: 400 });
      }

    // ─── TikTok Shop ────────────────────────────────────────────────────
    } else if (platform === 'tiktok') {
      const recipients = await resolveTikTokRecipients(
        auth.companyId, target.marketplaceAccountId!, audienceType, audienceFilter,
      );
      if (recipients.length === 0) {
        return NextResponse.json({
          error: 'ไม่มีผู้รับที่ตรงเงื่อนไข — TikTok ให้ทักได้เฉพาะลูกค้าที่เคยสั่งซื้อภายใน 365 วัน',
        }, { status: 400 });
      }
      recipientCount = recipients.length;

      // การ์ดสินค้าของ TikTok อ้าง id ฝั่งเขา ไม่ใช่ uuid ของเรา — แปลงผ่าน link ที่ผูกไว้
      // สินค้าที่ยังไม่เคยผูกกับร้านนี้ก็ตกไปเฉย ๆ (ข้อความยังส่งได้ ไม่ล้มทั้งใบ)
      let tiktokProductIds: string[] = [];
      const ourIds = (content.products || []).map(p => p.product_id).filter((v): v is string => !!v);
      if (ourIds.length) {
        const { data: links } = await supabaseAdmin
          .from('marketplace_product_links')
          .select('product_id, external_item_id')
          .eq('company_id', auth.companyId)
          .eq('account_id', target.marketplaceAccountId!)
          .in('product_id', ourIds);
        tiktokProductIds = [...new Set((links || [])
          .map(l => l.external_item_id as string)
          .filter(Boolean))].slice(0, 4);
      }

      messages = {
        title: (content.title || '').trim(),
        body: (content.text || '').trim(),
        ...(tiktokProductIds.length ? { product_ids: tiktokProductIds } : {}),
      };

    } else {
      // ช่องทางอื่นถูกกันไปแล้วที่ resolveBroadcastTarget — กันไว้อีกชั้นกัน branch หลุด
      return NextResponse.json({ error: BROADCAST_PLATFORMS[platform].reason || 'ช่องทางนี้ยังส่งไม่ได้' }, { status: 400 });
    }

    // ⚠️ จำนวนผู้รับ/โควตาที่นับข้างบนเป็น **ภาพตอนกดสร้าง** — ใบที่ตั้งเวลาไว้จะได้
    // รายชื่อจริงตอนถึงเวลาส่ง เพราะตัวส่งวางแผนล็อตเองเมื่อ `batches` ยังว่าง
    // (คนที่แอดเพื่อนเพิ่ม/ซื้อของระหว่างรอ จึงได้รับด้วย)
    const { data: created, error } = await supabaseAdmin
      .from('broadcasts')
      .insert({
        company_id: auth.companyId,
        platform,
        chat_account_id: target.chatAccountId,
        marketplace_account_id: target.marketplaceAccountId,
        created_by: auth.userId || null,
        audience_type: audienceType,
        audience_filter: buildStoredFilter(audienceType, audienceFilter),
        // เก็บเนื้อหาชนิดกลางไว้ด้วย — `messages` เป็นของแพลตฟอร์มไปแล้ว
        // แปลงกลับมาแก้/ส่งซ้ำ/แสดงบนหน้ารายงานไม่ได้
        content,
        messages,
        preview,
        recipient_count: recipientCount,
        scheduled_at: scheduledAt,
        status: scheduledAt ? 'scheduled' : 'pending',
      })
      .select('id')
      .single();
    if (error) throw error;

    // ตั้งเวลาไว้ = ไม่ส่งตอนนี้ · cron /api/broadcasts/run-scheduled หยิบไปเมื่อถึงเวลา
    if (scheduledAt) return NextResponse.json({ id: created.id, scheduled_at: scheduledAt });

    // งานส่งอยู่หลัง response — ต้องผ่าน after() ไม่งั้น Vercel freeze ฟังก์ชันทิ้งกลางทาง
    after(() => runBroadcast(created.id, platform));

    return NextResponse.json({ id: created.id });
  } catch (e) {
    console.error('POST broadcast error:', e);
    return NextResponse.json({ error: 'สร้างบรอดแคสต์ไม่สำเร็จ' }, { status: 500 });
  }
}
