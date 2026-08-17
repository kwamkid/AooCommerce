// Delivery zones (จุดส่ง/โซนค่าส่ง) — CRUD for /settings/delivery
// Zone matching/fee logic lives in lib/delivery.ts (shared with order forms).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

interface ZoneBody {
  id?: string;
  name?: string;
  provinces?: string[];
  districts?: string[];
  postcodes?: string[];
  fee_type?: 'fixed' | 'lalamove';
  fee?: number;
  free_over?: number | null;
  lead_minutes?: number;
  is_active?: boolean;
  sort_order?: number;
  /** slot ids allowed for this zone — empty/undefined = all slots allowed */
  slot_ids?: string[];
}

function sanitizeList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return Array.from(new Set(v.map(s => String(s).trim()).filter(Boolean)));
}

// GET — zones with their allowed slot_ids. ?active=true filters active only.
export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const activeOnly = new URL(request.url).searchParams.get('active') === 'true';

  let query = supabaseAdmin
    .from('delivery_zones')
    .select('id, name, provinces, districts, postcodes, fee_type, fee, free_over, lead_minutes, is_active, sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);

  const [{ data: zones, error }, { data: links, error: linkError }] = await Promise.all([
    query,
    supabaseAdmin
      .from('delivery_zone_slots')
      .select('zone_id, slot_id')
      .eq('company_id', auth.companyId),
  ]);
  if (error || linkError) {
    return NextResponse.json({ error: error?.message || linkError?.message }, { status: 500 });
  }

  const slotsByZone = new Map<string, string[]>();
  for (const l of links || []) {
    const list = slotsByZone.get(l.zone_id) || [];
    list.push(l.slot_id);
    slotsByZone.set(l.zone_id, list);
  }

  return NextResponse.json({
    zones: (zones || []).map(z => ({ ...z, slot_ids: slotsByZone.get(z.id) || [] })),
  });
}

// Rewrite zone→slot links (delete + insert). Empty list = all slots allowed.
async function saveZoneSlots(companyId: string, zoneId: string, slotIds: string[] | undefined) {
  if (slotIds === undefined) return; // not sent — leave as-is
  await supabaseAdmin.from('delivery_zone_slots').delete().eq('zone_id', zoneId).eq('company_id', companyId);
  const ids = sanitizeList(slotIds);
  if (ids.length === 0) return;

  // Only link slots that actually belong to this company
  const { data: valid } = await supabaseAdmin
    .from('delivery_slots')
    .select('id')
    .eq('company_id', companyId)
    .in('id', ids);
  const rows = (valid || []).map(s => ({ company_id: companyId, zone_id: zoneId, slot_id: s.id }));
  if (rows.length > 0) await supabaseAdmin.from('delivery_zone_slots').insert(rows);
}

function zonePayload(body: ZoneBody) {
  const feeType = body.fee_type === 'lalamove' ? 'lalamove' : 'fixed';
  return {
    name: (body.name || '').trim(),
    provinces: sanitizeList(body.provinces),
    districts: sanitizeList(body.districts),
    postcodes: sanitizeList(body.postcodes),
    fee_type: feeType,
    fee: Math.max(0, Number(body.fee) || 0),
    free_over: body.free_over == null || body.free_over === 0 ? null : Math.max(0, Number(body.free_over)),
    lead_minutes: Math.max(0, Math.round(Number(body.lead_minutes) || 0)),
    is_active: body.is_active !== false,
  };
}

// POST — create zone
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.delivery')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการจุดส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as ZoneBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const payload = zonePayload(body);
  if (!payload.name) return NextResponse.json({ error: 'กรุณาระบุชื่อจุดส่ง' }, { status: 400 });
  if (payload.provinces.length + payload.districts.length + payload.postcodes.length === 0) {
    return NextResponse.json({ error: 'กรุณาระบุพื้นที่อย่างน้อย 1 รายการ (จังหวัด เขต/อำเภอ หรือรหัสไปรษณีย์)' }, { status: 400 });
  }

  // append at the end of the match order
  const { data: last } = await supabaseAdmin
    .from('delivery_zones')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: zone, error } = await supabaseAdmin
    .from('delivery_zones')
    .insert({ ...payload, company_id: auth.companyId, sort_order: (last?.sort_order ?? -1) + 1 })
    .select('id')
    .single();
  if (error || !zone) {
    return NextResponse.json({ error: error?.message || 'สร้างไม่สำเร็จ' }, { status: 500 });
  }

  await saveZoneSlots(auth.companyId, zone.id, body.slot_ids);
  return NextResponse.json({ id: zone.id });
}

// PUT — update zone (id in body). Accepts partial fields + slot_ids + sort_order.
export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.delivery')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการจุดส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as ZoneBody | null;
  if (!body?.id) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อจุดส่ง' }, { status: 400 });
    update.name = name;
  }
  if (body.provinces !== undefined) update.provinces = sanitizeList(body.provinces);
  if (body.districts !== undefined) update.districts = sanitizeList(body.districts);
  if (body.postcodes !== undefined) update.postcodes = sanitizeList(body.postcodes);
  if (body.fee_type !== undefined) update.fee_type = body.fee_type === 'lalamove' ? 'lalamove' : 'fixed';
  if (body.fee !== undefined) update.fee = Math.max(0, Number(body.fee) || 0);
  if (body.free_over !== undefined) update.free_over = body.free_over == null || body.free_over === 0 ? null : Math.max(0, Number(body.free_over));
  if (body.lead_minutes !== undefined) update.lead_minutes = Math.max(0, Math.round(Number(body.lead_minutes) || 0));
  if (body.is_active !== undefined) update.is_active = body.is_active !== false;
  if (body.sort_order !== undefined) update.sort_order = Math.round(Number(body.sort_order) || 0);

  if (Object.keys(update).length > 0) {
    const { error } = await supabaseAdmin
      .from('delivery_zones')
      .update(update)
      .eq('id', body.id)
      .eq('company_id', auth.companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await saveZoneSlots(auth.companyId, body.id, body.slot_ids);
  return NextResponse.json({ success: true });
}

// DELETE ?id= — hard delete when no orders reference it, else soft-disable.
export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.delivery')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการจุดส่ง' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', auth.companyId)
    .eq('delivery_zone_id', id);

  if ((count ?? 0) > 0) {
    // orders reference it (FK SET NULL would drop history links) — soft-disable
    const { error } = await supabaseAdmin
      .from('delivery_zones')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', auth.companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, soft: true });
  }

  const { error } = await supabaseAdmin
    .from('delivery_zones')
    .delete()
    .eq('id', id)
    .eq('company_id', auth.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
