// Path: app/api/supplier-portal/auth/route.ts
// Validate access code → return supplier ID for redirect
import { NextRequest, NextResponse } from 'next/server';
import { validateAccessCode } from '@/lib/supplier-portal/validate';
import { portalRateLimit } from '@/lib/portal-rate-limit';
import { getClientIp } from '@/lib/request-ip';

export async function POST(request: NextRequest) {
  try {
    const { access_code } = await request.json();

    if (!access_code || typeof access_code !== 'string') {
      return NextResponse.json({ error: 'Access code required' }, { status: 400 });
    }

    // The supplier code is a global oracle (matched against every supplier) —
    // throttle by IP so it can't be brute-forced.
    const rlKey = `supplier:${getClientIp(request)}`;
    const gate = await portalRateLimit.check(rlKey);
    if (!gate.allowed) {
      return NextResponse.json({ error: 'พยายามหลายครั้งเกินไป กรุณารอสักครู่' }, { status: 429 });
    }

    const result = await validateAccessCode(access_code.trim());

    if (!result.valid || !result.supplierId) {
      await portalRateLimit.fail(rlKey);
      return NextResponse.json({ error: 'Invalid access code' }, { status: 403 });
    }

    await portalRateLimit.reset(rlKey);
    return NextResponse.json({ supplier_id: result.supplierId });
  } catch (error) {
    console.error('Portal auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
