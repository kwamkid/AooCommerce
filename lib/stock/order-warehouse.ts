// คลังของบิลหนึ่งใบ — ใช้ร่วมทุกทางเข้า (บิลเปิดเอง · แชท · หน้าร้านออนไลน์)
//
// แยกออกมาจาก `/api/orders` เพราะ **หน้าร้านออนไลน์เคยไม่หาคลังเลย** บิลจึงไม่ผูกคลัง
// แล้วทุกจุดที่เช็ค `if (order.warehouse_id)` ก็ข้ามสต็อกเงียบ ๆ ตลอดชีวิตของบิลนั้น

import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * คลังของบิลใบนี้ — ลำดับ: ที่ staff เลือกในฟอร์ม → คลังของช่องทางขาย → คลังหลักของบริษัท
 * (ช่องทางมีคลังของตัวเองได้ เช่นไลฟ์ที่แพ็คจากสาขา — ดู `sales_channels.warehouse_id`)
 *
 * แยกออกมาเพราะ **หน้าร้านออนไลน์เคยไม่หาคลังเลย** บิลจึงไม่ผูกคลังแล้วข้ามสต็อกทั้งชีวิต
 */
export async function resolveOrderWarehouse(
  companyId: string,
  formWarehouseId: string | null,
  salesChannelId: string | null,
): Promise<string | null> {
  if (formWarehouseId) return formWarehouseId;

  if (salesChannelId) {
    const { data: channel } = await supabaseAdmin
      .from('sales_channels')
      .select('warehouse_id')
      .eq('id', salesChannelId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (channel?.warehouse_id) {
      const { data: active } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('id', channel.warehouse_id)
        .eq('is_active', true)
        .maybeSingle();
      if (active?.id) return active.id;
    }
  }

  const { data: fallback } = await supabaseAdmin
    .from('warehouses')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return fallback?.id || null;
}
