import { NextRequest, NextResponse } from 'next/server';
import { checkSuperAdmin } from '@/lib/supabase-admin';

// Probe สิทธิ์ superadmin ตัวเบา — ใช้โดย useSuperAdminGuard เท่านั้น
//
// เดิม guard ใช้ /api/superadmin/stats (5 DB query) เป็นเครื่องเช็คสิทธิ์ ทั้งที่
// ต้องการแค่ 200/403 — ทุกหน้า superadmin เลยติด skeleton รอ stats ทั้งชุด
// ก่อนจะเริ่มโหลดข้อมูลของตัวเอง (waterfall) · ตัวนี้เหลือ JWT verify (local)
// + query user_profiles แถวเดียว
export async function GET(request: NextRequest) {
  const auth = await checkSuperAdmin(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ ok: true });
}
