// Public: create an order from the storefront checkout. No auth.
//
// SECURITY RULES (this is an unauthenticated write path — treat every field as hostile):
//   • company comes from the shop slug, never from the body
//   • prices/names are re-read from the DB — the client's numbers are ignored entirely
//   • every variation must belong to this company AND be active + storefront_visible
//   • the shipping fee is recomputed from the zone, never taken from the client
//   • zone/slot ids must belong to this company; slot must actually be available
//   • basic per-IP rate limiting so the endpoint can't be used to spam orders
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStorefrontCompany } from '@/lib/storefront-server';
import { effectivePrice } from '@/lib/storefront';
import {
  resolveZone, resolveDeliveryFee, getSlotAvailability,
  getSlotWindow, buildWindowLabel,
  type DeliveryZone, type DeliverySlot,
} from '@/lib/delivery';

export const dynamic = 'force-dynamic';

interface CheckoutItem { variation_id: string; quantity: number }
interface CheckoutBody {
  shop: string;
  items: CheckoutItem[];
  name: string;
  phone: string;
  email?: string;
  address: string;
  district?: string;
  amphoe?: string;
  province?: string;
  postal_code?: string;
  delivery_date?: string;
  delivery_slot_id?: string;
  note?: string;
}

const MAX_ITEMS = 50;
const MAX_QTY_PER_ITEM = 99;

