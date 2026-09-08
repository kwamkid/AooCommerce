import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { resolveAccountPicture } from '@/lib/chat/account-picture';
import { resolveBroadcastContentKind, type BroadcastContent } from '@/lib/broadcast/content';

/** ตัวกรองรายชื่อผู้รับ — ต้องตรงกับ p_filter ของ RPC get_broadcast_recipients */
const RECIPIENT_FILTERS = ['all', 'replied', 'ordered', 'failed', 'awaiting'] as const;
type RecipientFilter = (typeof RECIPIENT_FILTERS)[number];

interface ReplyStatsRow {
  broadcast_id: string;
  recipient_count: number;
  replied_count: number;
  awaiting_count: number;
  ordered_count: number;
  /** numeric ของ Postgres มาเป็นสตริง — ต้อง Number() ก่อนใช้ */
  ordered_amount: string | number;
}

interface BroadcastDetailRow {
  id: string;
  platform: string;
  status: string;
  audience_type: string;
  audience_filter: Record<string, unknown> | null;
  preview: string | null;
  content: BroadcastContent | null;
  messages: unknown;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  error: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  created_by: string | null;
  chat_account_id: string | null;
  marketplace_account_id: string | null;
}

interface RecipientRpcRow {
  contact_id: string;
  display_name: string | null;
  picture_url: string | null;
  customer_id: string | null;
  sent: boolean;
  replied_at: string | null;
  reply_preview: string | null;
  awaiting: boolean;
  order_count: number;
  order_amount: string | number;
  /** จำนวนทั้งหมดหลังกรอง — ซ้ำมาทุกแถว (ไว้ทำ pagination) */
  total_count: string | number;
}

