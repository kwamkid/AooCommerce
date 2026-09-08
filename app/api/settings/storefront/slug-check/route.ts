// เช็คว่าชื่อลิงก์ร้านว่างไหม — ให้หน้าจอบอกได้ตั้งแต่ตอนพิมพ์ ไม่ใช่รู้ตอนกดบันทึกแล้วเด้ง error
//
// ⚠️ ต้องใช้กติกาชุดเดียวกับ PUT ของ /api/settings/storefront เป๊ะ ๆ (รูปแบบ · ชนกับ
// ทั้งสองคอลัมน์ของบริษัทอื่น · ตรงกับ slug ของตัวเอง = ถือว่าใช้ได้) ไม่งั้นหน้าจอ
// จะบอกว่าว่างแล้วตอนบันทึกโดนปฏิเสธ
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { parseStorefront } from '@/lib/storefront';
import { STOREFRONT_SLUG_LOCK_DAYS, storefrontSlugLockRemainingDays } from '@/lib/storefront';

const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = (request.nextUrl.searchParams.get('slug') || '').trim().toLowerCase();

  const { data: own } = await supabaseAdmin
    .from('companies')
    .select('slug, storefront_slug, storefront_slug_changed_at, settings')
    .eq('id', auth.companyId)
    .single();

  const enabled = parseStorefront((own?.settings as Record<string, unknown>) || {}).enabled;
  const lockDaysLeft = enabled
    ? storefrontSlugLockRemainingDays(own?.storefront_slug_changed_at ?? null)
    : 0;

  // ว่างไว้ = ใช้ slug ของบริษัท ซึ่งใช้ได้เสมอ
  if (!raw || raw === own?.slug) {
    return NextResponse.json({ status: 'available', lock_days_left: lockDaysLeft, lock_days: STOREFRONT_SLUG_LOCK_DAYS });
  }
  // ค่าเดิมของตัวเอง = ไม่ได้เปลี่ยนอะไร
  if (raw === own?.storefront_slug) {
    return NextResponse.json({ status: 'current', lock_days_left: lockDaysLeft, lock_days: STOREFRONT_SLUG_LOCK_DAYS });
  }
  if (!SLUG.test(raw)) {
    return NextResponse.json({
      status: 'invalid',
      message: 'ใช้ได้เฉพาะ a-z 0-9 และขีดกลาง ยาว 3–40 ตัว ห้ามขึ้นหรือลงท้ายด้วยขีด',
      lock_days_left: lockDaysLeft, lock_days: STOREFRONT_SLUG_LOCK_DAYS,
    });
  }

  const { data: clash } = await supabaseAdmin
    .from('companies')
    .select('id')
    .or(`slug.eq.${raw},storefront_slug.eq.${raw}`)
    .neq('id', auth.companyId)
    .limit(1);

  return NextResponse.json({
    status: clash && clash.length > 0 ? 'taken' : 'available',
    lock_days_left: lockDaysLeft,
    lock_days: STOREFRONT_SLUG_LOCK_DAYS,
  });
}
