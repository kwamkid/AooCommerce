// Web Push subscription management — 1 row ต่อ device/browser (unique by endpoint)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// POST — บันทึก subscription ของ device นี้ (upsert: device เดิม subscribe ซ้ำ = อัพเดท company/user ล่าสุด)
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const endpoint: string | undefined = body?.endpoint;
    const p256dh: string | undefined = body?.keys?.p256dh;
    const authKey: string | undefined = body?.keys?.auth;
    // สายแจ้งเตือน — 'superadmin' = แอปผู้ดูแลระบบ (คนละ service worker scope
    // จึงเป็นคนละ endpoint ทำให้ device เดียวเปิดได้ทั้งสองสายโดยไม่ทับกัน)
    const audience = body?.audience === 'superadmin' ? 'superadmin' : 'app';

    if (!endpoint || !p256dh || !authKey) {
      return NextResponse.json({ error: 'Invalid subscription payload' }, { status: 400 });
    }
    // สาย superadmin ต้องเป็น superadmin จริงเท่านั้น — ไม่งั้นใครก็ยิง POST มาขอรับ
    // แจ้งเตือนระดับระบบของทุกบริษัทได้
    if (audience === 'superadmin') {
      const { data: profile } = await supabaseAdmin
        .from('user_profiles')
        .select('is_super_admin')
        .eq('id', auth.userId)
        .single();
      if (profile?.is_super_admin !== true) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .upsert(
        {
          company_id: auth.companyId,
          user_id: auth.userId,
          audience,
          endpoint,
          p256dh,
          auth: authKey,
          user_agent: request.headers.get('user-agent')?.slice(0, 500) || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      );

    if (error) {
      console.error('[Push] subscribe upsert error:', error);
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}

// DELETE — ยกเลิกการแจ้งเตือนของ device นี้
export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const endpoint: string | undefined = body?.endpoint;
    if (!endpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    // ลบเฉพาะ subscription ของ user ตัวเอง (endpoint เป็น unique อยู่แล้ว)
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)
      .eq('user_id', auth.userId!);

    if (error) {
      console.error('[Push] unsubscribe delete error:', error);
      return NextResponse.json({ error: 'Failed to remove subscription' }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
