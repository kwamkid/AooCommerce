// ค่าตั้งต้นของรอบวางบิลทั้งบริษัท — เก็บที่ companies.settings.billing
//
// อยู่ใน settings ก้อนเดียวกับ bill_expiry_days / gift_card แต่แยก endpoint
// เพราะเป็นคนละเรื่อง และหน้าตั้งค่าทั่วไปบันทึกทีละก้อนอยู่แล้ว
//
// **ใช้กับทั้งตัวแทนและห้าง** — ทั้งสองสายวางบิลรอบเดือนเหมือนกัน ตั้งที่นี่เป็น
// ค่าตั้งต้น แล้วลูกค้าแต่ละรายทับได้ที่ `customers.statement_day` / `credit_days`
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_STATEMENT_DAY, DEFAULT_CREDIT_DAYS } from '@/lib/statements/billing-cycle';

interface BillingSettings {
  statement_day: number;
  credit_days: number;
}

function readBilling(settings: Record<string, unknown>): BillingSettings {
  const billing = (settings.billing ?? {}) as Partial<BillingSettings>;
  return {
    statement_day: Number(billing.statement_day) || DEFAULT_STATEMENT_DAY,
    credit_days: Number.isFinite(Number(billing.credit_days))
      ? Number(billing.credit_days)
      : DEFAULT_CREDIT_DAYS,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { data } = await supabaseAdmin
      .from('companies').select('settings').eq('id', companyId).single();

    return NextResponse.json(readBilling((data?.settings as Record<string, unknown>) || {}));
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

    const body = await request.json() as Partial<BillingSettings>;
    const statementDay = Number(body.statement_day);
    const creditDays = Number(body.credit_days);

    if (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 31) {
      return NextResponse.json({ error: 'วันวางบิลต้องเป็น 1-31' }, { status: 400 });
    }
    if (!Number.isInteger(creditDays) || creditDays < 0 || creditDays > 180) {
      return NextResponse.json({ error: 'จำนวนวันเครดิตต้องเป็น 0-180' }, { status: 400 });
    }

    const { data: company } = await supabaseAdmin
      .from('companies').select('settings').eq('id', companyId).single();

    const currentSettings = (company?.settings as Record<string, unknown>) || {};
    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({
        settings: {
          ...currentSettings,
          billing: { statement_day: statementDay, credit_days: creditDays },
        },
      })
      .eq('id', companyId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ statement_day: statementDay, credit_days: creditDays });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
