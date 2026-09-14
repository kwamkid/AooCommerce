// เช็คว่าชื่อลิงก์ร้านว่างไหม — ให้หน้าจอบอกได้ตั้งแต่ตอนพิมพ์ ไม่ใช่รู้ตอนกดบันทึกแล้วเด้ง error
//
// ⚠️ ต้องใช้กติกาชุดเดียวกับ PUT ของ /api/settings/storefront เป๊ะ ๆ ไม่งั้นหน้าจอ
// จะบอกว่าว่างแล้วตอนบันทึกโดนปฏิเสธ · เช็คเฉพาะ `storefront_slug` —
// `companies.slug` ไม่เกี่ยวกับ URL หน้าร้านแล้ว
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import {
  STOREFRONT_SLUG_LOCK_DAYS, STOREFRONT_SLUG_RE, STOREFRONT_SLUG_RULE, storefrontSlugLockRemainingDays,
} from '@/lib/storefront';

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = (request.nextUrl.searchParams.get('slug') || '').trim().toLowerCase();

  const { data: own } = await supabaseAdmin
    .from('companies')
    .select('storefront_slug, storefront_slug_changed_at')
    .eq('id', auth.companyId)
    .single();

  // ล็อกทุกกรณีหลังเปลี่ยนชื่อ ไม่ว่าร้านเปิดหรือปิด (2026-09-14)
  const lockDaysLeft = storefrontSlugLockRemainingDays(own?.storefront_slug_changed_at ?? null);

  // ยังไม่พิมพ์อะไร = ยังไม่มีอะไรให้ตัดสิน
  if (!raw) {
    return NextResponse.json({ status: 'idle', lock_days_left: lockDaysLeft, lock_days: STOREFRONT_SLUG_LOCK_DAYS });
  }
  // ค่าเดิมของตัวเอง = ไม่ได้เปลี่ยนอะไร
  if (raw === own?.storefront_slug) {
    return NextResponse.json({ status: 'current', lock_days_left: lockDaysLeft, lock_days: STOREFRONT_SLUG_LOCK_DAYS });
  }
  if (!STOREFRONT_SLUG_RE.test(raw)) {
    return NextResponse.json({
      status: 'invalid',
      message: STOREFRONT_SLUG_RULE,
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
