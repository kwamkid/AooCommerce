// Path: app/api/bills/coupon/route.ts
//
// ลูกค้ากรอก/ถอดโค้ดคูปองเองบนหน้าบิลออนไลน์ — **public write path ไม่มีการล็อกอิน**
// (ท่าเดียวกับ PUT /api/bills ที่ให้ลูกค้ากรอกที่อยู่เอง) ⇒ ถือว่าทุกค่าจาก body เป็นของปลอม
// บริษัทและยอดเงินอ่านใหม่จาก DB ทั้งหมด ไม่เชื่อตัวเลขจากเบราว์เซอร์
//
// กติกาคูปองอยู่ที่ [lib/coupons.ts](../../../../lib/coupons.ts) · ยอดเงินคิดด้วยสูตรกลาง
// `computeOrderTotals()` เท่านั้น — ห้ามคิด VAT หรือหักส่วนลดเองในไฟล์นี้
//
// ⚠️ ป้องกันการเดาโค้ด: ตอบข้อความเดียวกันทุกกรณีที่ใช้ไม่ได้ ("ใช้โค้ดนี้กับบิลนี้ไม่ได้")
// ไม่บอกว่าโค้ดมีจริงแต่หมดอายุ/เป็นของคนอื่น — คนนอกจะได้ไม่ใช้หน้าบิลไล่เดาโค้ดของร้าน
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { computeOrderTotals } from '@/lib/order-totals';
import { checkCoupon, normalizeCouponCode, type Coupon } from '@/lib/coupons';

const CHANNEL = 'bill_online' as const;
/** ข้อความเดียวสำหรับทุกเหตุผลที่ใช้ไม่ได้ — กันคนไล่เดาโค้ดจากหน้าบิลสาธารณะ */
const GENERIC_REJECT = 'ใช้โค้ดนี้กับบิลนี้ไม่ได้';

interface BillForCoupon {
  id: string;
  company_id: string;
  customer_id: string | null;
  order_status: string;
  payment_status: string;
  shipping_fee: number | null;
  gift_card_fee: number | null;
  discount_amount: number | null;
}

/** อ่านบิล + ยอดสินค้าจริงจาก order_items (ไม่เชื่อ subtotal ที่เก็บไว้ เผื่อรายการถูกแก้ทีหลัง) */
async function loadBill(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, company_id, customer_id, order_status, payment_status, shipping_fee, gift_card_fee, discount_amount')
    .eq('id', orderId)
    .maybeSingle<BillForCoupon>();
  if (!order) return null;

  const { data: items } = await supabaseAdmin
    .from('order_items')
    .select('total')
    .eq('order_id', orderId);
  const itemsTotal = (items || []).reduce((sum, r) => sum + Number(r.total || 0), 0);

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('vat_registered')
    .eq('id', order.company_id)
    .maybeSingle<{ vat_registered: boolean | null }>();

  return { order, itemsTotal, vatRegistered: !!company?.vat_registered };
}

/** บิลที่ยังแก้ยอดได้ — จ่ายแล้วหรือยกเลิกแล้วห้ามแตะ (ยอดที่ลูกค้าจ่ายไปต้องไม่เปลี่ยนย้อนหลัง) */
function billIsEditable(order: BillForCoupon): boolean {
  return order.payment_status !== 'paid' && order.order_status !== 'cancelled' && order.order_status !== 'completed';
}

