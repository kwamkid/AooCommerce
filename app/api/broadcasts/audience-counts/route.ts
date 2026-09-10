import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getLineCredsFromAccount } from '@/lib/chat-config';
import { isBroadcastPlatform, type BroadcastPlatform } from '@/lib/broadcast/platforms';
import { resolveBroadcastTarget } from '@/lib/broadcast/accounts';
import { countChatAudiences, type AudienceCountSpec } from '@/lib/broadcast/recipients';
import { getLineFollowerStats, getLineQuota } from '@/lib/line/broadcast';
import { resolveTikTokRecipients, TIKTOK_BUYER_WINDOW_DAYS } from '@/lib/tiktok/broadcast';

// GET — จำนวนผู้รับของ **ทุกกลุ่ม** พร้อมกัน สำหรับการ์ดเลือกกลุ่มเป้าหมาย
//
// ทำไมนับทีเดียวทุกกลุ่ม: ผู้ใช้ต้องเห็นว่าแต่ละกลุ่มมีกี่คน **ก่อน** เลือก ไม่ใช่ต้องกด
// เลือกทีละกลุ่มแล้วรอ preview ทีละรอบ · ทุกกลุ่มนับจากรายชื่อชุดเดียวที่โหลดครั้งเดียว
// (`countChatAudiences`) — เดิมเรียกหาผู้รับกลุ่มละรอบ = ดึงรายชื่อซ้ำ 6 ครั้งต่อการเปิดหน้า
//
// คืนโควตา + ผู้ติดตามมาด้วย — หน้าสร้างใช้ชุดนี้แทน /preview ได้เลยเมื่อกลุ่มที่เลือกเป็น
// กลุ่มพื้นฐานของบัญชี LINE เดียวและไม่มีตัวกรองซ้อน (ไม่ต้องยิงนับซ้ำทุกครั้งที่กดเปลี่ยนกลุ่ม)
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
        quota: null,
        follower_stats: null,
      });
    }

    if (platform !== 'line') {
      return NextResponse.json({ error: 'ช่องทางนี้ยังนับผู้รับไม่ได้' }, { status: 400 });
    }

    const creds = getLineCredsFromAccount(target.row);

    // กลุ่มที่มีรายชื่อจริง — ใช้กติกาตัวเดียวกับการส่ง (selectRecipients) ตัวเลขจึงตรงกับที่ส่งจริง
    const groups: AudienceCountSpec[] = [
      { key: 'not_bought', type: 'not_bought' },
      { key: 'bought', type: 'bought' },
      { key: 'bought_before', type: 'bought_before', filter: { days } },
      { key: 'bought_within', type: 'bought_within', filter: { days } },
      { key: 'bought_once', type: 'bought_once' },
      { key: 'contacts', type: 'contacts' },
    ];

    // งาน DB กับ LINE API ไม่ขึ้นต่อกัน — ถามพร้อมกันทั้งหมด
    const [counted, quota, followerStats] = await Promise.all([
      countChatAudiences(auth.companyId, 'line', accountId, groups),
      creds ? getLineQuota(creds.channel_access_token) : Promise.resolve(null),
      // 'ผู้ติดตามทั้งหมด' เป็นตัวเลขของ LINE ไม่ใช่ของเรา — ถามไม่ได้ = null (ห้ามเดาเป็น 0)
      creds ? getLineFollowerStats(creds.channel_access_token) : Promise.resolve(null),
    ]);
    // อ่านประวัติการซื้อไม่ได้ = นับกลุ่มตามการซื้อไม่ได้ — บอกว่าล้ม ห้ามตอบ 0 ให้หน้าจอเข้าใจผิด
    if (!counted) return NextResponse.json({ error: 'นับผู้รับไม่สำเร็จ' }, { status: 500 });

    const counts: Record<string, number | null> = {
      ...counted.counts,
      all: followerStats?.reachable ?? null,
    };

    return NextResponse.json({
      platform,
      counts,
      // ระบบรู้ประวัติการซื้อของกี่คน — ต้องโชว์คู่กับกลุ่มที่แบ่งตามการซื้อเสมอ
      // ไม่งั้นผู้ใช้จะอ่านว่า "ลูกค้าเก่าตัวเองไม่มีใครเคยซื้อ"
      contact_total: counted.total,
      contact_linked: counted.linked,
      days,
      quota,
      follower_stats: followerStats
        ? { reachable: followerStats.reachable, total_adds: followerStats.totalAdds, blocks: followerStats.blocks }
        : null,
    });
  } catch (e) {
    console.error('GET broadcast audience-counts error:', e);
    return NextResponse.json({ error: 'นับผู้รับไม่สำเร็จ' }, { status: 500 });
  }
}
