// ลูกค้าของหน้าร้าน — ใช้ร่วมกันระหว่าง /api/storefront/me และ /api/storefront/checkout
//
// ไม่มีตารางลูกค้าชุดที่สอง — หน้าร้านใช้ `customers` ตัวเดียวกับหลังบ้าน
// เพื่อให้ CRM / สะสมแต้ม / ประวัติการซื้อ ต่อยอดจาก customer_id เดิมได้เลย
import type { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { extractRequestToken } from '@/lib/auth/cookie-token';
import { verifyAccessToken } from '@/lib/auth/verify-token';
import { newCustomerCode } from '@/lib/customer-code';

export const CUSTOMER_PUBLIC_FIELDS =
  'id, name, phone, email, line_user_id, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code';

export async function resolveStorefrontViewer(request: NextRequest) {
  const token = extractRequestToken(request);
  if (!token) return null;
  const verified = await verifyAccessToken(token);
  return verified?.userId ? verified : null;
}

/** ลูกค้าของร้านนี้ที่ผูกกับ auth user แล้ว */
export async function findLinkedCustomer(companyId: string, authUserId: string) {
  const { data } = await supabaseAdmin
    .from('customers')
    .select(CUSTOMER_PUBLIC_FIELDS)
    .eq('company_id', companyId)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  return data;
}

/**
 * คน ๆ นี้เป็นพนักงาน/แอดมินของร้านนี้หรือเปล่า
 *
 * storefront ใช้ Supabase Auth ชุดเดียวกับหลังบ้าน แปลว่าพนักงานที่ login
 * ค้างอยู่จะพก session ติดมาหน้าร้านด้วย — ต้องรู้ให้ได้ เพื่อ (1) ไม่เผลอ
 * สร้างแถวลูกค้าให้พนักงาน และ (2) เตือนตอนทดสอบว่ากำลังใช้บัญชีพนักงานอยู่
 */
export async function isCompanyStaff(companyId: string, authUserId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('company_members')
    .select('id')
    .eq('company_id', companyId)
    .eq('user_id', authUserId)
    .limit(1)
    .maybeSingle();
  return !!data;
}

interface CheckoutContact {
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  district: string | null;
  amphoe: string | null;
  province: string | null;
  postal_code: string | null;
}

/**
 * หา (หรือสร้าง) แถวลูกค้าสำหรับออเดอร์ที่สั่งจากหน้าร้าน
 *
 * ออเดอร์ต้องมี customer_id เสมอ ไม่งั้นประวัติการสั่งซื้อของลูกค้าจะว่างเปล่า
 * (หน้า /account อ่านจาก customer_id) และหลังบ้านก็จะไม่รู้ว่าใครสั่ง
 *
 * ลำดับการจับคู่:
 *   1. บัญชีที่ล็อกอินอยู่และผูกกับร้านนี้แล้ว
 *   2. เบอร์โทรเดิมในร้านนี้ — ลูกค้าเก่าที่เคยซื้อทางอื่นจะได้ไม่มีสองแถว
 *   3. สร้างใหม่
 */
export async function resolveCheckoutCustomer(
  companyId: string,
  contact: CheckoutContact,
  authUserId: string | null,
): Promise<string | null> {
  if (authUserId) {
    const linked = await findLinkedCustomer(companyId, authUserId);
    if (linked?.id) return linked.id;
  }

  const phone = contact.phone.trim();
  if (phone) {
    const { data: byPhone } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('phone', phone)
      .limit(1)
      .maybeSingle();
    if (byPhone?.id) return byPhone.id;
  }

  // ผูก auth user ให้เฉพาะลูกค้าจริง — พนักงานที่ login ค้างแล้วมาทดสอบสั่งซื้อ
  // ไม่ควรกลายเป็นลูกค้าของร้านตัวเอง (จะไปโผล่ในรายชื่อลูกค้าและ CRM)
  const staff = authUserId ? await isCompanyStaff(companyId, authUserId) : false;

  const { data: created, error } = await supabaseAdmin
    .from('customers')
    .insert({
      company_id: companyId,
      customer_code: newCustomerCode('ST'),
      name: contact.name,
      phone: phone || null,
      email: contact.email,
      customer_type: 'retail',
      billing_address: contact.address,
      billing_district: contact.district,
      billing_amphoe: contact.amphoe,
      billing_province: contact.province,
      billing_postal_code: contact.postal_code,
      ...(authUserId && !staff
        ? { auth_user_id: authUserId, storefront_linked_at: new Date().toISOString() }
        : {}),
    })
    .select('id')
    .single();

  if (error) {
    // ไม่ให้ล้มทั้งออเดอร์ — ข้อมูลผู้รับถูกเก็บใน orders.delivery_* อยู่แล้ว
    // ร้านยังส่งของได้ แค่ออเดอร์นี้ไม่ผูกกับแถวลูกค้า
    console.error('[storefront checkout] create customer failed:', error);
    return null;
  }
  return created.id;
}
