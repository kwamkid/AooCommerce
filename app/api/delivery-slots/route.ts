// Delivery slots (ช่วงเวลาส่ง) — CRUD for /settings/delivery
// ?date=YYYY-MM-DD adds booked_count per slot (orders on that delivery_date,
// excluding cancelled) so callers can compute availability via lib/delivery.ts.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

interface SlotBody {
  id?: string;
  name?: string;
  start_time?: string;   // 'HH:mm'
  end_time?: string;
  days_of_week?: number[];
  capacity?: number | null;
  cutoff_minutes?: number;
  is_active?: boolean;
  sort_order?: number;
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function sanitizeDays(v: unknown): number[] {
  if (!Array.isArray(v)) return [0, 1, 2, 3, 4, 5, 6];
  const days = Array.from(new Set(v.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6)));
  return days.sort((a, b) => a - b);
}

// GET — list slots. ?active=true filters active; ?date= adds booked_count.
export async function GET(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const activeOnly = url.searchParams.get('active') === 'true';
  const date = url.searchParams.get('date'); // YYYY-MM-DD

  let query = supabaseAdmin
    .from('delivery_slots')
    .select('id, name, start_time, end_time, days_of_week, capacity, cutoff_minutes, is_active, sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: true })
    .order('start_time', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);

  const { data: slots, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let bookedBySlot: Map<string, number> | null = null;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && (slots || []).length > 0) {
    const { data: booked } = await supabaseAdmin
      .from('orders')
      .select('delivery_slot_id')
      .eq('company_id', auth.companyId)
      .eq('delivery_date', date)
      .neq('order_status', 'cancelled')
      .not('delivery_slot_id', 'is', null);
    bookedBySlot = new Map();
    for (const o of booked || []) {
      bookedBySlot.set(o.delivery_slot_id, (bookedBySlot.get(o.delivery_slot_id) || 0) + 1);
    }
  }

  return NextResponse.json({
    slots: (slots || []).map(s => ({
      ...s,
      ...(bookedBySlot ? { booked_count: bookedBySlot.get(s.id) || 0 } : {}),
    })),
  });
}

function validateSlotTimes(body: SlotBody): string | null {
  if (!body.start_time || !TIME_REGEX.test(body.start_time)) return 'เวลาเริ่มไม่ถูกต้อง';
  if (!body.end_time || !TIME_REGEX.test(body.end_time)) return 'เวลาสิ้นสุดไม่ถูกต้อง';
  if (body.end_time <= body.start_time) return 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม';
  return null;
}

// POST — create slot
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.delivery')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการช่วงเวลาส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as SlotBody | null;
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อรอบส่ง' }, { status: 400 });
  const timeError = validateSlotTimes(body);
  if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });

  const { data: last } = await supabaseAdmin
    .from('delivery_slots')
    .select('sort_order')
    .eq('company_id', auth.companyId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: slot, error } = await supabaseAdmin
    .from('delivery_slots')
    .insert({
      company_id: auth.companyId,
      name,
      start_time: body.start_time,
      end_time: body.end_time,
      days_of_week: sanitizeDays(body.days_of_week),
      capacity: body.capacity == null || body.capacity === 0 ? null : Math.max(1, Math.round(Number(body.capacity))),
      cutoff_minutes: Math.max(0, Math.round(Number(body.cutoff_minutes) || 0)),
      is_active: body.is_active !== false,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single();
  if (error || !slot) {
    return NextResponse.json({ error: error?.message || 'สร้างไม่สำเร็จ' }, { status: 500 });
  }
  return NextResponse.json({ id: slot.id });
}

// PUT — update slot (id in body)
export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.delivery')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการช่วงเวลาส่ง' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as SlotBody | null;
  if (!body?.id) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อรอบส่ง' }, { status: 400 });
    update.name = name;
  }
  if (body.start_time !== undefined || body.end_time !== undefined) {
    // both required together for the ordering check
    const timeError = validateSlotTimes(body);
    if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });
    update.start_time = body.start_time;
    update.end_time = body.end_time;
  }
  if (body.days_of_week !== undefined) update.days_of_week = sanitizeDays(body.days_of_week);
  if (body.capacity !== undefined) update.capacity = body.capacity == null || body.capacity === 0 ? null : Math.max(1, Math.round(Number(body.capacity)));
  if (body.cutoff_minutes !== undefined) update.cutoff_minutes = Math.max(0, Math.round(Number(body.cutoff_minutes) || 0));
  if (body.is_active !== undefined) update.is_active = body.is_active !== false;
  if (body.sort_order !== undefined) update.sort_order = Math.round(Number(body.sort_order) || 0);

  if (Object.keys(update).length === 0) return NextResponse.json({ success: true });

  const { error } = await supabaseAdmin
    .from('delivery_slots')
    .update(update)
    .eq('id', body.id)
    .eq('company_id', auth.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE ?id= — hard delete when no orders reference it, else soft-disable.
export async function DELETE(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!can(auth.companyRoles, 'masterdata.delivery')) {
    return NextResponse.json({ error: 'ไม่มีสิทธิ์จัดการช่วงเวลาส่ง' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', auth.companyId)
    .eq('delivery_slot_id', id);

  if ((count ?? 0) > 0) {
    const { error } = await supabaseAdmin
      .from('delivery_slots')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', auth.companyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, soft: true });
  }

  const { error } = await supabaseAdmin
    .from('delivery_slots')
    .delete()
    .eq('id', id)
    .eq('company_id', auth.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
