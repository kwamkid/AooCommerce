// Path: app/api/audiences/[id]/route.ts
//
// ดู (GET) / แก้ไข (PUT) / ลบ (DELETE) กลุ่มเป้าหมายหนึ่งใบ
//
// ⚠️ **แก้เงื่อนไข = ล้าง member_count แล้วสั่งให้ทุกบัญชีโฆษณาคำนวณส่วนต่างใหม่**
// (`next_sync_at = now`) — ไม่ทำแบบนี้ กลุ่มบน Meta จะยังเป็นรายชื่อชุดเก่าทั้งที่หน้าจอ
// บอกเงื่อนไขใหม่แล้ว และไม่มีใครรู้จนกว่าจะถึงรอบ 24 ชม.ถัดไป
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getAdAccountRow } from '@/lib/ads/accounts';
import { deleteCustomAudience } from '@/lib/meta/ads';
import {
  assertSourcesBelongToCompany,
  loadAudienceViews,
  validateAudienceDefinition,
} from '@/lib/audiences/resolve';

const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

async function loadOwned(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('audiences')
    .select('id, name, definition')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle<{ id: string; name: string; definition: Record<string, unknown> }>();
  return data ?? null;
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    // ใบที่ปิดไปแล้วยังเปิดดูได้ (ลิงก์เก่ายังใช้ได้) — รายการเท่านั้นที่กรองออก
    const [audience] = await loadAudienceViews(auth.companyId, { id, activeOnly: false });
    if (!audience) return NextResponse.json({ error: 'ไม่พบกลุ่มเป้าหมายนี้' }, { status: 404 });

    return NextResponse.json({ audience });
  } catch (e) {
    console.error('GET audience error:', e);
    return NextResponse.json({ error: 'ดึงข้อมูลกลุ่มเป้าหมายไม่สำเร็จ' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const row = await loadOwned(id, auth.companyId);
    if (!row) return NextResponse.json({ error: 'ไม่พบกลุ่มเป้าหมายนี้' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) {
      const name = String(body.name ?? '').trim().slice(0, NAME_MAX);
      if (!name) return NextResponse.json({ error: 'กรุณาตั้งชื่อกลุ่ม' }, { status: 400 });
      update.name = name;
    }
    if (body.description !== undefined) {
      update.description = String(body.description ?? '').trim().slice(0, DESCRIPTION_MAX) || null;
    }
    if (body.is_active !== undefined) update.is_active = body.is_active !== false;

    let definitionChanged = false;
    if (body.definition !== undefined) {
      const parsed = validateAudienceDefinition(body.definition);
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

      const ownershipError = await assertSourcesBelongToCompany(auth.companyId, parsed.def);
      if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 400 });

      // เทียบเป็นข้อความ — validate จัดลำดับคีย์ให้เหมือนกันทุกครั้งอยู่แล้ว
      definitionChanged = JSON.stringify(parsed.def) !== JSON.stringify(row.definition);
      update.definition = parsed.def;
      // จำนวนเดิมคิดจากเงื่อนไขเก่า — ค้างไว้จะเป็นตัวเลขที่ผิดจนกว่าจะซิงก์รอบหน้า
      if (definitionChanged) {
        update.member_count = null;
        update.member_count_at = null;
      }
    }

    const { error } = await supabaseAdmin
      .from('audiences')
      .update(update)
      .eq('id', id)
      .eq('company_id', auth.companyId);
    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'มีกลุ่มชื่อนี้แล้ว', code: 'duplicate' }, { status: 409 });
      }
      throw error;
    }

    // เงื่อนไขเปลี่ยน = ทุกบัญชีโฆษณาต้องคำนวณส่วนต่างใหม่ในรอบ cron ถัดไป
    if (definitionChanged) {
      await supabaseAdmin
        .from('audience_syncs')
        .update({ next_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('audience_id', id)
        .eq('company_id', auth.companyId);
    }

    const [audience] = await loadAudienceViews(auth.companyId, { id, activeOnly: false });
    return NextResponse.json({ audience });
  } catch (e) {
    console.error('PUT audience error:', e);
    return NextResponse.json({ error: 'บันทึกกลุ่มเป้าหมายไม่สำเร็จ' }, { status: 500 });
  }
}

/**
 * DELETE — ลบกลุ่มในระบบเรา (ลูกทั้งหมด cascade)
 *
 * `?delete_remote=1` = ลบกลุ่มบน Meta ด้วย — **ทำแบบ best-effort** เพราะกลุ่มที่ถูกใช้ใน
 * ชุดโฆษณาที่ยังรันอยู่ Meta จะไม่ให้ลบ · ล้มแล้วยังต้องลบฝั่งเราให้จบ ไม่งั้นผู้ใช้กดลบ
 * แล้วไม่มีอะไรเกิดขึ้นโดยไม่รู้สาเหตุ
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const row = await loadOwned(id, auth.companyId);
    if (!row) return NextResponse.json({ error: 'ไม่พบกลุ่มเป้าหมายนี้' }, { status: 404 });

    const deleteRemote = new URL(request.url).searchParams.get('delete_remote') === '1';
    const remoteErrors: string[] = [];

    if (deleteRemote) {
      const { data: syncs } = await supabaseAdmin
        .from('audience_syncs')
        .select('id, ad_account_id, external_audience_id')
        .eq('audience_id', id)
        .eq('company_id', auth.companyId);

      for (const s of (syncs || []) as { ad_account_id: string; external_audience_id: string | null }[]) {
        if (!s.external_audience_id) continue;
        const account = await getAdAccountRow(s.ad_account_id);
        if (!account?.access_token) continue;
        const res = await deleteCustomAudience(s.external_audience_id, account.access_token);
        if (!res.ok) remoteErrors.push(s.external_audience_id);
      }
    }

    const { error } = await supabaseAdmin
      .from('audiences')
      .delete()
      .eq('id', id)
      .eq('company_id', auth.companyId);
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      ...(remoteErrors.length
        ? { warning: `ลบกลุ่มบน Meta ไม่สำเร็จ ${remoteErrors.length} รายการ — อาจถูกใช้ในชุดโฆษณาที่ยังรันอยู่ ต้องลบใน Ads Manager เอง` }
        : {}),
    });
  } catch (e) {
    console.error('DELETE audience error:', e);
    return NextResponse.json({ error: 'ลบกลุ่มเป้าหมายไม่สำเร็จ' }, { status: 500 });
  }
}
