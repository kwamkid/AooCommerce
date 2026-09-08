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
  broadcastContentPreview,
  resolveBroadcastContentKind,
  validateBroadcastContent,
  type BroadcastContent,
} from '@/lib/broadcast/content';

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
/** ช่วงของ KPI บนหัวหน้ารายการ */
const SUMMARY_DAYS = 30;
/** เพดานใบที่เอามาสรุป — ร้านที่ยิงถี่มากไม่ควรทำให้หน้ารายการช้า */
const SUMMARY_MAX_ROWS = 200;

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

    const { data, error, count } = await supabaseAdmin
      .from('broadcasts')
      .select('id, platform, chat_account_id, marketplace_account_id, created_by, audience_type, audience_filter, preview, recipient_count, sent_count, failed_count, status, error, scheduled_at, cancelled_at, started_at, finished_at, created_at, content, messages', { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data || []) as unknown as BroadcastListRow[];

    // ชื่อบัญชี + ชื่อผู้ส่ง — บัญชีอยู่คนละตารางตามช่องทาง และ created_by ไม่มี FK
    // ไป user_profiles จึง embed ไม่ได้ ต้องถามแยก
    const chatIds = [...new Set(rows.map(r => r.chat_account_id).filter((v): v is string => !!v))];
    const shopIds = [...new Set(rows.map(r => r.marketplace_account_id).filter((v): v is string => !!v))];
    const userIds = [...new Set(rows.map(r => r.created_by).filter((v): v is string => !!v))];

    const [chatRes, shopRes, usersRes] = await Promise.all([
      chatIds.length
        ? supabaseAdmin.from('chat_accounts').select('id, account_name').in('id', chatIds)
        : Promise.resolve({ data: [] as { id: string; account_name: string }[] }),
      shopIds.length
        ? supabaseAdmin.from('marketplace_accounts').select('id, shop_name').in('id', shopIds)
        : Promise.resolve({ data: [] as { id: string; shop_name: string }[] }),
      userIds.length
        ? supabaseAdmin.from('user_profiles').select('id, name').in('id', userIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);

    const accountName = new Map<string, string>([
      ...(chatRes.data || []).map(a => [a.id, a.account_name] as [string, string]),
      ...(shopRes.data || []).map(a => [a.id, a.shop_name] as [string, string]),
    ]);
    const userName = new Map((usersRes.data || []).map(u => [u.id, u.name]));

    // มีใบที่ยังส่งไม่จบ = หน้ารายการต้อง poll ต่อ (ไม่มีก็หยุด ไม่ยิงถี่เปล่า ๆ)
    // ใบที่ "ตั้งเวลาไว้" ไม่ต้อง poll — cron เป็นคนหยิบไปส่ง อีกนานกว่าจะขยับ
    const [{ count: activeCount }, { count: scheduledCount }, { data: recentRaw }] = await Promise.all([
      supabaseAdmin
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', auth.companyId)
        .in('status', ['pending', 'sending']),
      supabaseAdmin
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', auth.companyId)
        .eq('status', 'scheduled'),
      // KPI 30 วันบนหัวหน้ารายการ — นับเฉพาะใบที่ส่งจริงแล้ว
      supabaseAdmin
        .from('broadcasts')
        .select('id, chat_account_id, sent_count')
        .eq('company_id', auth.companyId)
        .gte('created_at', new Date(Date.now() - SUMMARY_DAYS * 86_400_000).toISOString())
        .in('status', MEASURABLE_STATUSES)
        .order('created_at', { ascending: false })
        .limit(SUMMARY_MAX_ROWS),
    ]);

    const recent = (recentRaw || []) as { id: string; chat_account_id: string | null; sent_count: number }[];

    // ผลลัพธ์ (ตอบกลับ/สั่งซื้อ) ตามได้เฉพาะช่องทางที่มีห้องแชทของเราเอง —
    // ยิง RPC ครั้งเดียวครอบทั้งใบในหน้านี้และใบที่ใช้สรุป 30 วัน (id ซ้ำตัดทิ้ง)
    const pageStatIds = rows
      .filter(r => r.chat_account_id && MEASURABLE_STATUSES.includes(r.status))
      .map(r => r.id);
    const summaryStatIds = recent.filter(r => r.chat_account_id).map(r => r.id);
    const statIds = [...new Set([...pageStatIds, ...summaryStatIds])];

    const statsById = new Map<string, ReplyStatsRow>();
    if (statIds.length > 0) {
      const { data: statsData, error: statsError } = await supabaseAdmin.rpc('get_broadcast_reply_stats', {
        p_company_id: auth.companyId,
        p_broadcast_ids: statIds,
      });
      // ตัวเลขวัดผลอ่านไม่ได้ต้องไม่ทำให้หน้ารายการพัง — ปล่อยเป็น null แล้วรายการยังใช้ได้
      if (statsError) console.error('[broadcast] get_broadcast_reply_stats:', statsError.message);
      for (const row of (statsData || []) as ReplyStatsRow[]) statsById.set(row.broadcast_id, row);
    }

    const summary = {
      days: SUMMARY_DAYS,
      broadcasts: recent.length,
      sent_messages: recent.reduce((sum, r) => sum + (Number(r.sent_count) || 0), 0),
      replied: 0,
      awaiting: 0,
      ordered: 0,
      ordered_amount: 0,
    };
    for (const r of summaryStatIds) {
      const st = statsById.get(r);
      if (!st) continue;
      summary.replied += Number(st.replied_count) || 0;
      summary.awaiting += Number(st.awaiting_count) || 0;
      summary.ordered += Number(st.ordered_count) || 0;
      summary.ordered_amount += Number(st.ordered_amount) || 0;
    }

    return NextResponse.json({
      broadcasts: rows.map(({ content, messages, ...r }) => {
        const st = statsById.get(r.id);
        return {
          ...r,
          content_kind: resolveBroadcastContentKind(content, messages),
          account_name: accountName.get(r.chat_account_id || r.marketplace_account_id || '') || null,
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
      total: count ?? rows.length,
      sending: (activeCount ?? 0) > 0,
      scheduled: scheduledCount ?? 0,
      summary,
    });
  } catch (e) {
    console.error('GET broadcasts error:', e);
    return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 });
  }
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
    const content: BroadcastContent = {
      kind: body.content?.kind || 'announce',
      title: body.content?.title || '',
      text: body.content?.text || '',
      image_url: body.content?.image_url || null,
      buttons: body.content?.buttons || [],
      products: body.content?.products || [],
      quick_replies: body.content?.quick_replies || [],
    };
    const contentError = validateBroadcastContent(platform, content);
    if (contentError) return NextResponse.json({ error: contentError }, { status: 400 });

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
