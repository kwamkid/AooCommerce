// Path: app/api/coupons/validate/route.ts
//
// ตรวจโค้ดคูปองกับบิลที่กำลังเปิดอยู่ — ใช้จากฟอร์มเปิดบิล · POS · เคาน์เตอร์ห้าง
// (หน้าร้านออนไลน์ **ไม่ได้เรียก route นี้** เพราะเป็น public write path ที่ต้องตรวจซ้ำฝั่ง
// เซิร์ฟเวอร์ตอน checkout อยู่แล้ว — เรียก `checkCoupon()` ตรงใน /api/storefront/checkout)
//
// ⚠️ route นี้ **ไม่ตัดสิทธิ์การใช้** แค่บอกว่าใช้ได้ไหมและลดเท่าไหร่ · การตัดสิทธิ์จริงเกิดตอน
// สร้างบิล (insert `coupon_redemptions`) เพื่อกันคนละคนกดพร้อมกันแล้วใช้โค้ดใบเดียวเกินโควตา
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { checkCoupon, normalizeCouponCode, COUPON_CHANNELS, type Coupon, type CouponChannel } from '@/lib/coupons';

export async function POST(req: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(req);
    if (!isAuth || !companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const code = normalizeCouponCode(String(body.code ?? ''));
    const itemsTotal = Number(body.itemsTotal ?? 0);
    const channel = String(body.channel ?? 'chat_order') as CouponChannel;
    const customerId = body.customerId ? String(body.customerId) : null;

    if (!code) return NextResponse.json({ ok: false, reason: 'ยังไม่ได้กรอกโค้ด' });
    if (!COUPON_CHANNELS.includes(channel)) {
      return NextResponse.json({ ok: false, reason: 'ช่องทางนี้ใช้คูปองไม่ได้' });
    }

    const { data: coupon } = await supabaseAdmin
      .from('coupons')
      .select('id, code, name, discount_type, discount_value, max_discount, min_spend, valid_from, valid_until, usage_limit_total, usage_limit_per_customer, used_count, customer_id, fb_contact_id, channels, is_active')
      .eq('company_id', companyId)
      .eq('code', code)
      .maybeSingle<Coupon & { name: string | null }>();

    // ไม่บอกว่า "โค้ดนี้เป็นของร้านอื่น" — บอกแค่ว่าไม่พบ
    if (!coupon) return NextResponse.json({ ok: false, reason: 'ไม่พบโค้ดนี้' });

    // ลูกค้ารายนี้เคยใช้คูปองใบนี้ไปกี่ครั้งแล้ว
    let usedByCustomer = 0;
    if (customerId) {
      const { count } = await supabaseAdmin
        .from('coupon_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('coupon_id', coupon.id)
        .eq('customer_id', customerId);
      usedByCustomer = count ?? 0;
    }

    const result = checkCoupon({ coupon, itemsTotal, channel, customerId, usedByCustomer });
    if (!result.ok) return NextResponse.json({ ok: false, reason: result.reason });

    return NextResponse.json({
      ok: true,
      discount: result.discount,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        name: coupon.name ?? null,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_value,
      },
    });
  } catch (err) {
    console.error('[api/coupons/validate] failed:', err);
    return NextResponse.json({ error: 'ตรวจโค้ดไม่สำเร็จ' }, { status: 500 });
  }
}
