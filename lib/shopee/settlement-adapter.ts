// Shopee — ตัวดึงยอดเงินรายออเดอร์ (ทำตาม SettlementAdapter · server-only)
//
// Shopee มียอดสรุปต่อออเดอร์ให้เลย (`get_escrow_detail`) จึงถามทีละใบตรง ๆ ได้
// การแปลงใช้ `normalizeShopeeEscrow()` ตัวเดียวกับที่ order sync และ cron รายวันใช้

import { ensureValidToken, getEscrowDetail, type ShopeeAccountRow } from '@/lib/shopee/api';
import { normalizeShopeeEscrow } from '@/lib/shopee/settlement';
import type { SettlementAdapter } from '@/lib/marketplace/settlement-adapter';

export const shopeeSettlementAdapter: SettlementAdapter = {
  async fetchOrderSettlement(account, order) {
    if (!order.external_order_sn) return null;

    const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);
    const { data, error } = await getEscrowDetail(creds, order.external_order_sn);
    if (error) throw new Error(error);

    const escrow = data as Record<string, unknown> | null;
    if (!escrow) return null;

    const normalized = normalizeShopeeEscrow(escrow, { orderSn: order.external_order_sn });

    // ออเดอร์ที่ยังไม่ถึงรอบโอน Shopee ตอบ escrow เปล่า (ทุกช่องเป็น 0) ไม่ใช่ error
    // เก็บลงเป็นแถว ฿0 = รายงานอ่านว่า "ขายแล้วไม่ได้เงินเลย" — ไม่มีแถวซื่อสัตย์กว่า
    if (!normalized.lines.length && !normalized.netPayout) return 'pending';

    return normalized;
  },
};
