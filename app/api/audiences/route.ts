// Path: app/api/audiences/route.ts
//
// กลุ่มเป้าหมายที่บันทึกไว้ — รายการ (GET) และสร้างใหม่ (POST)
//
// ทุก query ผูก `company_id` เสมอ (supabaseAdmin เป็น service role ที่ข้าม RLS) และ
// แหล่งข้อมูลใน definition ต้องถูกตรวจว่าเป็นของบริษัทนี้จริงก่อนบันทึก ไม่งั้นผู้ใช้
// ส่ง chat_account_id ของบริษัทอื่นมาแล้วดูดผู้ติดต่อข้ามร้านได้
//
// สิทธิ์ `marketing.audiences` = ชั้นผู้บริหาร — งานนี้**ส่งข้อมูลลูกค้าออกไปนอกระบบ**
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  assertSourcesBelongToCompany,
  loadAudienceViews,
  validateAudienceDefinition,
} from '@/lib/audiences/resolve';

/** ชื่อกลุ่มโผล่บนหน้าจอ Ads Manager ของลูกค้าด้วย — ยาวกว่านี้อ่านไม่รู้เรื่องทั้งสองฝั่ง */
const NAME_MAX = 120;
const DESCRIPTION_MAX = 500;

// GET — กลุ่มทั้งหมดที่ยังเปิดใช้ (ใหม่สุดก่อน)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const audiences = await loadAudienceViews(auth.companyId);
    return NextResponse.json({ audiences });
  } catch (e) {
    console.error('GET audiences error:', e);
    return NextResponse.json({ error: 'ดึงรายการกลุ่มเป้าหมายไม่สำเร็จ' }, { status: 500 });
  }
}

// POST — สร้างกลุ่มใหม่ (ยังไม่ผูกกับบัญชีโฆษณา — ผูกทีหลังที่ /[id]/syncs)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'marketing.audiences')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? '').trim().slice(0, NAME_MAX);
    if (!name) return NextResponse.json({ error: 'กรุณาตั้งชื่อกลุ่ม' }, { status: 400 });
    const description = String(body.description ?? '').trim().slice(0, DESCRIPTION_MAX) || null;

    const parsed = validateAudienceDefinition(body.definition);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

    const ownershipError = await assertSourcesBelongToCompany(auth.companyId, parsed.def);
    if (ownershipError) return NextResponse.json({ error: ownershipError }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('audiences')
      .insert({
        company_id: auth.companyId,
        name,
        description,
        definition: parsed.def,
        created_by: auth.userId || null,
      })
      .select('id')
      .single();

    if (error) {
      // unique(company_id, name) — ชื่อซ้ำเป็นเรื่องที่ผู้ใช้แก้เองได้ ไม่ใช่ระบบพัง
      if (error.code === '23505') {
        return NextResponse.json({ error: 'มีกลุ่มชื่อนี้แล้ว', code: 'duplicate' }, { status: 409 });
      }
      throw error;
    }

    const [audience] = await loadAudienceViews(auth.companyId, { id: data.id });
    return NextResponse.json({ audience }, { status: 201 });
  } catch (e) {
    console.error('POST audience error:', e);
    return NextResponse.json({ error: 'สร้างกลุ่มเป้าหมายไม่สำเร็จ' }, { status: 500 });
  }
}
