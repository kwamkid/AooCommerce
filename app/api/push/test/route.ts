// ยิง push ทดสอบไปทุก device ของ "คนที่กด" ในสายนั้น — ใช้ตรวจว่าตั้งค่าสำเร็จจริง
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { sendPushToUsers, type PushAudience } from '@/lib/push/send';

export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const audience: PushAudience = body?.audience === 'superadmin' ? 'superadmin' : 'app';

  // เช็คก่อนว่ามี device ในสายนี้จริงไหม — จะได้บอกได้ว่า "ยังไม่ได้เปิด" ไม่ใช่เงียบไปเฉย ๆ
  // ไม่กรอง company_id: subscription ผูกกับ "คน" ส่วน company_id เป็นแค่บริษัทล่าสุดที่เปิด
  const { count } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', auth.userId)
    .eq('audience', audience);

  if (!count) {
    return NextResponse.json({ error: 'ยังไม่มีอุปกรณ์ที่เปิดการแจ้งเตือนในแอปนี้' }, { status: 404 });
  }

  await sendPushToUsers([auth.userId], {
    title: '🔔 ทดสอบการแจ้งเตือน',
    body: audience === 'superadmin'
      ? 'ตั้งค่าสำเร็จ! อุปกรณ์นี้จะได้รับแจ้งเตือนปัญหาระดับระบบ'
      : 'ตั้งค่าสำเร็จ! อุปกรณ์นี้จะได้รับแจ้งเตือนแชท ออเดอร์ใหม่ และเรื่องที่ร้านต้องแก้',
    url: audience === 'superadmin' ? '/superadmin/api-monitor' : '/dashboard',
    tag: 'push-test',
  }, { audience });

  return NextResponse.json({ success: true, devices: count });
}
