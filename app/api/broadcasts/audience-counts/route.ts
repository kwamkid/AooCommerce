import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getLineCredsFromAccount } from '@/lib/chat-config';
import { isBroadcastPlatform, type BroadcastPlatform } from '@/lib/broadcast/platforms';
import { resolveBroadcastTarget } from '@/lib/broadcast/accounts';
import {
  getLineContactCounts,
  getLineFollowerStats,
  resolveBroadcastRecipients,
  type BroadcastAudienceType,
} from '@/lib/line/broadcast';
import { resolveTikTokRecipients, TIKTOK_BUYER_WINDOW_DAYS } from '@/lib/tiktok/broadcast';

// GET — จำนวนผู้รับของ **ทุกกลุ่ม** พร้อมกัน สำหรับโมดัลเลือกกลุ่มผู้รับ
//
// ทำไมนับทีเดียวทุกกลุ่ม: ผู้ใช้ต้องเห็นว่าแต่ละกลุ่มมีกี่คน **ก่อน** เลือก ไม่ใช่ต้องกด
// เลือกทีละกลุ่มแล้วรอ preview ทีละรอบ · แพงกว่านับกลุ่มเดียวไม่มาก เพราะทุกกลุ่ม
// อ่านจากรายชื่อผู้ติดต่อชุดเดียวกัน แล้วกรองต่างกันเท่านั้น
//
// ไม่รับตัวกรองซ้อน (min_messages / last_chat_days) — ตัวเลขชุดนี้เป็นฐานของกลุ่ม
// ส่วนผลหลังกรองซ้อนยังใช้ /api/broadcasts/preview เหมือนเดิม
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id') || '';
    const days = Math.min(Math.max(Number(searchParams.get('days')) || 30, 1), 3650);

    if (!isBroadcastPlatform(searchParams.get('platform'))) {
      return NextResponse.json({ error: 'ช่องทางไม่ถูกต้อง' }, { status: 400 });
    }
    const platform: BroadcastPlatform = searchParams.get('platform') as BroadcastPlatform;
    if (!accountId) return NextResponse.json({ error: 'กรุณาเลือกบัญชีที่จะใช้ส่ง' }, { status: 400 });

    const { target, error } = await resolveBroadcastTarget(auth.companyId, platform, accountId);
    if (!target) return NextResponse.json({ error }, { status: 400 });

    if (platform === 'tiktok') {
      const buyers = await resolveTikTokRecipients(
        auth.companyId, target.marketplaceAccountId!, 'buyers_365d', null,
      );
      return NextResponse.json({
        platform,
        counts: { buyers_365d: buyers.length },
        contact_total: null,
        contact_linked: null,
        days: TIKTOK_BUYER_WINDOW_DAYS,
      });
    }

    if (platform !== 'line') {
      return NextResponse.json({ error: 'ช่องทางนี้ยังนับผู้รับไม่ได้' }, { status: 400 });
    }

    const creds = getLineCredsFromAccount(target.row);

    // กลุ่มที่มีรายชื่อจริง — นับพร้อมกัน (แต่ละตัวอ่านผู้ติดต่อชุดเดียวกันแล้วกรองต่างกัน)
    const listed: { key: string; type: BroadcastAudienceType; days?: number }[] = [
      { key: 'not_bought', type: 'not_bought' },
      { key: 'bought', type: 'bought' },
      { key: 'bought_before', type: 'bought_before', days },
      { key: 'bought_within', type: 'bought_within', days },
      { key: 'bought_once', type: 'bought_once' },
      { key: 'contacts', type: 'contacts' },
    ];

    const [lists, contactCounts, followerStats] = await Promise.all([
      Promise.all(listed.map(g =>
        resolveBroadcastRecipients(auth.companyId!, accountId, g.type, g.days ? { days: g.days } : null),
      )),
      getLineContactCounts(auth.companyId, accountId),
      // 'ผู้ติดตามทั้งหมด' เป็นตัวเลขของ LINE ไม่ใช่ของเรา — ถามไม่ได้ = null (ห้ามเดาเป็น 0)
      creds ? getLineFollowerStats(creds.channel_access_token) : Promise.resolve(null),
    ]);

    const counts: Record<string, number | null> = {};
    listed.forEach((g, i) => { counts[g.key] = lists[i].length; });
    counts.all = followerStats?.reachable ?? null;

    return NextResponse.json({
      platform,
      counts,
      // ระบบรู้ประวัติการซื้อของกี่คน — ต้องโชว์คู่กับกลุ่มที่แบ่งตามการซื้อเสมอ
      // ไม่งั้นผู้ใช้จะอ่านว่า "ลูกค้าเก่าตัวเองไม่มีใครเคยซื้อ"
      contact_total: contactCounts.total,
      contact_linked: contactCounts.linked,
      days,
    });
  } catch (e) {
    console.error('GET broadcast audience-counts error:', e);
    return NextResponse.json({ error: 'นับผู้รับไม่สำเร็จ' }, { status: 500 });
  }
}
