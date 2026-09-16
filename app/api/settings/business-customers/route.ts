// ─────────────────────────────────────────────────────────────────────────────
// ค่าตั้งต้นของลูกค้าธุรกิจ — ตัวแทน (settings.consignment) และห้าง (settings.department_store)
//
// แยกออกจาก /api/settings/features เพราะคนละเรื่องกัน: ที่นั่นคือ "เปิด/ปิดฟีเจอร์"
// ที่นี่คือ "ค่าตั้งต้นทางธุรกิจ" (GP% · เงื่อนไขส่งยอด/ชำระ · VAT)
// เดิมสองเรื่องนี้ปนกันในหน้าเดียวจน PUT ต้องส่ง feature flags มาด้วยทุกครั้ง
//
// GP% แยกกันระหว่างตัวแทนกับห้างได้จริง — ห้างคิดเรทคนละแบบกับตัวแทนในธุรกิจจริง
// ส่วน **Brand GP ใช้ร่วมกัน** (settings.brand_gp_overrides) เพราะเป็นเรทของแบรนด์
// ไม่ใช่ของประเภทลูกค้า
// ─────────────────────────────────────────────────────────────────────────────
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export interface ConsignmentDefaults {
  default_gp_rate: number;
  default_gp_base_price: 'retail' | 'discounted';
  default_report_due_days: number;
  default_payment_terms: number;
  vat_included: boolean;
}

export interface DepartmentStoreDefaults {
  default_gp_rate: number;
  default_gp_base_price: 'retail' | 'discounted';
  vat_included: boolean;
}

export const CONSIGNMENT_DEFAULTS: ConsignmentDefaults = {
  default_gp_rate: 30,
  default_gp_base_price: 'retail',
  default_report_due_days: 15,
  default_payment_terms: 30,
  vat_included: true,
};

export const DEPARTMENT_STORE_DEFAULTS: DepartmentStoreDefaults = {
  default_gp_rate: 30,
  default_gp_base_price: 'retail',
  vat_included: true,
};

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { data } = await supabaseAdmin
      .from('companies').select('settings').eq('id', companyId).single();
    const settings = (data?.settings as Record<string, unknown>) || {};

    return NextResponse.json({
      consignment: { ...CONSIGNMENT_DEFAULTS, ...((settings.consignment as object) || {}) },
      // ห้างที่ยังไม่เคยตั้งเอง ใช้เรทเดียวกับตัวแทนไปก่อน (พฤติกรรมเดิมก่อนแยกช่อง)
      department_store: {
        ...DEPARTMENT_STORE_DEFAULTS,
        ...(settings.consignment as object || {}),
        ...((settings.department_store as object) || {}),
      },
      brand_gp_overrides: settings.brand_gp_overrides ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(auth, 'settings.access')) {
      return NextResponse.json({ error: 'Only admin can update settings' }, { status: 403 });
    }

    const body = await request.json() as {
      consignment?: Partial<ConsignmentDefaults> | null;
      department_store?: Partial<DepartmentStoreDefaults> | null;
      brand_gp_overrides?: unknown[] | null;
    };

    const { data: company } = await supabaseAdmin
      .from('companies').select('settings').eq('id', companyId).single();
    const currentSettings = (company?.settings as Record<string, unknown>) || {};

    // เขียนเฉพาะก้อนที่ส่งมา — หน้าตัวแทนกับหน้าห้างบันทึกคนละก้อน ห้ามลบของกันและกัน
    const newSettings = { ...currentSettings };
    if (body.consignment !== undefined) newSettings.consignment = body.consignment;
    if (body.department_store !== undefined) newSettings.department_store = body.department_store;
    if (body.brand_gp_overrides !== undefined) newSettings.brand_gp_overrides = body.brand_gp_overrides;

    const { error } = await supabaseAdmin
      .from('companies').update({ settings: newSettings }).eq('id', companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