// Bounded in-memory rate limit — good enough to stop trivial abuse on a single
// instance. A shared store (Upstash/Redis) is the upgrade path if this grows.
const RATE_LIMIT = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = RATE_LIMIT.get(key);
  if (!entry || now > entry.resetAt) {
    RATE_LIMIT.set(key, { count: 1, resetAt: now + WINDOW_MS });
    if (RATE_LIMIT.size > 5000) {
      for (const [k, v] of RATE_LIMIT) if (now > v.resetAt) RATE_LIMIT.delete(k);
    }
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_WINDOW;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const body = await request.json().catch(() => null) as CheckoutBody | null;
  if (!body?.shop) return NextResponse.json({ error: 'ข้อมูลไม่ครบ' }, { status: 400 });

  if (rateLimited(`${ip}:${body.shop}`)) {
    return NextResponse.json({ error: 'ส่งคำสั่งซื้อถี่เกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  const company = await getStorefrontCompany(body.shop);
  if (!company) return NextResponse.json({ error: 'ไม่พบหน้าร้าน' }, { status: 404 });

  // ── validate contact + address ──
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const address = (body.address || '').trim();
  if (!name) return NextResponse.json({ error: 'กรุณากรอกชื่อผู้รับ' }, { status: 400 });
  if (!/^[0-9+\-\s()]{8,20}$/.test(phone)) {
    return NextResponse.json({ error: 'เบอร์โทรไม่ถูกต้อง' }, { status: 400 });
  }
  if (!address) return NextResponse.json({ error: 'กรุณากรอกที่อยู่จัดส่ง' }, { status: 400 });

  // ── validate items ──
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (rawItems.length === 0) return NextResponse.json({ error: 'ไม่มีสินค้าในตะกร้า' }, { status: 400 });
  if (rawItems.length > MAX_ITEMS) return NextResponse.json({ error: 'สินค้าในตะกร้ามากเกินไป' }, { status: 400 });

  // Merge duplicate lines, clamp quantities
  const qtyByVariation = new Map<string, number>();
  for (const it of rawItems) {
    const qty = Math.floor(Number(it.quantity) || 0);
    if (!it.variation_id || qty <= 0) continue;
    qtyByVariation.set(it.variation_id, Math.min(MAX_QTY_PER_ITEM, (qtyByVariation.get(it.variation_id) || 0) + qty));
  }
  if (qtyByVariation.size === 0) return NextResponse.json({ error: 'ไม่มีสินค้าในตะกร้า' }, { status: 400 });

  // Re-read the truth from the DB — the client only ever chooses WHAT and HOW MANY
  const { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select('id, product_id, variation_label, sku, default_price, discount_price, is_active, products!inner(id, code, name, is_active, storefront_visible, company_id)')
    .eq('company_id', company.id)
    .in('id', Array.from(qtyByVariation.keys()))
    .is('deleted_at', null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sellable = (variations as any[] | null || []).filter(v =>
    v.is_active && v.products?.is_active && v.products?.storefront_visible,
  );
  if (sellable.length !== qtyByVariation.size) {
    return NextResponse.json({ error: 'มีสินค้าบางรายการไม่พร้อมขายแล้ว กรุณาตรวจสอบตะกร้าอีกครั้ง' }, { status: 409 });
  }

  const lines = sellable.map(v => {
    const qty = qtyByVariation.get(v.id)!;
    const { price } = effectivePrice(v.default_price, v.discount_price);
    return {
      variation_id: v.id,
      product_id: v.product_id,
      product_code: v.products.code as string | null,
      product_name: v.products.name as string,
      variation_label: v.variation_label as string | null,
      quantity: qty,
      unit_price: price,
      total: Math.round(price * qty * 100) / 100,
    };
  });
  const itemsSubtotal = lines.reduce((s, l) => s + l.total, 0);

  // ── zone → shipping fee (recomputed server-side, never trusted from client) ──
  let zone: DeliveryZone | null = null;
  let shippingFee = 0;
  if (company.features.delivery_zone) {
    const [{ data: zoneRows }, { data: links }] = await Promise.all([
      supabaseAdmin.from('delivery_zones')
        .select('id, name, provinces, districts, postcodes, fee_type, fee, free_over, lead_minutes, is_active, sort_order')
        .eq('company_id', company.id).eq('is_active', true).order('sort_order'),
      supabaseAdmin.from('delivery_zone_slots').select('zone_id, slot_id').eq('company_id', company.id),
    ]);
    const byZone = new Map<string, string[]>();
    for (const l of (links || []) as { zone_id: string; slot_id: string }[]) {
      const list = byZone.get(l.zone_id) || [];
      list.push(l.slot_id);
      byZone.set(l.zone_id, list);
    }
    const zones = ((zoneRows || []) as DeliveryZone[]).map(z => ({ ...z, slot_ids: byZone.get(z.id) || [] }));
    zone = resolveZone(
      { province: body.province, amphoe: body.amphoe, postal_code: body.postal_code },
      zones,
    );
    if (!zone) {
      return NextResponse.json(
        { error: 'ขออภัย ที่อยู่นี้อยู่นอกพื้นที่จัดส่งของร้าน' },
        { status: 400 },
      );
    }
    const fee = resolveDeliveryFee(zone, itemsSubtotal);
    // โซนแบบ Lalamove ยังไม่มี quote อัตโนมัติ — ลงออเดอร์เป็น 0 แล้วให้ร้านแจ้งยอดทีหลัง
    shippingFee = fee.fee ?? 0;
  }

  // ── slot ──
  let slot: DeliverySlot | null = null;
  let slotWindow: ReturnType<typeof getSlotWindow> | null = null;
  if (company.features.delivery_slot && body.delivery_slot_id) {
    if (!body.delivery_date) {
      return NextResponse.json({ error: 'กรุณาเลือกวันที่จัดส่ง' }, { status: 400 });
    }
    const { data: slotRow } = await supabaseAdmin
      .from('delivery_slots')
      .select('id, name, start_time, end_time, days_of_week, capacity, cutoff_minutes, is_active, sort_order')
      .eq('company_id', company.id)
      .eq('id', body.delivery_slot_id)
      .eq('is_active', true)
      .maybeSingle();
    if (!slotRow) return NextResponse.json({ error: 'ไม่พบรอบจัดส่งที่เลือก' }, { status: 400 });

    const { count } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .eq('delivery_date', body.delivery_date)
      .eq('delivery_slot_id', slotRow.id)
      .neq('order_status', 'cancelled');

    const avail = getSlotAvailability(
      { ...(slotRow as DeliverySlot), booked_count: count ?? 0 },
      body.delivery_date,
      zone,
    );
    // เช็คซ้ำฝั่ง server — ระหว่างที่ลูกค้ากรอกฟอร์ม รอบอาจเต็มหรือเลยเวลาปิดรับไปแล้ว
    if (!avail.available) {
      return NextResponse.json(
        { error: 'รอบจัดส่งที่เลือกไม่ว่างแล้ว กรุณาเลือกรอบอื่น' },
        { status: 409 },
      );
    }
    slot = slotRow as DeliverySlot;
    slotWindow = getSlotWindow(slot, body.delivery_date, zone);
  }

  // ── totals (VAT-inclusive pricing, same rule as the back-office order API) ──
  const totalWithVat = itemsSubtotal + shippingFee;
  const vatRegistered = await supabaseAdmin
    .from('companies').select('vat_registered').eq('id', company.id).single()
    .then(r => r.data?.vat_registered || false);
  const subtotalBeforeVat = vatRegistered ? Math.round((totalWithVat / 1.07) * 100) / 100 : totalWithVat;
  const vatAmount = vatRegistered ? Math.round((totalWithVat - subtotalBeforeVat) * 100) / 100 : 0;

  const { data: orderNumber, error: numberError } = await supabaseAdmin
    .rpc('generate_order_number', { p_company_id: company.id });
  if (numberError || !orderNumber) {
    return NextResponse.json({ error: 'สร้างเลขที่คำสั่งซื้อไม่สำเร็จ' }, { status: 500 });
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      company_id: company.id,
      order_number: orderNumber,
      subtotal: subtotalBeforeVat,
      vat_amount: vatAmount,
      discount_amount: 0,
      shipping_fee: shippingFee,
      total_amount: totalWithVat,
      payment_status: 'pending',
      order_status: 'new',
      flow_type: 'r_retail',
      source: 'storefront',
      source_name: company.config.display_name || company.name,
      notes: (body.note || '').trim() || null,
      delivery_name: name,
      delivery_phone: phone,
      delivery_email: (body.email || '').trim() || null,
      delivery_address: address,
      delivery_district: (body.district || '').trim() || null,
      delivery_amphoe: (body.amphoe || '').trim() || null,
      delivery_province: (body.province || '').trim() || null,
      delivery_postal_code: (body.postal_code || '').trim() || null,
      delivery_date: body.delivery_date || null,
      // snapshot — แก้โซน/รอบทีหลังต้องไม่เปลี่ยนสิ่งที่ลูกค้าเลือกไว้
      delivery_zone_id: zone?.id ?? null,
      delivery_zone_label: zone?.name ?? null,
      delivery_slot_id: slot?.id ?? null,
      // snapshot ช่วงที่ส่งได้จริง = สิ่งที่ลูกค้าเห็นตอนกดสั่ง (คำสัญญาที่ให้ไว้)
      delivery_slot_label: slotWindow ? buildWindowLabel(slotWindow) : null,
      delivery_slot_start: slotWindow ? `${slotWindow.start}:00` : null,
      delivery_slot_end: slot?.end_time ?? null,
    })
    .select('id, order_number')
    .single();

  if (orderError || !order) {
    console.error('[storefront checkout] order insert failed:', orderError);
    return NextResponse.json({ error: 'สร้างคำสั่งซื้อไม่สำเร็จ' }, { status: 500 });
  }

  const { error: itemsError } = await supabaseAdmin.from('order_items').insert(
    lines.map(l => ({
      company_id: company.id,
      order_id: order.id,
      variation_id: l.variation_id,
      product_id: l.product_id,
      product_code: l.product_code,
      product_name: l.product_name,
      variation_label: l.variation_label,
      quantity: l.quantity,
      unit_price: l.unit_price,
      discount_percent: 0,
      discount_amount: 0,
      discount_type: 'percent',
      subtotal: l.total,
      total: l.total,
    })),
  );

  if (itemsError) {
    // Roll back so a half-written order never reaches the back office
    await supabaseAdmin.from('orders').delete().eq('id', order.id).eq('company_id', company.id);
    console.error('[storefront checkout] items insert failed:', itemsError);
    return NextResponse.json({ error: 'สร้างรายการสินค้าไม่สำเร็จ' }, { status: 500 });
  }

  return NextResponse.json({
    order_id: order.id,
    order_number: order.order_number,
    total: totalWithVat,
    bill_url: `/bills/${order.id}`,
  });
}
