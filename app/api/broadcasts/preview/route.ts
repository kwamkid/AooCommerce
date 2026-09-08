import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getLineCredsFromAccount } from '@/lib/chat-config';
import { isBroadcastPlatform, type BroadcastPlatform } from '@/lib/broadcast/platforms';
import { resolveBroadcastTarget } from '@/lib/broadcast/accounts';
import {
  getLineFollowerStats,
  getLineQuota,
  resolveBroadcastRecipients,
  type BroadcastAudienceFilter,
  type BroadcastAudienceType,
} from '@/lib/line/broadcast';
import { resolveTikTokRecipients, TIKTOK_BUYER_WINDOW_DAYS } from '@/lib/tiktok/broadcast';

// POST — นับผู้รับ (+ โควตาถ้าช่องทางนั้นมี) ก่อนกดส่งจริง
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

    const { target, error } = await resolveBroadcastTarget(auth.companyId, platform, accountId);
    if (!target) return NextResponse.json({ error }, { status: 400 });

    if (platform === 'tiktok') {
      const recipients = await resolveTikTokRecipients(
        auth.companyId, target.marketplaceAccountId!, audienceType, audienceFilter,
      );
      return NextResponse.json({
        recipient_count: recipients.length,
        known_contact_count: recipients.length,
        quota: null,
        follower_stats: null,
        window_days: TIKTOK_BUYER_WINDOW_DAYS,
      });
    }

    const creds = getLineCredsFromAccount(target.row);

    const recipients = await resolveBroadcastRecipients(
      auth.companyId,
      accountId,
      (audienceType === 'all' ? 'contacts' : audienceType) as BroadcastAudienceType,
      audienceFilter,
    );

    // ผู้ติดตามมีความหมายเฉพาะโหมด 'all' — โหมดอื่นจำนวนผู้รับมาจากรายชื่อของเราเอง
    const [quota, stats] = await Promise.all([
      creds ? getLineQuota(creds.channel_access_token) : Promise.resolve(null),
      creds && audienceType === 'all'
        ? getLineFollowerStats(creds.channel_access_token)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      // โหมด 'all' ส่งถึงผู้ติดตามทุกคน — รายชื่อที่เรามีเป็นแค่ส่วนที่บันทึกลงห้องแชทได้
      recipient_count: audienceType === 'all' ? (stats?.reachable ?? recipients.length) : recipients.length,
      known_contact_count: recipients.length,
      quota,
      follower_stats: stats
        ? { reachable: stats.reachable, total_adds: stats.totalAdds, blocks: stats.blocks }
        : null,
      window_days: null,
    });
  } catch (e) {
    console.error('POST broadcast preview error:', e);
    return NextResponse.json({ error: 'ประเมินผู้รับไม่สำเร็จ' }, { status: 500 });
  }
}
