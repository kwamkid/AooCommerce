import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getLineCredsFromAccount } from '@/lib/chat-config';
import {
  BROADCAST_PLATFORMS,
  isBroadcastPlatform,
  type BroadcastPlatform,
} from '@/lib/broadcast/platforms';
import { resolveBroadcastTarget } from '@/lib/broadcast/accounts';
import { runBroadcast } from '@/lib/broadcast/run';
import {
  buildLineMessages,
  getLineFollowerStats,
  getLineQuota,
  quotaBlocks,
  resolveBroadcastRecipients,
  type BroadcastAudienceFilter,
  type BroadcastAudienceType,
} from '@/lib/line/broadcast';
import { resolveTikTokRecipients } from '@/lib/tiktok/broadcast';

// ส่งจริงเกิดใน after() ของ POST — ต้องให้ฟังก์ชันอยู่ได้นานพอที่จะไล่ล็อตจนจบ
export const maxDuration = 300;

/** กลุ่มผู้รับที่แต่ละช่องทางรองรับ — ส่งค่าที่ช่องทางนั้นไม่รู้จักมา = ปฏิเสธ */
const AUDIENCE_BY_PLATFORM: Record<string, string[]> = {
  line: ['all', 'contacts', 'tags', 'customers'],
  tiktok: ['buyers_365d', 'tags'],
};

interface BroadcastListRow {
  id: string;
  platform: string;
  chat_account_id: string | null;
  marketplace_account_id: string | null;
  created_by: string | null;
  audience_type: string;
  preview: string | null;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  status: string;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

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
      .select(
        'id, platform, chat_account_id, marketplace_account_id, created_by, audience_type, preview, recipient_count, sent_count, failed_count, status, error, started_at, finished_at, created_at',
        { count: 'exact' },
      )
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;

    const rows = (data || []) as BroadcastListRow[];

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
    const { count: activeCount } = await supabaseAdmin
      .from('broadcasts')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', auth.companyId)
      .in('status', ['pending', 'sending']);

    return NextResponse.json({
      broadcasts: rows.map(r => ({
        ...r,
        account_name: accountName.get(r.chat_account_id || r.marketplace_account_id || '') || null,
        created_by_name: r.created_by ? userName.get(r.created_by) || null : null,
      })),
      total: count ?? rows.length,
      sending: (activeCount ?? 0) > 0,
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

    const { target, error: targetError } = await resolveBroadcastTarget(auth.companyId, platform, accountId);
    if (!target) return NextResponse.json({ error: targetError }, { status: 400 });

    const compose = BROADCAST_PLATFORMS[platform].compose;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (text.length > compose.bodyMax) {
      return NextResponse.json({ error: `ข้อความยาวเกิน ${compose.bodyMax.toLocaleString()} ตัวอักษร` }, { status: 400 });
    }
    if (compose.titleMax && title.length > compose.titleMax) {
      return NextResponse.json({ error: `หัวข้อยาวเกิน ${compose.titleMax} ตัวอักษร` }, { status: 400 });
    }

    let messages: unknown;
    let recipientCount: number;
    let preview: string;

    // ─── LINE ───────────────────────────────────────────────────────────
    if (platform === 'line') {
      const creds = getLineCredsFromAccount(target.row);
      if (!creds) {
        return NextResponse.json({ error: 'ช่องทางนี้ยังไม่ได้ตั้งค่า token — ตั้งค่าที่ ตั้งค่า > ช่องทาง Chat' }, { status: 400 });
      }
      try {
        messages = buildLineMessages({ text: body.text, imageUrl: body.image_url });
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
      preview = text ? text.slice(0, 120) : '[รูปภาพ]';

    // ─── TikTok Shop ────────────────────────────────────────────────────
    } else if (platform === 'tiktok') {
      if (!title || !text) {
        return NextResponse.json({ error: 'TikTok ต้องมีทั้งหัวข้อและข้อความ' }, { status: 400 });
      }
      const recipients = await resolveTikTokRecipients(
        auth.companyId, target.marketplaceAccountId!, audienceType, audienceFilter,
      );
      if (recipients.length === 0) {
        return NextResponse.json({
          error: 'ไม่มีผู้รับที่ตรงเงื่อนไข — TikTok ให้ทักได้เฉพาะลูกค้าที่เคยสั่งซื้อภายใน 365 วัน',
        }, { status: 400 });
      }
      recipientCount = recipients.length;
      messages = {
        title,
        body: text,
        ...(Array.isArray(body.product_ids) && body.product_ids.length ? { product_ids: body.product_ids.slice(0, 4) } : {}),
        ...(Array.isArray(body.coupon_ids) && body.coupon_ids.length ? { coupon_ids: body.coupon_ids.slice(0, 1) } : {}),
      };
      preview = `${title} — ${text}`.slice(0, 120);

    } else {
      // ช่องทางอื่นถูกกันไปแล้วที่ resolveBroadcastTarget — กันไว้อีกชั้นกัน branch หลุด
      return NextResponse.json({ error: BROADCAST_PLATFORMS[platform].reason || 'ช่องทางนี้ยังส่งไม่ได้' }, { status: 400 });
    }

    const { data: created, error } = await supabaseAdmin
      .from('broadcasts')
      .insert({
        company_id: auth.companyId,
        platform,
        chat_account_id: target.chatAccountId,
        marketplace_account_id: target.marketplaceAccountId,
        created_by: auth.userId || null,
        audience_type: audienceType,
        audience_filter: audienceType === 'tags' ? { tag_ids: audienceFilter.tag_ids || [] } : {},
        messages,
        preview,
        recipient_count: recipientCount,
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) throw error;

    // งานส่งอยู่หลัง response — ต้องผ่าน after() ไม่งั้น Vercel freeze ฟังก์ชันทิ้งกลางทาง
    after(() => runBroadcast(created.id, platform));

    return NextResponse.json({ id: created.id });
  } catch (e) {
    console.error('POST broadcast error:', e);
    return NextResponse.json({ error: 'สร้างบรอดแคสต์ไม่สำเร็จ' }, { status: 500 });
  }
}
