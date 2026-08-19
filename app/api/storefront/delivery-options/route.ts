// Public: resolve zone + fee + selectable slots for an address on the storefront
// checkout. No auth — company comes from ?shop=<slug> and every query is scoped
// to that company id. Only public-safe fields are returned (no capacity counts,
// no internal ids beyond what the checkout must post back).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStorefrontCompany } from '@/lib/storefront-server';
import {
  resolveZone, resolveDeliveryFee, getSlotAvailability,
  buildSlotLabel, buildWindowLabel, getSlotWindow, slotUnavailableLabel,
  type DeliveryZone, type DeliverySlot,
} from '@/lib/delivery';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const shop = url.searchParams.get('shop') || '';
  const province = url.searchParams.get('province');
  const amphoe = url.searchParams.get('amphoe');
  const postal = url.searchParams.get('postal_code');
  const date = url.searchParams.get('date');           // YYYY-MM-DD
  const subtotal = Number(url.searchParams.get('subtotal')) || 0;

  const company = await getStorefrontCompany(shop);
  if (!company) return NextResponse.json({ error: 'ไม่พบหน้าร้าน' }, { status: 404 });

  const wantZone = company.features.delivery_zone;
  const wantSlot = company.features.delivery_slot;

  const [zonesRes, slotsRes, linkRes] = await Promise.all([
    wantZone
      ? supabaseAdmin.from('delivery_zones')
          .select('id, name, provinces, districts, postcodes, fee_type, fee, free_over, lead_minutes, is_active, sort_order')
          .eq('company_id', company.id).eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
    wantSlot
      ? supabaseAdmin.from('delivery_slots')
          .select('id, name, start_time, end_time, days_of_week, capacity, cutoff_minutes, is_active, sort_order')
          .eq('company_id', company.id).eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] }),
    wantZone && wantSlot
      ? supabaseAdmin.from('delivery_zone_slots').select('zone_id, slot_id').eq('company_id', company.id)
      : Promise.resolve({ data: [] }),
  ]);

  const slotIdsByZone = new Map<string, string[]>();
  for (const l of (linkRes.data || []) as { zone_id: string; slot_id: string }[]) {
    const list = slotIdsByZone.get(l.zone_id) || [];
    list.push(l.slot_id);
    slotIdsByZone.set(l.zone_id, list);
  }
  const zones = ((zonesRes.data || []) as DeliveryZone[])
    .map(z => ({ ...z, slot_ids: slotIdsByZone.get(z.id) || [] }));

  const zone = wantZone
    ? resolveZone({ province, amphoe, postal_code: postal }, zones)
    : null;
  const feeResult = zone ? resolveDeliveryFee(zone, subtotal) : null;

  // capacity ต่อวัน — นับเฉพาะตอนมีวันที่ส่ง
  let booked = new Map<string, number>();
  if (wantSlot && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const { data } = await supabaseAdmin
      .from('orders')
      .select('delivery_slot_id')
      .eq('company_id', company.id)
      .eq('delivery_date', date)
      .neq('order_status', 'cancelled')
      .not('delivery_slot_id', 'is', null);
    booked = new Map();
    for (const o of data || []) {
      booked.set(o.delivery_slot_id, (booked.get(o.delivery_slot_id) || 0) + 1);
    }
  }

  const slots = ((slotsRes.data || []) as DeliverySlot[]).map(s => {
    const withBooked = { ...s, booked_count: booked.get(s.id) || 0 };
    const avail = date
      ? getSlotAvailability(withBooked, date, zone)
      : { available: false as const, reason: null };
    // แสดงช่วงที่ส่งได้จริง — สั่ง 08:00 โซนใช้ 2 ชม. รอบ 09:00-12:00 → 10:00-12:00
    const window = date && avail.available ? getSlotWindow(s, date, zone) : null;
    return {
      id: s.id,
      name: s.name,
      label: window ? buildWindowLabel(window) : buildSlotLabel(s),
      /** true = ช่วงถูกหั่นสั้นลงเพราะสั่งช้า — UI บอกลูกค้าได้ว่าทำไมไม่ใช่ 09:00 */
      narrowed: window?.narrowed ?? false,
      full_label: buildSlotLabel(s),
      start_time: s.start_time,
      end_time: s.end_time,
      available: avail.available,
      // เหตุผลเป็นข้อความพร้อมแสดง — ช่องที่เลือกไม่ได้ต้องบอกว่าทำไม ห้ามซ่อน
      reason: slotUnavailableLabel(avail.reason, zone),
    };
  });

  return NextResponse.json({
    zone_required: wantZone,
    slot_required: wantSlot,
    zone: zone
      ? {
          id: zone.id,
          name: zone.name,
          fee: feeResult?.fee ?? null,
          needs_quote: feeResult?.needsQuote ?? false,
          free_applied: feeResult?.freeApplied ?? false,
          free_over: zone.free_over,
          lead_minutes: zone.lead_minutes,
        }
      : null,
    // null zone + zone_required = นอกพื้นที่จัดส่ง → checkout ต้องบอกลูกค้าตรง ๆ
    slots,
    // วันในสัปดาห์ที่ร้านมีรอบส่ง — ปฏิทินจะได้ปิดวันที่ร้านหยุดไปเลย
    // ไม่ต้องให้ลูกค้ากดแล้วเจอ "ไม่มีรอบจัดส่ง" ทีหลัง
    available_weekdays: [...new Set(
      ((slotsRes.data || []) as DeliverySlot[]).flatMap(s => s.days_of_week || []),
    )].sort(),
  });
}
