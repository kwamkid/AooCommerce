// Path: app/api/storefront/coupon/route.ts
//
// Public: ตรวจโค้ดส่วนลดให้หน้าร้านออนไลน์ **ก่อน** ลูกค้ากดสั่งซื้อ เพื่อให้เห็นยอดลดจริง
// ในกล่องสรุป — ร้านออนไลน์ที่ต้องกดสั่งซื้อก่อนถึงจะรู้ว่าโค้ดใช้ได้ไหมคือของที่ใช้ไม่ได้จริง
//
// ⚠️ route นี้ **ไม่ตัดสิทธิ์การใช้** และตัวเลขที่คืนเป็นแค่พรีวิว — ยอดจริงคิดใหม่ทั้งหมดที่
// /api/storefront/checkout ตอนสร้างบิล (ที่นั่นคือที่เดียวที่ insert `coupon_redemptions`)
//
// SECURITY (public read path — ทุก field จาก client ถือว่าเป็นของปลอม):
//   • company มาจาก shop slug ไม่ใช่ body
//   • ยอดสินค้าอ่านราคาใหม่จาก DB เองทั้งหมด เหมือน checkout — ไม่รับยอดจาก client
//   • เห็นเฉพาะสินค้าที่ active + storefront_visible ของร้านนี้
//   • นับเฉพาะครั้งที่ "โค้ดใช้ไม่ได้" เข้าตัวจำกัด เพื่อกันไล่เดาโค้ด (คนกรอกถูกไม่โดนล็อก)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStorefrontCompany } from '@/lib/storefront-server';
import { effectivePrice } from '@/lib/storefront';
import { checkCoupon, normalizeCouponCode, type Coupon } from '@/lib/coupons';
import { portalRateLimit } from '@/lib/portal-rate-limit';
import { getClientIp } from '@/lib/request-ip';

export const dynamic = 'force-dynamic';

const MAX_ITEMS = 50;
const MAX_QTY_PER_ITEM = 99;

interface CouponCheckBody {
  shop?: string;
  code?: string;
  items?: { variation_id?: string; quantity?: number }[];
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as CouponCheckBody | null;
  if (!body?.shop) return NextResponse.json({ ok: false, reason: 'ข้อมูลไม่ครบ' }, { status: 400 });

  const code = normalizeCouponCode(String(body.code ?? ''));
  if (!code) return NextResponse.json({ ok: false, reason: 'ยังไม่ได้กรอกโค้ด' });

  const rlKey = `sf-coupon:${getClientIp(request)}:${body.shop}`;
  const gate = await portalRateLimit.check(rlKey);
  if (!gate.allowed) {
    return NextResponse.json({ ok: false, reason: 'ลองโค้ดถี่เกินไป กรุณารอสักครู่' }, { status: 429 });
  }

  const company = await getStorefrontCompany(body.shop);
  if (!company) return NextResponse.json({ ok: false, reason: 'ไม่พบหน้าร้าน' }, { status: 404 });

  // ── ยอดสินค้า: client เลือกได้แค่ "อะไร" กับ "กี่ชิ้น" ราคาอ่านจาก DB เสมอ ──
  const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  const qtyByVariation = new Map<string, number>();
  for (const it of rawItems) {
    const qty = Math.floor(Number(it?.quantity) || 0);
    if (!it?.variation_id || qty <= 0) continue;
    qtyByVariation.set(
      it.variation_id,
      Math.min(MAX_QTY_PER_ITEM, (qtyByVariation.get(it.variation_id) || 0) + qty),
    );
  }
  if (qtyByVariation.size === 0) return NextResponse.json({ ok: false, reason: 'ยังไม่มีสินค้าในตะกร้า' });

  const { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select('id, default_price, discount_price, is_active, products!inner(is_active, storefront_visible)')
    .eq('company_id', company.id)
    .in('id', Array.from(qtyByVariation.keys()))
    .is('deleted_at', null);

  const itemsTotal = ((variations as unknown as {
    id: string;
    default_price: number;
    discount_price: number | null;
    is_active: boolean;
    products: { is_active: boolean; storefront_visible: boolean } | null;
  }[] | null) || [])
    .filter(v => v.is_active && v.products?.is_active && v.products?.storefront_visible)
    .reduce((sum, v) => {
      const { price } = effectivePrice(v.default_price, v.discount_price);
      return sum + Math.round(price * (qtyByVariation.get(v.id) || 0) * 100) / 100;
    }, 0);

  const { data: coupon } = await supabaseAdmin
    .from('coupons')
    .select('id, code, discount_type, discount_value, max_discount, min_spend, valid_from, valid_until, usage_limit_total, usage_limit_per_customer, used_count, customer_id, fb_contact_id, channels, is_active')
    .eq('company_id', company.id)
    .eq('code', code)
    .maybeSingle<Coupon>();

  // ไม่บอกว่า "โค้ดนี้เป็นของร้านอื่น" — บอกแค่ว่าไม่พบ
  if (!coupon) {
    await portalRateLimit.fail(rlKey);
    return NextResponse.json({ ok: false, reason: 'ไม่พบโค้ดส่วนลดนี้' });
  }

  // ลูกค้าหน้าร้านยังไม่มี customer_id ตอนนี้ (สร้างตอน checkout) — คูปองเฉพาะคนใช้ที่นี่ไม่ได้
  // กติกาเดียวกับ /api/storefront/checkout ที่ส่ง customerId: null
  const result = checkCoupon({ coupon, itemsTotal, channel: 'storefront', customerId: null });
  if (!result.ok) {
    await portalRateLimit.fail(rlKey);
    return NextResponse.json({ ok: false, reason: result.reason });
  }

  return NextResponse.json({ ok: true, discount: result.discount, code: coupon.code });
}