// GET — บรอดแคสต์ใบเดียว + ผลลัพธ์ + รายชื่อผู้รับ (หน้ารายงาน)
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const filterParam = searchParams.get('filter') || 'all';
    const filter: RecipientFilter = (RECIPIENT_FILTERS as readonly string[]).includes(filterParam)
      ? (filterParam as RecipientFilter)
      : 'all';
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 20, 1), 200);
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0);

    const { data, error } = await supabaseAdmin
      .from('broadcasts')
      .select('id, platform, status, audience_type, audience_filter, preview, content, messages, recipient_count, sent_count, failed_count, error, scheduled_at, started_at, finished_at, cancelled_at, created_at, created_by, chat_account_id, marketplace_account_id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'ไม่พบบรอดแคสต์นี้' }, { status: 404 });
    const row = data as unknown as BroadcastDetailRow;

    // ผลลัพธ์/รายชื่อผู้รับตามได้เฉพาะช่องทางที่มีห้องแชทของเราเอง (LINE) —
    // ข้อความ TikTok ไปโผล่ในแชทฝั่งแพลตฟอร์มซึ่งเราไม่มีห้องนั้นในระบบ
    const trackable = !!row.chat_account_id;

    const [accountInfo, userRes, statsRes, recipientsRes] = await Promise.all([
      resolveAccountInfo(auth.companyId, row.chat_account_id, row.marketplace_account_id),
      row.created_by
        ? supabaseAdmin.from('user_profiles').select('name').eq('id', row.created_by).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      trackable
        ? supabaseAdmin.rpc('get_broadcast_reply_stats', {
            p_company_id: auth.companyId,
            p_broadcast_ids: [id],
          })
        : Promise.resolve({ data: null, error: null }),
      trackable
        ? supabaseAdmin.rpc('get_broadcast_recipients', {
            p_company_id: auth.companyId,
            p_broadcast_id: id,
            p_filter: filter,
            p_limit: limit,
            p_offset: offset,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    // ตัวเลขวัดผลอ่านไม่ได้ต้องไม่ทำให้ทั้งหน้าพัง — คืน null แล้วให้หน้าจอบอกว่ายังไม่มีข้อมูล
    if (statsRes.error) {
      console.error('[broadcast] get_broadcast_reply_stats:', statsRes.error.message);
    }
    if (recipientsRes.error) {
      console.error('[broadcast] get_broadcast_recipients:', recipientsRes.error.message);
    }

    const statsRow = (statsRes.data as ReplyStatsRow[] | null)?.[0] || null;
    const recipientRows = (recipientsRes.data as RecipientRpcRow[] | null) || [];

    const content = row.content || null;

    return NextResponse.json({
      broadcast: {
        id: row.id,
        platform: row.platform,
        status: row.status,
        audience_type: row.audience_type,
        audience_filter: row.audience_filter,
        preview: row.preview,
        content,
        content_kind: resolveBroadcastContentKind(content, row.messages),
        messages: row.messages,
        recipient_count: row.recipient_count,
        sent_count: row.sent_count,
        failed_count: row.failed_count,
        error: row.error,
        scheduled_at: row.scheduled_at,
        started_at: row.started_at,
        finished_at: row.finished_at,
        cancelled_at: row.cancelled_at,
        created_at: row.created_at,
        created_by: row.created_by,
        created_by_name: userRes.data?.name || null,
        chat_account_id: row.chat_account_id,
        marketplace_account_id: row.marketplace_account_id,
        account_name: accountInfo.name,
        account_picture_url: accountInfo.pictureUrl,
      },
      stats: statsRow
        ? {
            recipient_count: row.recipient_count,
            sent_count: row.sent_count,
            failed_count: row.failed_count,
            // ผู้รับที่ "ตามผลได้จริง" = ตัวหารของ replied/ordered
            // (โหมด 'ผู้ติดตามทั้งหมด' ยิงถึงคนที่เราไม่มีห้องแชท ตัวเลขนี้จึงน้อยกว่า sent_count)
            tracked_count: Number(statsRow.recipient_count) || 0,
            replied_count: Number(statsRow.replied_count) || 0,
            awaiting_count: Number(statsRow.awaiting_count) || 0,
            ordered_count: Number(statsRow.ordered_count) || 0,
            ordered_amount: Number(statsRow.ordered_amount) || 0,
          }
        : null,
      recipients: {
        rows: recipientRows.map(r => ({
          contact_id: r.contact_id,
          display_name: r.display_name,
          picture_url: r.picture_url,
          customer_id: r.customer_id,
          sent: r.sent,
          replied_at: r.replied_at,
          reply_preview: r.reply_preview,
          awaiting: r.awaiting,
          order_count: Number(r.order_count) || 0,
          order_amount: Number(r.order_amount) || 0,
        })),
        total: Number(recipientRows[0]?.total_count) || 0,
        filter,
        limit,
        offset,
      },
    });
  } catch (e) {
    console.error('GET broadcast detail error:', e);
    return NextResponse.json({ error: 'โหลดบรอดแคสต์ไม่สำเร็จ' }, { status: 500 });
  }
}

/**
 * ชื่อ + รูปของต้นทาง — บัญชีอยู่คนละตารางตามช่องทาง (chat_accounts / marketplace_accounts)
 * รูปของช่องทางแชท resolve ผ่านตัวกลางตัวเดียวกับหน้าตั้งค่าและไอคอนแจ้งเตือน
 */
async function resolveAccountInfo(
  companyId: string,
  chatAccountId: string | null,
  marketplaceAccountId: string | null,
): Promise<{ name: string | null; pictureUrl: string | null }> {
  if (chatAccountId) {
    const { data } = await supabaseAdmin
      .from('chat_accounts')
      .select('account_name, platform, credentials')
      .eq('id', chatAccountId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (!data) return { name: null, pictureUrl: null };

    const creds = data.credentials as Record<string, unknown> | null;
    // แชทที่ผูกกับร้าน marketplace ไม่มีรูปใน credentials — โลโก้ร้านอยู่อีกตาราง
    const shopLogos: Record<string, string> = {};
    const mpId = creds?.marketplace_account_id;
    if (typeof mpId === 'string') {
      const { data: shop } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('metadata')
        .eq('id', mpId)
        .eq('company_id', companyId)
        .maybeSingle();
      const logo = (shop?.metadata as Record<string, unknown> | null)?.shop_logo;
      if (typeof logo === 'string' && logo) shopLogos[mpId] = logo;
    }

    return {
      name: (data.account_name as string) || null,
      pictureUrl: resolveAccountPicture(data.platform as string, creds, shopLogos),
    };
  }

  if (marketplaceAccountId) {
    const { data } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('shop_name, metadata')
      .eq('id', marketplaceAccountId)
      .eq('company_id', companyId)
      .maybeSingle();
    const logo = (data?.metadata as Record<string, unknown> | null)?.shop_logo;
    return {
      name: (data?.shop_name as string) || null,
      pictureUrl: typeof logo === 'string' && logo ? logo : null,
    };
  }

  return { name: null, pictureUrl: null };
}
