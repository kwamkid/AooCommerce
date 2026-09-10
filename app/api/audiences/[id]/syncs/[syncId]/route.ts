// Path: app/api/audiences/[id]/syncs/[syncId]/route.ts
//
// เปิด/ปิดการซิงก์อัตโนมัติ (PUT) · เลิกผูกกับบัญชีโฆษณา (DELETE)
//
// ⚠️ DELETE **ไม่ลบกลุ่มบน Meta** — ปล่อยไว้ให้เจ้าของตัดสินใจเอง เพราะกลุ่มนั้นอาจถูกใช้
// ในชุดโฆษณาที่ยังรันอยู่ (ลบแล้วโฆษณาหยุดยิงทันที) · อยากลบจริงใช้ DELETE ของตัวกลุ่ม
// พร้อม `?delete_remote=1`
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

type Params = { params: Promise<{ id: string; syncId: string }> };

async function loadOwned(syncId: string, audienceId: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('audience_syncs')
    .select('id, external_audience_id')
    .eq('id', syncId)
    .eq('audience_id', audienceId)
    .eq('company_id', companyId)
    .maybeSingle<{ id: string; external_audience_id: string | null }>();
  return data ?? null;
}

export async function PUT(request: NextRequest, context: Params) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, syncId } = await context.params;
    const row = await loadOwned(syncId, id, auth.companyId);
    if (!row) return NextResponse.json({ error: 'ไม่พบการผูกกับบัญชีโฆษณานี้' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.auto_sync === undefined) {
      return NextResponse.json({ error: 'ไม่มีอะไรให้แก้' }, { status: 400 });
    }
    const autoSync = body.auto_sync !== false;

    const { data, error } = await supabaseAdmin
      .from('audience_syncs')
      .update({
        auto_sync: autoSync,
        // เปิดกลับ = ให้ cron หยิบรอบหน้าเลย · ปิด = ไม่ต้องมีคิว
        next_sync_at: autoSync ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', syncId)
      .eq('company_id', auth.companyId)
      .select('id, ad_account_id, external_audience_id, status, auto_sync, last_sync_at, next_sync_at, last_counts, approx_size_lower, approx_size_upper, error')
      .single();
    if (error) throw error;

    return NextResponse.json({ sync: data });
  } catch (e) {
    console.error('PUT audience sync error:', e);
    return NextResponse.json({ error: 'บันทึกการตั้งค่าซิงก์ไม่สำเร็จ' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: Params) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id, syncId } = await context.params;
    const row = await loadOwned(syncId, id, auth.companyId);
    if (!row) return NextResponse.json({ error: 'ไม่พบการผูกกับบัญชีโฆษณานี้' }, { status: 404 });

    const { error } = await supabaseAdmin
      .from('audience_syncs')
      .delete()
      .eq('id', syncId)
      .eq('company_id', auth.companyId);
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      // บอกให้ชัดว่ากลุ่มยังอยู่บน Meta — ไม่งั้นเจ้าของนึกว่าลบหมดแล้วไปเจอกลุ่มค้างทีหลัง
      external_audience_id: row.external_audience_id,
    });
  } catch (e) {
    console.error('DELETE audience sync error:', e);
    return NextResponse.json({ error: 'เลิกผูกกับบัญชีโฆษณาไม่สำเร็จ' }, { status: 500 });
  }
}
