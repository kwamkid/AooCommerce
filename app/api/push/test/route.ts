// ยิง push ทดสอบไปทุก device ของ user คนที่กด — ใช้ตรวจว่าตั้งค่าแจ้งเตือนสำเร็จ
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    return NextResponse.json({ error: 'VAPID keys not configured' }, { status: 500 });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@aoocommerce.com', publicKey, privateKey);

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', auth.userId!)
    .eq('company_id', auth.companyId);

  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: 'ยังไม่มี device ที่เปิดการแจ้งเตือน' }, { status: 404 });
  }

  let sent = 0;
  const staleIds: string[] = [];
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({
          title: '🔔 ทดสอบการแจ้งเตือน',
          body: 'ตั้งค่าสำเร็จ! คุณจะได้รับแจ้งเตือนแชทและออเดอร์ใหม่จากอุปกรณ์นี้',
          url: '/dashboard',
          tag: 'push-test',
        }),
        { TTL: 60 }
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 404 || statusCode === 410) staleIds.push(sub.id);
    }
  }

  if (staleIds.length > 0) {
    await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds);
  }

  return NextResponse.json({ success: true, sent });
}
