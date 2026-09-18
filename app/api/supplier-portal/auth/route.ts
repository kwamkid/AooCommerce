// Path: app/api/supplier-portal/auth/route.ts
// Validate access code → return supplier ID for redirect
import { NextRequest, NextResponse } from 'next/server';
import { validateAccessCode, validatePortalAccess } from '@/lib/supplier-portal/validate';
import { portalRateLimit } from '@/lib/portal-rate-limit';
import { getClientIp } from '@/lib/request-ip';

export async function POST(request: NextRequest) {
  try {
    // `portal_ref` = ค่าที่อยู่บน URL ของพอร์ทัล (portal_token ทางใหม่ / id ลิงก์เก่า)
    // ส่งมาด้วยเพื่อให้ฝั่ง server เป็นคนตอบว่า "รหัสนี้ตรงกับพอร์ทัลนี้ไหม"
    // — เดิมคืน supplier_id ให้หน้าเว็บเทียบเอง ซึ่งเทียบกับ token ไม่ได้ และหลุด id ออกไปด้วย
    const { access_code, portal_ref } = await request.json();

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

    if (typeof portal_ref === 'string' && portal_ref) {
      const portal = await validatePortalAccess(portal_ref);
      if (!portal.valid || portal.context?.supplierId !== result.supplierId) {
        await portalRateLimit.fail(rlKey);
        return NextResponse.json({ error: 'Invalid access code' }, { status: 403 });
      }
      await portalRateLimit.reset(rlKey);
      return NextResponse.json({ ok: true });
    }

    await portalRateLimit.reset(rlKey);
    // ทางเดิม (หน้าเว็บรุ่นก่อนที่ยังไม่ส่ง portal_ref) — เลิกรองรับได้หลัง deploy รอบถัดไป
    return NextResponse.json({ supplier_id: result.supplierId });
  } catch (error) {
    console.error('Portal auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
