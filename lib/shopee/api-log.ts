// บันทึก Shopee API call ที่ fail ลง integration_logs — ระดับ "ทุก request" ไม่ใช่ระดับงาน
//
// ปัญหาที่แก้ (2026-08-29): push stock ตายมาตั้งแต่ พ.ค. โดยไม่มีใครรู้ เพราะ log
// ถูกวางไว้แค่ชั้นบน (auto_push_stock / push_stock) ซึ่งเป็น fire-and-forget เหมือนกัน
// พอ serverless freeze ทั้งงานและ log ก็หายพร้อมกัน — เหลือแค่ตัวเลข 0% ในหน้า
// API Call Statistics ของ Shopee ที่บอกไม่ได้ว่า error คืออะไร
//
// วางไว้ในตัว request function เอง → ทุก call site ปัจจุบันและอนาคตได้ log อัตโนมัติ

import { supabaseAdmin } from '@/lib/supabase-admin';
import { logIntegrationNow } from '@/lib/integration-logger';

type ShopRef = { id: string; company_id: string; shop_name: string | null } | null;

/** shop_id → account (cache ทั้ง process — error path เท่านั้นที่เรียก จึงไม่ต้องกลัว stale) */
const shopCache = new Map<number, ShopRef>();

async function resolveShop(shopId: number): Promise<ShopRef> {
  if (shopCache.has(shopId)) return shopCache.get(shopId)!;
  const { data } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('id, company_id, shop_name')
    .eq('platform', 'shopee')
    .eq('shop_id', shopId)
    .maybeSingle();
  const ref = (data as ShopRef) || null;
  shopCache.set(shopId, ref);
  return ref;
}

export interface ShopeeCallFailure {
  shopId: number;
  method: string;
  apiPath: string;
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  errorMessage: string;
  httpStatus?: number;
  responseBody?: unknown;
}

/**
 * เขียน log ของ call ที่ fail — await ได้ ไม่ปล่อยลอย (ดูหัวไฟล์ว่าทำไม)
 * ห้าม throw เด็ดขาด: อยู่ใน error path ของ API อยู่แล้ว พังซ้ำจะกลบ error ตัวจริง
 */
export async function logShopeeCallFailure(f: ShopeeCallFailure): Promise<void> {
  try {
    const shop = await resolveShop(f.shopId);
    if (!shop) return; // ไม่รู้ว่าเป็นของบริษัทไหน → เขียนไม่ได้ (company_id เป็น NOT NULL)
    await logIntegrationNow({
      company_id: shop.company_id,
      integration: 'shopee',
      account_id: shop.id,
      account_name: shop.shop_name,
      direction: 'outgoing',
      action: 'api_error',
      method: f.method,
      api_path: f.apiPath,
      request_body: { params: f.params, body: f.body },
      response_body: f.responseBody,
      http_status: f.httpStatus,
      status: 'error',
      error_message: f.errorMessage,
    });
  } catch (e) {
    console.error('[Shopee API] log failure error:', e);
  }
}
