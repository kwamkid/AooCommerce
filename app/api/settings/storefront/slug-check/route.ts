// เช็คว่าชื่อลิงก์ร้านว่างไหม — ให้หน้าจอบอกได้ตั้งแต่ตอนพิมพ์ ไม่ใช่รู้ตอนกดบันทึกแล้วเด้ง error
//
// ⚠️ ต้องใช้กติกาชุดเดียวกับ PUT ของ /api/settings/storefront เป๊ะ ๆ ไม่งั้นหน้าจอ
// จะบอกว่าว่างแล้วตอนบันทึกโดนปฏิเสธ · เช็คเฉพาะ `storefront_slug` —
// `companies.slug` ไม่เกี่ยวกับ URL หน้าร้านแล้ว
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
    .select('storefront_slug, storefront_slug_changed_at, settings')
    .eq('id', auth.companyId)
    .single();

  const enabled = parseStorefront((own?.settings as Record<string, unknown>) || {}).enabled;
  const lockDaysLeft = enabled
    ? storefrontSlugLockRemainingDays(own?.storefront_slug_changed_at ?? null)
    : 0;

  // ยังไม่พิมพ์อะไร = ยังไม่มีอะไรให้ตัดสิน
  if (!raw) {
    return NextResponse.json({ status: 'idle', lock_days_left: lockDaysLeft, lock_days: STOREFRONT_SLUG_LOCK_DAYS });
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
    .eq('storefront_slug', raw)
    .neq('id', auth.companyId)
    .limit(1);

  return NextResponse.json({
    status: clash && clash.length > 0 ? 'taken' : 'available',
    lock_days_left: lockDaysLeft,
    lock_days: STOREFRONT_SLUG_LOCK_DAYS,
  });
}
