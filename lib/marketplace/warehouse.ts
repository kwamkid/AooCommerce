// คลังของแต่ละช่องทางขาย — จุดเดียวที่ตัดสินว่า "ออเดอร์ช่องทางนี้ตัดสต็อกคลังไหน"
// และ "สต็อกที่ส่งขึ้น/ดึงลงจาก platform เป็นของคลังไหน" (server-only)
//
// ปัญหาที่แก้ (2026-08-29): ทุก platform ทุกร้าน query `warehouses.is_default = true`
// เองกระจาย 8 จุด → ร้าน Shopee 6 ร้าน + TikTok + Lazada ใช้คลังเดียวกันหมดโดยไม่มีใคร
// เลือกได้ ทั้งที่ร้านคนละร้านอาจแพ็คส่งจากคนละคลัง
//
// ⚠️ **ห้าม query `is_default` เองในโค้ดที่เกี่ยวกับช่องทางขายอีก** — ต้องผ่านที่นี่
// ไม่งั้นจะเกิดอาการที่แย่กว่าเดิม: ตัดสต็อกคลังหนึ่ง แต่ส่งยอดของอีกคลังขึ้น platform

import { supabaseAdmin } from '@/lib/supabase-admin';

/** คลัง default ของบริษัท — ตัวสำรองเมื่อช่องทางยังไม่ได้เลือกคลัง */
export async function getDefaultWarehouseId(companyId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('warehouses')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * คลังที่ marketplace account นี้ใช้
 *
 * รับ account object ที่มี `warehouse_id` มาแล้วก็ได้ (ไม่ต้อง query ซ้ำ) หรือส่ง id มาก็ได้
 * คืน null เมื่อบริษัทยังไม่มีคลัง active เลย — caller ต้องรับมือเอง (ปกติแปลว่ายังไม่ได้ตั้งระบบคลัง)
 */
export async function resolveAccountWarehouseId(
  account: { id?: string; company_id: string; warehouse_id?: string | null }
): Promise<string | null> {
  if (account.warehouse_id) {
    // ยืนยันว่าคลังยังใช้งานได้และเป็นของบริษัทนี้ — ปิดคลังไปแล้วต้องไม่ตัดสต็อกเข้าไปอีก
    const { data } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('id', account.warehouse_id)
      .eq('company_id', account.company_id)
      .eq('is_active', true)
      .maybeSingle();
    if (data?.id) return data.id;
    console.warn(
      `[Warehouse] ช่องทาง ${account.id ?? ''} ชี้ไปคลัง ${account.warehouse_id} ที่ปิดอยู่/ไม่ใช่ของบริษัทนี้ — ใช้คลัง default แทน`
    );
  }
  return getDefaultWarehouseId(account.company_id);
}

/** เวอร์ชันที่รู้แค่ account id — ใช้เมื่อ caller ไม่ได้ถือ row อยู่ในมือ */
export async function resolveWarehouseIdByAccountId(accountId: string): Promise<string | null> {
  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('id, company_id, warehouse_id')
    .eq('id', accountId)
    .maybeSingle();
  if (!account) return null;
  return resolveAccountWarehouseId(account);
}
