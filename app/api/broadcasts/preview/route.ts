import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getChatAccount, getLineCredsFromAccount } from '@/lib/chat-config';
import {
  BROADCAST_PLATFORMS,
  canBroadcastVia,
  isBroadcastPlatform,
} from '@/lib/broadcast/platforms';
import {
  getLineFollowerStats,
  getLineQuota,
  resolveBroadcastRecipients,
  type BroadcastAudienceFilter,
  type BroadcastAudienceType,
} from '@/lib/line/broadcast';

const AUDIENCE_TYPES: BroadcastAudienceType[] = ['all', 'contacts', 'tags', 'customers'];

// POST — นับผู้รับ + โควตาที่เหลือ ก่อนกดส่งจริง
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'chat.broadcast')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const chatAccountId: string = body.chat_account_id || '';
    const audienceType: BroadcastAudienceType = body.audience_type;
    const audienceFilter: BroadcastAudienceFilter = body.audience_filter || {};

    if (!chatAccountId) return NextResponse.json({ error: 'กรุณาเลือกช่องทางที่จะใช้ส่ง' }, { status: 400 });
    if (!AUDIENCE_TYPES.includes(audienceType)) {
      return NextResponse.json({ error: 'กลุ่มผู้รับไม่ถูกต้อง' }, { status: 400 });
    }

    const account = await getChatAccount(chatAccountId);
    if (!account || account.company_id !== auth.companyId) {
      return NextResponse.json({ error: 'ไม่พบช่องทางนี้' }, { status: 400 });
    }
    if (!isBroadcastPlatform(account.platform) || !canBroadcastVia(account.platform)) {
      const info = isBroadcastPlatform(account.platform) ? BROADCAST_PLATFORMS[account.platform] : null;
      return NextResponse.json({ error: info?.reason || 'ช่องทางนี้ยังส่งข้อความเป็นชุดไม่ได้' }, { status: 400 });
    }

    const creds = getLineCredsFromAccount(account);

    const recipients = await resolveBroadcastRecipients(
      auth.companyId,
      chatAccountId,
      audienceType === 'all' ? 'contacts' : audienceType,
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
    });
  } catch (e) {
    console.error('POST broadcast preview error:', e);
    return NextResponse.json({ error: 'ประเมินผู้รับไม่สำเร็จ' }, { status: 500 });
  }
}
