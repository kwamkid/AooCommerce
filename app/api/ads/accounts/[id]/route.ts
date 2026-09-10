// Path: app/api/ads/accounts/[id]/route.ts
//
// แก้ไข (PUT) / ยกเลิกการเชื่อมต่อ (DELETE) บัญชีโฆษณาหนึ่งใบ
//
// ทุก query ผูก `company_id` เสมอ — id เป็น uuid ที่เดาไม่ได้ก็จริง แต่ "เดาไม่ได้"
// ไม่ใช่การกันสิทธิ์ (ลิงก์หลุด/คัดลอกข้ามบริษัทได้)
//
// `metadata` เขียนผ่าน `markAdAccount()` เท่านั้น เพราะมันอ่านค่าล่าสุดมา merge ให้ —
// เขียนทับทั้งก้อน = ผลตรวจของตัวเฝ้า (tos_required · same_as_page_dataset) หายทุกครั้งที่ผู้ใช้เปลี่ยนชื่อ
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getAdAccountRow, markAdAccount, probeAdAccount, toAdAccountView } from '@/lib/ads/accounts';
import { getDataset } from '@/lib/meta/ads';
import type { AdAccountProbe } from '@/lib/ads/meta-ui';

async function loadOwned(id: string, companyId: string) {
  const { data } = await supabaseAdmin
    .from('ad_accounts')
    .select('id, dataset_id, access_token')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle<{ id: string; dataset_id: string | null; access_token: string | null }>();
  return data ?? null;
}

// PUT — ชื่อ · dataset · เปิด/ปิด · ประเภทบิลที่ส่ง · รหัสทดสอบ
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const row = await loadOwned(id, auth.companyId);
    if (!row) return NextResponse.json({ error: 'ไม่พบบัญชีโฆษณานี้' }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    let datasetChanged = false;

    if (typeof body.name === 'string') update.name = body.name.trim() || null;
    if (typeof body.is_active === 'boolean') update.is_active = body.is_active;

    if (body.dataset_id !== undefined) {
      const datasetId = String(body.dataset_id ?? '').trim();
      if (!/^\d+$/.test(datasetId)) {
        return NextResponse.json({ error: 'รหัส Dataset ต้องเป็นตัวเลข', code: 'invalid_input' }, { status: 400 });
      }
      if (datasetId !== row.dataset_id) {
        datasetChanged = true;
        update.dataset_id = datasetId;
        // ชื่อ dataset เป็นของประดับ — ถามไม่ได้ก็ปล่อยว่างไว้ แล้วให้ผลตรวจข้างล่างเป็นคนบอกว่าใช้ได้จริงไหม
        const ds = row.access_token ? await getDataset(datasetId, row.access_token) : null;
        update.dataset_name = ds?.ok && ds.body ? ds.body.name || null : null;
      }
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabaseAdmin
        .from('ad_accounts')
        .update(update)
        .eq('id', id)
        .eq('company_id', auth.companyId);
      if (error) {
        console.error('[api/ads/accounts/:id] update failed:', error.message);
        return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 });
      }
    }

    // ค่าใน metadata — ส่ง undefined = ลบคีย์ทิ้ง (ไม่ใช่เขียนค่าว่างค้างไว้)
    const metadata: Record<string, unknown> = {};
    if (body.include_flow_types !== undefined) {
      metadata.include_flow_types = Array.isArray(body.include_flow_types)
        ? (body.include_flow_types as unknown[]).map((v) => String(v))
        : undefined;
    }
    if (body.test_event_code !== undefined) {
      const code = String(body.test_event_code ?? '').trim();
      metadata.test_event_code = code || undefined;
    }
    if (Object.keys(metadata).length > 0) await markAdAccount(id, { metadata });

    // เปลี่ยน dataset = ปลายทางเปลี่ยน ⇒ ต้องพิสูจน์ว่ายิงเข้าได้จริง ไม่ใช่แค่บันทึกค่าใหม่
    const probe: AdAccountProbe | undefined = datasetChanged ? await probeAdAccount(id) : undefined;

    const fresh = await getAdAccountRow(id);
    return NextResponse.json({ account: fresh ? toAdAccountView(fresh) : null, ...(probe ? { probe } : {}) });
  } catch (err) {
    console.error('[api/ads/accounts/:id] PUT failed:', err);
    return NextResponse.json({ error: 'บันทึกไม่สำเร็จ' }, { status: 500 });
  }
}

// DELETE — ตัดการเชื่อมต่อถาวร (กลุ่มเป้าหมายที่สร้างไว้ใน Meta ยังอยู่ ลบเองใน Ads Manager)
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'masterdata.ad_accounts')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { id } = await context.params;
    const row = await loadOwned(id, auth.companyId);
    if (!row) return NextResponse.json({ error: 'ไม่พบบัญชีโฆษณานี้' }, { status: 404 });

    const { error } = await supabaseAdmin
      .from('ad_accounts')
      .delete()
      .eq('id', id)
      .eq('company_id', auth.companyId);
    if (error) {
      console.error('[api/ads/accounts/:id] delete failed:', error.message);
      return NextResponse.json({ error: 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/ads/accounts/:id] DELETE failed:', err);
    return NextResponse.json({ error: 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' }, { status: 500 });
  }
}
