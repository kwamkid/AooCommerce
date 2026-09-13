// เขียนที่อยู่ผู้ซื้อของ marketplace ลง `shipping_addresses` — **ที่เดียวของทุกแพลตฟอร์ม**
//
// ⛔ ห้าม insert `shipping_addresses` เองใน `lib/<platform>/sync.ts` อีก
//    (Lazada/TikTok เคยเขียนคอลัมน์ที่ไม่มีจริง — `recipient_name`, `address` — แล้ว
//     **ไม่เช็ค `error`** ออเดอร์ 100% จึงไม่มีที่อยู่เลยโดยไม่มีใครรู้ · fix-bug.md 2026-09-14)
//
// คอลัมน์จริงของตาราง: address_name · contact_person · phone · address_line1 · address_line2
//                      district · amphoe · province · postal_code · is_default · is_active
// `address_name` · `address_line1` · `province` เป็น NOT NULL — ไม่มีจังหวัดก็สร้างแถวไม่ได้

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { MarketplaceBuyer } from '@/lib/marketplace/buyer-adapter';

interface EnsureArgs {
  companyId: string;
  customerId: string;
  /** ผลจาก buyer adapter ของแพลตฟอร์มนั้น — ค่าที่ถูกปิดบังต้องเป็น null มาแล้ว */
  buyer: MarketplaceBuyer;
  /** ป้ายชื่อที่อยู่ เช่น 'ที่อยู่ Lazada' */
  addressName: string;
  /** ชื่อผู้รับสำรอง (ชื่อลูกค้าที่เราตั้งไว้) เมื่อแพลตฟอร์มปิดบังชื่อ */
  fallbackContact?: string | null;
  /** เบอร์สำรองที่ผ่านการตรวจแล้วว่าไม่ถูกปิดบัง */
  fallbackPhone?: string | null;
  /** สำหรับ log เวลา insert ล้ม */
  logLabel: string;
}

/**
 * คืน id ของที่อยู่จัดส่ง — สร้างใหม่ถ้ายังไม่มี · `null` เมื่อข้อมูลไม่พอจะสร้าง
 * (แพลตฟอร์มปิดบังจนไม่เหลือแม้แต่จังหวัด) หรือเขียนไม่สำเร็จ
 */
export async function ensureBuyerShippingAddress({
  companyId, customerId, buyer, addressName, fallbackContact, fallbackPhone, logLabel,
}: EnsureArgs): Promise<string | null> {
  const province = buyer.province || null;
  const amphoe = buyer.amphoe || null;
  // ไม่มีจังหวัด = คอลัมน์ NOT NULL เขียนไม่ได้ และที่อยู่แบบนั้นก็ส่งของไม่ได้อยู่ดี
  if (!province) return null;

  const addressLine1 = buyer.address_line || [amphoe, province].filter(Boolean).join(' ');
  if (!addressLine1) return null;

  const contactPerson = buyer.name || fallbackContact || null;
  const phone = buyer.phone || fallbackPhone || null;

  const { data: existing } = await supabaseAdmin
    .from('shipping_addresses')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    // มีอยู่แล้ว = เติมเฉพาะช่องที่แพลตฟอร์มเพิ่งบอกมา **ห้ามทับของเดิมด้วย null**
    // (ที่อยู่ที่พนักงานแก้มือไว้ต้องไม่หายเพราะ sync รอบใหม่ได้ข้อมูลที่ถูกปิดบัง)
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (contactPerson) patch.contact_person = contactPerson;
    if (phone) patch.phone = phone;
    if (buyer.address_line) patch.address_line1 = buyer.address_line;
    if (buyer.district) patch.district = buyer.district;
    if (amphoe) patch.amphoe = amphoe;
    if (province) patch.province = province;
    if (buyer.postal_code) patch.postal_code = buyer.postal_code;

    const { error } = await supabaseAdmin
      .from('shipping_addresses')
      .update(patch)
      .eq('id', existing.id);
    if (error) console.error(`[${logLabel}] update shipping_address failed:`, error.message);
    return existing.id;
  }

  const { data: created, error } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      company_id: companyId,
      customer_id: customerId,
      address_name: addressName,
      contact_person: contactPerson,
      phone,
      address_line1: addressLine1,
      district: buyer.district || null,
      amphoe,
      province,
      postal_code: buyer.postal_code || null,
      is_default: true,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !created) {
    console.error(`[${logLabel}] create shipping_address failed:`, error?.message);
    return null;
  }
  return created.id;
}