async function applyTotals(order: BillForCoupon, itemsTotal: number, vatRegistered: boolean, discountAmount: number) {
  const { subtotal, vatAmount, totalAmount } = computeOrderTotals({
    itemsTotal,
    discountAmount,
    shippingFee: Number(order.shipping_fee || 0),
    giftCardFee: Number(order.gift_card_fee || 0),
    vatRegistered,
  });
  const { error } = await supabaseAdmin
    .from('orders')
    .update({
      discount_amount: discountAmount,
      order_discount_type: discountAmount > 0 ? 'amount' : null,
      subtotal,
      vat_amount: vatAmount,
      total_amount: totalAmount,
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id);
  if (error) throw error;
  return { subtotal, vatAmount, totalAmount, discountAmount };
}

// ─── POST: ลูกค้ากรอกโค้ด ────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orderId = String(body.order_id ?? '').trim();
    const code = normalizeCouponCode(String(body.code ?? ''));
    if (!orderId || !code) return NextResponse.json({ error: 'กรุณากรอกโค้ดส่วนลด' }, { status: 400 });

    const bill = await loadBill(orderId);
    if (!bill) return NextResponse.json({ error: 'ไม่พบบิลนี้' }, { status: 404 });
    if (!billIsEditable(bill.order)) {
      return NextResponse.json({ error: 'บิลนี้ชำระหรือปิดไปแล้ว ใช้โค้ดไม่ได้' }, { status: 400 });
    }

    // บิลนี้ใช้คูปองไปแล้วใบหนึ่ง — ถอดใบเดิมก่อนถึงจะใส่ใบใหม่ได้ (ใช้ได้ใบเดียวต่อบิล)
    const { data: existing } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('id')
      .eq('order_id', orderId)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'บิลนี้ใช้โค้ดส่วนลดไปแล้ว' }, { status: 409 });
    }

    // มีส่วนลดท้ายบิลที่ร้านใส่ไว้เองอยู่ก่อน — ห้ามทับเงียบ ๆ
    if (Number(bill.order.discount_amount || 0) > 0) {
      return NextResponse.json({ error: 'บิลนี้มีส่วนลดจากร้านอยู่แล้ว กรุณาติดต่อร้าน' }, { status: 409 });
    }

    const { data: coupon } = await supabaseAdmin
      .from('coupons')
      .select('id, code, name, discount_type, discount_value, max_discount, min_spend, valid_from, valid_until, usage_limit_total, usage_limit_per_customer, used_count, customer_id, fb_contact_id, channels, is_active')
      .eq('company_id', bill.order.company_id)
      .eq('code', code)
      .maybeSingle<Coupon>();
    if (!coupon) return NextResponse.json({ error: GENERIC_REJECT }, { status: 400 });

    let usedByCustomer = 0;
    if (bill.order.customer_id) {
      const { count } = await supabaseAdmin
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('customer_id', bill.order.customer_id);
      usedByCustomer = count ?? 0;
    }

    const result = checkCoupon({
      coupon,
      itemsTotal: bill.itemsTotal,
      channel: CHANNEL,
      customerId: bill.order.customer_id,
      usedByCustomer,
    });
    // เหตุผลจริงเก็บไว้ใน log ฝั่งเรา ลูกค้าเห็นข้อความกลาง ๆ
    if (!result.ok) {
      console.log('[bills/coupon] rejected', { orderId, code, reason: result.reason });
      return NextResponse.json({ error: GENERIC_REJECT }, { status: 400 });
    }

    // จองสิทธิ์ก่อนแก้ยอด — unique (coupon_id, order_id) กันกดซ้ำพร้อมกัน
    const { data: redemption, error: redeemError } = await supabaseAdmin
      .from('coupon_redemptions')
      .insert({
        company_id: bill.order.company_id,
        coupon_id: coupon.id,
        order_id: orderId,
        customer_id: bill.order.customer_id,
        amount: result.discount,
        channel: CHANNEL,
      })
      .select('id')
      .single();
    if (redeemError) {
      if (redeemError.code === '23505') return NextResponse.json({ error: 'บิลนี้ใช้โค้ดส่วนลดไปแล้ว' }, { status: 409 });
      throw redeemError;
    }

    // กันเกินโควตารวมเมื่อมีคนกดพร้อมกันคนละบิล — เกินแล้วคืนสิทธิ์ทิ้ง
    if (coupon.usage_limit_total != null) {
      const { count } = await supabaseAdmin
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id);
      if ((count ?? 0) > coupon.usage_limit_total) {
        await supabaseAdmin.from('coupon_redemptions').delete().eq('id', redemption.id);
        return NextResponse.json({ error: GENERIC_REJECT }, { status: 400 });
      }
    }

    const totals = await applyTotals(bill.order, bill.itemsTotal, bill.vatRegistered, result.discount);
    await supabaseAdmin
      .from('coupons')
      .update({ used_count: (coupon.used_count || 0) + 1 })
      .eq('id', coupon.id);

    return NextResponse.json({
      success: true,
      coupon: { code: coupon.code, discount_type: coupon.discount_type, discount_value: coupon.discount_value },
      ...totals,
    });
  } catch (err) {
    console.error('[api/bills/coupon] POST failed:', err);
    return NextResponse.json({ error: 'ใช้โค้ดไม่สำเร็จ' }, { status: 500 });
  }
}

// ─── DELETE: ลูกค้าถอดโค้ดออก ────────────────────────────
export async function DELETE(request: NextRequest) {
  try {
    const orderId = request.nextUrl.searchParams.get('order_id') || '';
    if (!orderId) return NextResponse.json({ error: 'ไม่พบบิล' }, { status: 400 });

    const bill = await loadBill(orderId);
    if (!bill) return NextResponse.json({ error: 'ไม่พบบิลนี้' }, { status: 404 });
    if (!billIsEditable(bill.order)) {
      return NextResponse.json({ error: 'บิลนี้ชำระหรือปิดไปแล้ว แก้ไม่ได้' }, { status: 400 });
    }

    const { data: redemption } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('id, coupon_id')
      .eq('order_id', orderId)
      .maybeSingle<{ id: string; coupon_id: string }>();
    if (!redemption) return NextResponse.json({ error: 'บิลนี้ไม่ได้ใช้โค้ดอยู่' }, { status: 400 });

    await supabaseAdmin.from('coupon_redemptions').delete().eq('id', redemption.id);

    const { data: coupon } = await supabaseAdmin
      .from('coupons')
      .select('used_count')
      .eq('id', redemption.coupon_id)
      .maybeSingle<{ used_count: number }>();
    if (coupon) {
      await supabaseAdmin
        .from('coupons')
        .update({ used_count: Math.max(0, (coupon.used_count || 0) - 1) })
        .eq('id', redemption.coupon_id);
    }

    const totals = await applyTotals(bill.order, bill.itemsTotal, bill.vatRegistered, 0);
    return NextResponse.json({ success: true, ...totals });
  } catch (err) {
    console.error('[api/bills/coupon] DELETE failed:', err);
    return NextResponse.json({ error: 'ถอดโค้ดไม่สำเร็จ' }, { status: 500 });
  }
}
