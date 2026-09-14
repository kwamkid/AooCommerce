// Path: app/api/broadcasts/messenger-subscribers/route.ts
//
// "เพจนี้มีคนกดรับข่าวสารกี่คน และตอนนี้ส่งถึงได้กี่คน"
//
// ⚠️ **รายชื่อผู้สมัครอยู่ที่ Meta ไม่ใช่ของเรา** — ถามสดทุกครั้งผ่าน
// `GET /{page_id}/notification_message_tokens` · ห้ามเก็บสำเนาไว้เองแล้วนับจากสำเนา เพราะ
//   • ลูกค้ากดเลิกรับเมื่อไหร่ก็ได้ (`notification_messages_reoptin` เปลี่ยนทันที)
//   • `next_eligible_time_for_paid_messaging` ของแต่ละคนขยับทุกครั้งที่ส่ง (เพดาน 1 ข้อความ/12 ชม./คน)
// สำเนาที่เก่าไปวันเดียวทำให้หน้าจอบอกว่าส่งได้ 21 คนทั้งที่จริงส่งได้ 3
//
// GET ?account_id=<chat_accounts.id ของเพจ Facebook>
//   → { total, eligible_now, next_eligible_at, topics[] }
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getChatAccount } from '@/lib/chat-config';
import { logIntegration } from '@/lib/integration-logger';

export const dynamic = 'force-dynamic';

const GRAPH = 'https://graph.facebook.com/v23.0';
/** กันวนไม่จบเมื่อร้านมีผู้สมัครหลักหมื่น — หน้าจอต้องการแค่ตัวเลขคร่าว ๆ ไม่ใช่รายชื่อ */
const MAX_PAGES = 5;

interface SubscriberToken {
  recipient_id?: string;
  topic_title?: string;
  notification_messages_reoptin?: string;
  next_eligible_time_for_paid_messaging?: number | string;
}

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
  if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const accountId = request.nextUrl.searchParams.get('account_id');
  if (!accountId) return NextResponse.json({ error: 'ต้องระบุ account_id' }, { status: 400 });

  const account = await getChatAccount(accountId);
  if (!account || account.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 404 });
  }
  if (account.platform !== 'facebook') {
    return NextResponse.json({ error: 'รายชื่อผู้สมัครมีเฉพาะเพจ Facebook' }, { status: 400 });
  }

  const creds = (account.credentials || {}) as Record<string, unknown>;
  const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
  const token = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
  if (!pageId || !token) {
    return NextResponse.json({ error: 'เพจนี้ยังไม่มี token — เชื่อมต่อเพจใหม่ก่อน' }, { status: 400 });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  let total = 0;
  let eligibleNow = 0;
  /** เวลาที่คนถัดไปจะส่งได้ (เร็วสุดในบรรดาคนที่ยังติดเพดาน) — หน้าจอเอาไปบอกว่า "ส่งได้อีกครั้งเมื่อ …" */
  let nextEligibleAt: number | null = null;
  const topics = new Map<string, number>();

  let url: string | null =
    `/${pageId}/notification_message_tokens?limit=1000&access_token=${encodeURIComponent(token)}`;
  let httpStatus = 200;
  let errorMessage: string | null = null;

  for (let page = 0; url && page < MAX_PAGES; page++) {
    const res: Response = await fetch(`${GRAPH}${url}`);
    httpStatus = res.status;
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      errorMessage = body?.error?.message || `Graph ตอบ ${res.status}`;
      break;
    }
    for (const row of (body?.data || []) as SubscriberToken[]) {
      // กดเลิกรับแล้วไม่นับเป็นผู้สมัคร — ตัวเลขบนหน้าจอต้องเท่ากับคนที่ส่งถึงได้จริง
      if (row.notification_messages_reoptin && row.notification_messages_reoptin !== 'ENABLED') continue;
      total += 1;
      if (row.topic_title) topics.set(row.topic_title, (topics.get(row.topic_title) || 0) + 1);
      const next = Number(row.next_eligible_time_for_paid_messaging || 0);
      if (!next || next <= nowSec) eligibleNow += 1;
      else if (nextEligibleAt === null || next < nextEligibleAt) nextEligibleAt = next;
    }
    const nextUrl: string | undefined = body?.paging?.next;
    url = nextUrl ? nextUrl.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+/, '') : null;
  }

  logIntegration({
    company_id: auth.companyId,
    integration: 'facebook',
    account_id: account.id,
    account_name: account.account_name,
    direction: 'outgoing',
    action: 'list_marketing_subscribers',
    method: 'GET',
    api_path: `/${pageId}/notification_message_tokens`,
    http_status: httpStatus,
    status: errorMessage ? 'error' : 'success',
    error_message: errorMessage || undefined,
    response_body: errorMessage ? undefined : { total, eligible_now: eligibleNow },
  });

  if (errorMessage) return NextResponse.json({ error: errorMessage }, { status: 502 });

  return NextResponse.json({
    total,
    eligible_now: eligibleNow,
    next_eligible_at: nextEligibleAt ? new Date(nextEligibleAt * 1000).toISOString() : null,
    topics: [...topics.entries()].map(([title, count]) => ({ title, count })),
  });
}
