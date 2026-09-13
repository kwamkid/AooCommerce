// TikTok — ตัวดึงยอดเงินรายออเดอร์ (ทำตาม SettlementAdapter · server-only)
//
// TikTok มี statement ต่อออเดอร์ (`/finance/202501/orders/{id}/statement_transactions`)
// การแปลงใช้ `normalizeTikTokStatement()` ตัวเดียวกับ cron รายวัน
//
// ⚠️ 429 ของ TikTok มีสองแบบ — โควตาเราเต็ม กับระบบข้างในเขาสะดุด ทั้งคู่ให้ throw
//    ออกไปให้ชั้นกลางบอกผู้ใช้ว่า "ลองใหม่อีกครั้ง" (สายนี้คือผู้ใช้กดเอง ไม่ใช่ cron
//    จึงไม่มีการรอ-ลองซ้ำเป็นชุดแบบ route ของ cron)

import { ensureValidToken, getOrderStatement, type TikTokAccountRow } from '@/lib/tiktok/api';
import { normalizeTikTokStatement } from '@/lib/tiktok/settlement';
import type { SettlementAdapter } from '@/lib/marketplace/settlement-adapter';

export const tiktokSettlementAdapter: SettlementAdapter = {
  async fetchOrderSettlement(account, order) {
    if (!order.external_order_sn) return null;

    const creds = await ensureValidToken(account as unknown as TikTokAccountRow);
    const { statement, error, rateLimited } = await getOrderStatement(creds, order.external_order_sn);
    if (rateLimited) throw new Error(error || 'TikTok หน่วงการเรียก (rate limited) — ลองใหม่อีกครั้ง');
    if (error) throw new Error(error);
    if (!statement) return 'pending';

    const normalized = normalizeTikTokStatement(statement, { orderId: order.external_order_sn });

    // ⚠️ ใบที่ยังไม่ถึงรอบโอน TikTok ตอบ code 0 พร้อมค่า 0 ล้วน (ไม่ใช่ error)
    //    เกณฑ์เดียวกับ route ของ cron — ห้ามบันทึกเป็นแถว ฿0
    if (!normalized.lines.length && !normalized.netPayout) return 'pending';

    return normalized;
  },
};
