// บัญชีลูกค้าของหน้าร้าน — ผูก Supabase Auth user เข้ากับแถวใน `customers`
// ของร้านนั้น (ไม่มีตารางลูกค้าชุดที่สอง ต่อ CRM/สะสมแต้มจาก customer_id เดิมได้)
//
// GET  → โปรไฟล์ลูกค้า + ประวัติออเดอร์ของร้านนี้
// POST → ผูกบัญชีที่เพิ่ง login เข้ากับลูกค้า (สร้างใหม่ถ้ายังไม่มี)
//
// auth มาจาก Supabase session ปกติ (Bearer หรือ cookie) — ผู้ใช้ที่ไม่มีแถวใน
// company_members เข้าหลังบ้านไม่ได้อยู่แล้ว จึงใช้ auth ชุดเดียวกันได้ปลอดภัย
import { NextRequest, NextResponse } from 'next/server';
import { newCustomerCode } from '@/lib/customer-code';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getStorefrontCompany } from '@/lib/storefront-server';
import { syncCustomerAvatar } from '@/lib/customer-avatar';
import {
  resolveStorefrontViewer as resolveViewer,
  findLinkedCustomer,
  isCompanyStaff,
  CUSTOMER_PUBLIC_FIELDS,
} from '@/lib/storefront-customer';

export const dynamic = 'force-dynamic';


export async function GET(request: NextRequest) {
  const shop = new URL(request.url).searchParams.get('shop') || '';
  const company = await getStorefrontCompany(shop);
  if (!company) return NextResponse.json({ error: 'ไม่พบหน้าร้าน' }, { status: 404 });

  const viewer = await resolveViewer(request);
  if (!viewer) {
    return NextResponse.json({ signed_in: false, is_staff: false, customer: null, orders: [] });
  }

  const [customer, staff] = await Promise.all([
    findLinkedCustomer(company.id, viewer.userId),
    isCompanyStaff(company.id, viewer.userId),
  ]);
  if (!customer) {
    return NextResponse.json({ signed_in: true, is_staff: staff, customer: null, orders: [] });
  }

  // ดึงรูปโปรไฟล์จากบัญชีที่ผูกไว้มาเก็บของเราเอง (ข้ามเองถ้าเพิ่งซิงก์ไป)
  const avatarUrl = await syncCustomerAvatar(customer.id, viewer.userId);

  // ประวัติออเดอร์ — เฉพาะฟิลด์ที่ลูกค้าควรเห็น ไม่หลุดต้นทุน/หมายเหตุภายใน
  const { data: orders } = await supabaseAdmin
    .from('orders')
    .select('id, order_number, order_status, payment_status, total_amount, created_at, delivery_date, delivery_slot_label, tracking_number, shipping_carrier')
    .eq('company_id', company.id)
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({
    signed_in: true,
    is_staff: staff,
    customer: { ...customer, avatar_url: avatarUrl || customer.avatar_url },
    orders: orders || [],
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { shop?: string } | null;
  const company = await getStorefrontCompany(body?.shop || '');
  if (!company) return NextResponse.json({ error: 'ไม่พบหน้าร้าน' }, { status: 404 });

  const viewer = await resolveViewer(request);
  if (!viewer) return NextResponse.json({ error: 'ยังไม่ได้เข้าสู่ระบบ' }, { status: 401 });

  const existing = await findLinkedCustomer(company.id, viewer.userId);
  if (existing) return NextResponse.json({ customer: existing, created: false });

  // ดึงชื่อ/อีเมลจากบัญชีที่ login มา
  const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(viewer.userId);
  const meta = (authUser?.user?.user_metadata || {}) as Record<string, unknown>;
  const email = authUser?.user?.email || null;
  const emailVerified = !!authUser?.user?.email_confirmed_at;
  const displayName = (meta.full_name || meta.name || meta.display_name || '') as string;
  // login ด้วย LINE → เก็บ userId ไว้ ใช้ push แจ้งเตือนออเดอร์ได้ (ต้องเป็นเพื่อน OA ก่อน)
  const lineUserId = (meta.line_user_id as string | undefined) || null;

  // จับคู่กับลูกค้าเดิมของร้าน — **เฉพาะอีเมลที่ยืนยันแล้วเท่านั้น**
  // ห้ามจับคู่ด้วยเบอร์โทร เพราะเบอร์เป็นค่าที่ใครก็พิมพ์ได้ตอน checkout
  // ถ้าปล่อยให้ match จะยึดประวัติสั่งซื้อของคนอื่นได้ทันที
  let claimed: { id: string } | null = null;
  if (email && emailVerified) {
    const { data } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('company_id', company.id)
      .ilike('email', email)
      .is('auth_user_id', null)
      .limit(1)
      .maybeSingle();
    claimed = data;
  }

  if (claimed) {
    const { data: linked } = await supabaseAdmin
      .from('customers')
      .update({
        auth_user_id: viewer.userId,
        storefront_linked_at: new Date().toISOString(),
        ...(lineUserId ? { line_user_id: lineUserId } : {}),
      })
      .eq('id', claimed.id)
      .eq('company_id', company.id)
      .select(CUSTOMER_PUBLIC_FIELDS)
      .single();
    return NextResponse.json({ customer: linked, created: false, matched_by: 'email' });
  }

  const { data: created, error } = await supabaseAdmin
    .from('customers')
    .insert({
      company_id: company.id,
      customer_code: newCustomerCode('ST'),
      name: displayName || email || 'ลูกค้าออนไลน์',
      email,
      customer_type: 'retail',
      auth_user_id: viewer.userId,
      ...(lineUserId ? { line_user_id: lineUserId } : {}),
      storefront_linked_at: new Date().toISOString(),
    })
    .select(CUSTOMER_PUBLIC_FIELDS)
    .single();

  if (error) {
    console.error('[storefront/me] create customer failed:', error);
    return NextResponse.json({ error: 'สร้างบัญชีลูกค้าไม่สำเร็จ' }, { status: 500 });
  }
  return NextResponse.json({ customer: created, created: true });
}
