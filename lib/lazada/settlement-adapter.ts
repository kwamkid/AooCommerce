// Lazada — ตัวดึงยอดเงินรายออเดอร์ (ทำตาม SettlementAdapter · server-only)
//
// Lazada ไม่มียอดสรุปต่อออเดอร์ มีแต่ ledger รายบรรทัดตามช่วงวันที่ — ใบเดียวจึงต้อง
// ดึง ledger ของช่วงรอบ ๆ วันที่สั่งแล้วกรองเอาเฉพาะ `order_no` นั้น
// (ส่ง `trade_order_id` ให้ Lazada กรองให้ก่อนด้วย แล้วยังกรองซ้ำฝั่งเราเพื่อความชัวร์)
// การประกอบเป็นออเดอร์ใช้ `normalizeLazadaTransactions()` ตัวเดียวกับ cron รายวัน
//
// ⏱ ช่วงเวลา: ย้อนหลัง 7 วันก่อนวันสั่ง ถึง 45 วันหลังวันสั่ง (ไม่เกินวันนี้)
//    **ข้างหน้าต้องกว้าง** เพราะ Lazada ลงบัญชีหลังของถึงมือลูกค้า ซึ่งห่างจากวันสั่ง
//    ได้เป็นสัปดาห์ — หน้าต่างแคบ ๆ จะได้ "ยังไม่ถึงรอบโอน" ตลอดกาลทั้งที่เงินเข้าแล้ว
//    (Lazada จำกัดช่วงละ 180 วัน — 52 วันยังห่างเพดานมาก)

import { ensureValidToken, getFinanceTransactions, type LazadaAccountRow } from '@/lib/lazada/api';
import { normalizeLazadaTransactions, type LazadaTransactionRow } from '@/lib/lazada/settlement';
import type { SettlementAdapter } from '@/lib/marketplace/settlement-adapter';

const DAY_MS = 86_400_000;
const WINDOW_BEFORE_DAYS = 7;
const WINDOW_AFTER_DAYS = 45;
const PAGE_LIMIT = 500;
const MAX_ROWS = 2_000;

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

export const lazadaSettlementAdapter: SettlementAdapter = {
  async fetchOrderSettlement(account, order) {
    const orderNo = order.external_order_sn ? String(order.external_order_sn).trim() : '';
    if (!orderNo) return null;

    const createdAt = order.created_at ? new Date(order.created_at) : new Date();
    const base = Number.isFinite(createdAt.getTime()) ? createdAt : new Date();
    const start = new Date(base.getTime() - WINDOW_BEFORE_DAYS * DAY_MS);
    const endCandidate = new Date(base.getTime() + WINDOW_AFTER_DAYS * DAY_MS);
    const end = endCandidate.getTime() > Date.now() ? new Date() : endCandidate;

    const creds = await ensureValidToken(account as unknown as LazadaAccountRow, 'main');

    const rows: LazadaTransactionRow[] = [];
    for (let offset = 0; offset < MAX_ROWS; offset += PAGE_LIMIT) {
      const { rows: page, error } = await getFinanceTransactions(creds, {
        startDate: fmtDate(start),
        endDate: fmtDate(end),
        limit: PAGE_LIMIT,
        offset,
        orderNo,
      });
      if (error) throw new Error(error);
      rows.push(...(page as LazadaTransactionRow[]));
      if (page.length < PAGE_LIMIT) break;
    }

    // กรองซ้ำฝั่งเรา — ถ้า Lazada ไม่สนใจ trade_order_id (เคยเจอบาง endpoint คืนทั้งช่วง)
    // จะได้ไม่เอายอดของออเดอร์อื่นมาใส่ใบนี้
    const mine = rows.filter(r => (r.order_no ? String(r.order_no).trim() : '') === orderNo);
    if (!mine.length) return 'pending';

    const { orders } = normalizeLazadaTransactions(mine);
    const group = orders.find(g => g.orderNo === orderNo);
    if (!group) return 'pending';

    return group.normalized;
  },
};
