// POST — Validate consignment dealer portal access code
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { portalRateLimit } from '@/lib/portal-rate-limit';
import { getClientIp } from '@/lib/request-ip';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!),
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function POST(request: NextRequest) {
  try {
    const { access_code, token } = await request.json();

    if (!access_code || !token) {
      return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });
    }

    // Throttle per token+IP so the 30-bit code can't be brute-forced.
    const rlKey = `consign:${token}:${getClientIp(request)}`;
    const gate = await portalRateLimit.check(rlKey);
    if (!gate.allowed) {
      return NextResponse.json({ error: 'พยายามหลายครั้งเกินไป กรุณารอสักครู่' }, { status: 429 });
    }

    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('portal_token', token)
      .eq('portal_access_code', access_code.trim().toUpperCase())
      .single();

    if (!customer) {
      await portalRateLimit.fail(rlKey);
      return NextResponse.json({ error: 'รหัสไม่ถูกต้อง' }, { status: 401 });
    }

    await portalRateLimit.reset(rlKey);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST consignment portal-auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
