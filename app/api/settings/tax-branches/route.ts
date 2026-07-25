// VAT branch CRUD — backs the cashier branch picker and the company settings
// branch manager. Each branch represents one VAT registration of the company
// (สำนักงานใหญ่ + additional สาขา). POS receipt sequences scope per branch
// so each one gets its own continuous numbering for audit purposes.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

const CODE_REGEX = /^\d{5}$/; // Thai VAT branch codes are 5-digit zero-padded numbers

interface TaxBranchRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  address: string | null;
  is_default: boolean;
  sort_order: number;
}

export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('tax_branches')
    .select('id, code, name, address, is_default, sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ branches: data || [] });
}

export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการสาขา VAT' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Partial<TaxBranchRow> | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const code = (body.code || '').trim().padStart(5, '0');
  const name = (body.name || '').trim();

  if (!CODE_REGEX.test(code)) {
    return NextResponse.json({ error: 'รหัสสาขาต้องเป็นตัวเลข 5 หลัก (เช่น 00000, 00001)' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'กรุณาระบุชื่อสาขา' }, { status: 400 });
  }

  // Dedup check (DB also enforces via UNIQUE constraint, but message is cleaner)
  const { data: existing } = await supabaseAdmin
    .from('tax_branches')
    .select('id')
    .eq('company_id', auth.companyId)
    .eq('code', code)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `รหัสสาขา "${code}" มีอยู่แล้ว` }, { status: 409 });
  }

  // Position new branch at the end of the list
  const { data: maxRow } = await supabaseAdmin
    .from('tax_branches')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (maxRow?.sort_order ?? -1) + 1;

  const { data, error } = await supabaseAdmin
    .from('tax_branches')
    .insert({
      company_id: auth.companyId,
      code,
      name,
      address: body.address?.trim() || null,
      is_default: false, // first branch is_default is set by the auto-seed migration; manual additions never default
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branch: data });
}

export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการสาขา VAT' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Partial<TaxBranchRow> | null;
  if (!body?.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.address !== undefined) updateData.address = body.address?.trim() || null;
  // Code is intentionally immutable: receipts already issued reference the
  // branch by code via receipt_number prefix; changing it would break audit trail.

  const { data, error } = await supabaseAdmin
    .from('tax_branches')
    .update(updateData)
    .eq('id', body.id)
    .eq('company_id', auth.companyId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ branch: data });
}

export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการสาขา VAT' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  // Safety: branches referenced by orders (via pos_tax_branch_id) keep the
  // audit trail intact via ON DELETE SET NULL — but flag to user so they
  // understand the historical link will be detached.
  const { count: orderCount } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', auth.companyId)
    .eq('pos_tax_branch_id', id);

  if ((orderCount ?? 0) > 0) {
    return NextResponse.json(
      { error: `ลบไม่ได้ — มีออเดอร์ POS ${orderCount} รายการอ้างอิงสาขานี้อยู่ (แก้ไขชื่อแทนได้)` },
      { status: 400 },
    );
  }

  const { error } = await supabaseAdmin
    .from('tax_branches')
    .delete()
    .eq('id', id)
    .eq('company_id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'settings.access')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการสาขา VAT' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { orders?: { id: string; sort_order: number }[] } | null;
  if (!body?.orders?.length) return NextResponse.json({ error: 'orders array required' }, { status: 400 });

  for (const item of body.orders) {
    await supabaseAdmin
      .from('tax_branches')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
      .eq('company_id', auth.companyId);
  }
  return NextResponse.json({ ok: true });
}
