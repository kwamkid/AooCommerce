// Path: app/api/coupons/route.ts
//
// จัดการคูปองของร้าน (โค้ดที่ลูกค้ากรอก) — คนละเรื่องกับ `promotions` ซึ่งลดอัตโนมัติตามเงื่อนไข
// กติกาการคิดส่วนลด/ตรวจสิทธิ์อยู่ที่ [lib/coupons.ts](../../../lib/coupons.ts) ที่เดียว
//
// ⚠️ **ลบคูปองที่เคยถูกใช้ไม่ได้** (FK ของ `coupon_redemptions` เป็น cascade — ลบแล้วประวัติหาย
// และรายงานยอดขายย้อนหลังจะเพี้ยน) ⇒ มีประวัติใช้ = ปิดใช้งานแทน
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  COUPON_CHANNELS,
  generateCouponCode,
  normalizeCouponCode,
  type CouponChannel,
} from '@/lib/coupons';

const SELECT_FIELDS =
  'id, code, name, discount_type, discount_value, max_discount, min_spend, valid_from, valid_until, usage_limit_total, usage_limit_per_customer, used_count, customer_id, fb_contact_id, channels, source, is_active, created_at, updated_at';

/** ค่าที่รับจากฟอร์ม — ตัวเลขว่างถือเป็น null (ไม่จำกัด) ไม่ใช่ 0 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanChannels(v: unknown): CouponChannel[] {
  const list = Array.isArray(v) ? v.map(String) : [];
  const picked = COUPON_CHANNELS.filter((c) => list.includes(c));
  return picked.length > 0 ? [...picked] : [...COUPON_CHANNELS];
}

// ─── GET /api/coupons ───────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(req);
    if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth, 'masterdata.coupons')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const search = normalizeCouponCode(req.nextUrl.searchParams.get('search') || '');
    let query = supabaseAdmin
      .from('coupons')
      .select(SELECT_FIELDS)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (search) query = query.ilike('code', `%${search}%`);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ coupons: data || [] });
  } catch (err) {
    console.error('[api/coupons] GET failed:', err);
    return NextResponse.json({ error: 'โหลดคูปองไม่สำเร็จ' }, { status: 500 });
  }
}

// ─── POST /api/coupons ──────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(req);
    if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth, 'masterdata.coupons')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const discountType = body.discount_type === 'percent' ? 'percent' : 'amount';
    const discountValue = num(body.discount_value) ?? 0;
    if (discountValue <= 0) return NextResponse.json({ error: 'ใส่ส่วนลดมากกว่า 0' }, { status: 400 });
    if (discountType === 'percent' && discountValue > 100) {
      return NextResponse.json({ error: 'ส่วนลดเป็นเปอร์เซ็นต์เกิน 100 ไม่ได้' }, { status: 400 });
    }

    const row = {
      company_id: auth.companyId,
      name: (String(body.name ?? '').trim() || null),
      discount_type: discountType,
      discount_value: discountValue,
      max_discount: discountType === 'percent' ? num(body.max_discount) : null,
      min_spend: num(body.min_spend) ?? 0,
      valid_from: body.valid_from ? String(body.valid_from) : null,
      valid_until: body.valid_until ? String(body.valid_until) : null,
      usage_limit_total: num(body.usage_limit_total),
      usage_limit_per_customer: num(body.usage_limit_per_customer),
      customer_id: body.customer_id ? String(body.customer_id) : null,
      fb_contact_id: body.fb_contact_id ? String(body.fb_contact_id) : null,
      channels: cleanChannels(body.channels),
      source: 'manual' as const,
      is_active: body.is_active === false ? false : true,
      created_by: auth.userId ?? null,
    };

    // โค้ดที่ร้านพิมพ์เอง (เช่น WELCOME5) หรือให้ระบบสุ่มให้ — ชนกันแล้วสุ่มใหม่สูงสุด 5 ครั้ง
    const wanted = normalizeCouponCode(String(body.code ?? ''));
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = wanted || generateCouponCode(String(body.prefix ?? ''));
      const { data, error } = await supabaseAdmin
        .from('coupons')
        .insert({ ...row, code })
        .select(SELECT_FIELDS)
        .single();

      if (!error) return NextResponse.json({ coupon: data });
      // 23505 = unique ชน — โค้ดที่ร้านพิมพ์เองต้องบอกให้แก้ ส่วนโค้ดสุ่มให้สุ่มใหม่เงียบ ๆ
      if (error.code !== '23505') throw error;
      if (wanted) return NextResponse.json({ error: `โค้ด ${code} มีอยู่แล้ว` }, { status: 409 });
    }
    return NextResponse.json({ error: 'สุ่มโค้ดไม่สำเร็จ ลองใหม่อีกครั้ง' }, { status: 500 });
  } catch (err) {
    console.error('[api/coupons] POST failed:', err);
    return NextResponse.json({ error: 'สร้างคูปองไม่สำเร็จ' }, { status: 500 });
  }
}

// ─── PUT /api/coupons ───────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(req);
    if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth, 'masterdata.coupons')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = String(body.id ?? '');
    if (!id) return NextResponse.json({ error: 'ไม่พบคูปองที่จะแก้' }, { status: 400 });

    // แก้ได้เฉพาะเงื่อนไขการใช้ — **โค้ดกับชนิดส่วนลดห้ามแก้** เพราะบิลเก่าที่ใช้ไปแล้วอ้างอิงอยู่
    const patch: Record<string, unknown> = {};
    if ('name' in body) patch.name = String(body.name ?? '').trim() || null;
    if ('min_spend' in body) patch.min_spend = num(body.min_spend) ?? 0;
    if ('max_discount' in body) patch.max_discount = num(body.max_discount);
    if ('valid_from' in body) patch.valid_from = body.valid_from ? String(body.valid_from) : null;
    if ('valid_until' in body) patch.valid_until = body.valid_until ? String(body.valid_until) : null;
    if ('usage_limit_total' in body) patch.usage_limit_total = num(body.usage_limit_total);
    if ('usage_limit_per_customer' in body) patch.usage_limit_per_customer = num(body.usage_limit_per_customer);
    if ('channels' in body) patch.channels = cleanChannels(body.channels);
    if ('is_active' in body) patch.is_active = !!body.is_active;

    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'ไม่มีอะไรให้แก้' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('coupons')
      .update(patch)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select(SELECT_FIELDS)
      .single();
    if (error) throw error;
    return NextResponse.json({ coupon: data });
  } catch (err) {
    console.error('[api/coupons] PUT failed:', err);
    return NextResponse.json({ error: 'แก้คูปองไม่สำเร็จ' }, { status: 500 });
  }
}

// ─── DELETE /api/coupons?id= ────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(req);
    if (!auth.isAuth || !auth.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!can(auth, 'masterdata.coupons')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const id = req.nextUrl.searchParams.get('id') || '';
    if (!id) return NextResponse.json({ error: 'ไม่พบคูปองที่จะลบ' }, { status: 400 });

    // เคยถูกใช้แล้ว = ปิดใช้งานแทนการลบ (ลบทิ้งจะพาประวัติการใช้หายไปด้วย)
    const { count } = await supabaseAdmin
      .from('coupon_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('coupon_id', id);

    if ((count ?? 0) > 0) {
      const { error } = await supabaseAdmin
        .from('coupons')
        .update({ is_active: false })
        .eq('id', id)
        .eq('company_id', auth.companyId);
      if (error) throw error;
      return NextResponse.json({ success: true, disabled: true, used: count });
    }

    const { error } = await supabaseAdmin.from('coupons').delete().eq('id', id).eq('company_id', auth.companyId);
    if (error) throw error;
    return NextResponse.json({ success: true, deleted: true });
  } catch (err) {
    console.error('[api/coupons] DELETE failed:', err);
    return NextResponse.json({ error: 'ลบคูปองไม่สำเร็จ' }, { status: 500 });
  }
}
