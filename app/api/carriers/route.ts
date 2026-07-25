import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

interface CarrierRow {
  id: string;
  company_id: string;
  code: string;
  name: string;
  tracking_url_template: string | null;
  shippop_courier_code: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const CODE_REGEX = /^[a-z0-9_&-]{2,32}$/i;

// GET — list carriers for the current company. ?active=true to filter active only.
export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === 'true';

  let query = supabaseAdmin
    .from('carriers')
    .select('id, code, name, tracking_url_template, shippop_courier_code, is_active, is_system, sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  if (activeOnly) query = query.eq('is_active', true);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ carriers: data || [] });
}

// POST — create a custom carrier
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.carriers')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการรายชื่อขนส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as Partial<CarrierRow> | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const code = (body.code || '').trim().toLowerCase();
  const name = (body.name || '').trim();

  if (!code || !CODE_REGEX.test(code)) {
    return NextResponse.json({ error: 'รหัสขนส่งต้องเป็น a-z, 0-9, -, _, & ความยาว 2-32 ตัว' }, { status: 400 });
  }
  if (!name) {
    return NextResponse.json({ error: 'กรุณาระบุชื่อขนส่ง' }, { status: 400 });
  }

  // unique check
  const { data: existing } = await supabaseAdmin
    .from('carriers')
    .select('id')
    .eq('company_id', auth.companyId)
    .eq('code', code)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: `รหัส "${code}" มีอยู่แล้ว` }, { status: 409 });
  }

  // pick next sort_order at the end (but before 'other' which is 99)
  const { data: maxRow } = await supabaseAdmin
    .from('carriers')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .lt('sort_order', 99)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 10) + 1;

  const { data, error } = await supabaseAdmin
    .from('carriers')
    .insert({
      company_id: auth.companyId,
      code,
      name,
      tracking_url_template: body.tracking_url_template?.toString().trim() || null,
      shippop_courier_code: body.shippop_courier_code?.toString().trim().toUpperCase() || null,
      is_active: body.is_active !== false,
      is_system: false,
      sort_order: nextSort,
    })
    .select('id, code, name, tracking_url_template, shippop_courier_code, is_active, is_system, sort_order')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ carrier: data });
}

// PUT — update an existing carrier
export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.carriers')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการรายชื่อขนส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as (Partial<CarrierRow> & { id?: string }) | null;
  if (!body?.id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const { data: row, error: getErr } = await supabaseAdmin
    .from('carriers')
    .select('id, company_id, code, is_system, is_active')
    .eq('id', body.id)
    .single();

  if (getErr || !row) {
    return NextResponse.json({ error: 'ไม่พบขนส่ง' }, { status: 404 });
  }
  if (row.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Build patch — code is immutable for system rows; for custom rows we still
  // forbid changing code to avoid breaking historical orders.
  const patch: Record<string, unknown> = {};

  if (typeof body.name === 'string') {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อขนส่ง' }, { status: 400 });
    patch.name = name;
  }

  if ('tracking_url_template' in body) {
    patch.tracking_url_template = body.tracking_url_template?.toString().trim() || null;
  }

  if ('shippop_courier_code' in body) {
    patch.shippop_courier_code = body.shippop_courier_code?.toString().trim().toUpperCase() || null;
  }

  if (typeof body.is_active === 'boolean') {
    // Block deactivating the last active carrier (owners must keep ≥1).
    if (!body.is_active && row.is_active) {
      const { count } = await supabaseAdmin
        .from('carriers')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', auth.companyId)
        .eq('is_active', true);
      if ((count ?? 0) <= 1) {
        return NextResponse.json({ error: 'ต้องเหลือขนส่งที่เปิดใช้งานอย่างน้อย 1 รายการ' }, { status: 400 });
      }
    }
    patch.is_active = body.is_active;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'ไม่มีการเปลี่ยนแปลง' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('carriers')
    .update(patch)
    .eq('id', body.id)
    .select('id, code, name, tracking_url_template, shippop_courier_code, is_active, is_system, sort_order')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ carrier: data });
}

// PATCH — batch reorder carriers (sets sort_order from incoming array)
export async function PATCH(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.carriers')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการรายชื่อขนส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { orders?: { id: string; sort_order: number }[] } | null;
  if (!body?.orders || !Array.isArray(body.orders)) {
    return NextResponse.json({ error: 'orders array is required' }, { status: 400 });
  }

  for (const item of body.orders) {
    await supabaseAdmin
      .from('carriers')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
      .eq('company_id', auth.companyId);
  }

  return NextResponse.json({ ok: true });
}

// DELETE — remove a carrier (custom only). System carriers can only be deactivated.
export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.carriers')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการรายชื่อขนส่ง' }, { status: 403 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const { data: row } = await supabaseAdmin
    .from('carriers')
    .select('id, company_id, code, is_system')
    .eq('id', id)
    .single();

  if (!row) return NextResponse.json({ error: 'ไม่พบขนส่ง' }, { status: 404 });
  if (row.company_id !== auth.companyId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (row.is_system) {
    return NextResponse.json({ error: 'ขนส่งของระบบลบไม่ได้ — ใช้ปิดใช้งานแทน' }, { status: 400 });
  }

  // If any order/replenishment used this carrier code, soft-deactivate to keep history valid.
  const inUse = await isCarrierInUse(auth.companyId, row.code);
  if (inUse) {
    const { error: deactivateErr } = await supabaseAdmin
      .from('carriers')
      .update({ is_active: false })
      .eq('id', id);
    if (deactivateErr) {
      return NextResponse.json({ error: deactivateErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, soft_deleted: true, message: 'มีออเดอร์ใช้ขนส่งนี้อยู่ — ปิดใช้งานแทน' });
  }

  const { error } = await supabaseAdmin.from('carriers').delete().eq('id', id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function isCarrierInUse(companyId: string, code: string): Promise<boolean> {
  // Tables with a shipping_carrier text column. order_parcels has no company_id
  // (linked via orders), so we filter via the parent.
  const checks = await Promise.all([
    supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('shipping_carrier', code),
    supabaseAdmin
      .from('replenishments')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('shipping_carrier', code),
    supabaseAdmin
      .from('department_orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('shipping_carrier', code),
  ]);
  return checks.some(r => (r.count ?? 0) > 0);
}
