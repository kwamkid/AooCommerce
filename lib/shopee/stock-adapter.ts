// Shopee — ตัวต่อสต็อก (ยิง API เท่านั้น · ตรรกะร่วมอยู่ lib/marketplace/stock-push.ts)

import {
  ensureValidToken,
  getItemFullDetails,
  updateStock,
  ShopeeAccountRow,
} from '@/lib/shopee/api';
import type {
  PlatformStockRead,
  PushStockResult,
  StockAdapter,
  StockLink,
  StockSyncAccount,
} from '@/lib/marketplace/stock-adapter';

const asShopeeAccount = (account: StockSyncAccount) => account as unknown as ShopeeAccountRow;

export const shopeeStockAdapter: StockAdapter = {
  pushApiPath: '/api/v2/product/update_stock',
  pullApiPath: '/api/v2/product/get_model_list',

  async pushStock(account, productId, quantities, links): Promise<PushStockResult> {
    const errors: string[] = [];
    const pushedLinkIds: string[] = [];
    let updatedModels = 0;

    const creds = await ensureValidToken(asShopeeAccount(account));

    // Shopee ยิงทีละ item (1 ประกาศ = หลาย model)
    const itemGroups = new Map<string, StockLink[]>();
    for (const link of links) {
      const group = itemGroups.get(link.external_item_id) || [];
      group.push(link);
      itemGroups.set(link.external_item_id, group);
    }

    for (const [externalItemId, groupLinks] of itemGroups) {
      const stockList = groupLinks.map(link => ({
        model_id: parseInt(link.external_model_id) || 0,
        seller_stock: [{ stock: link.variation_id ? (quantities.get(link.variation_id) ?? 0) : 0 }],
      }));
      if (stockList.length === 0) continue;

      const { data: stockResult, error } = await updateStock(creds, parseInt(externalItemId), stockList);
      if (error) {
        errors.push(`Item ${externalItemId}: ${error}`);
        console.warn(`[Shopee Stock] update_stock FAIL item=${externalItemId}:`, {
          error,
          stockList: stockList.map(s => ({ model_id: s.model_id, stock: s.seller_stock[0]?.stock })),
        });
        continue;
      }

      // Shopee ตอบสนามนี้ว่า `failed_reason` (เคยอ่านผิดเป็น fail_message → ขึ้น "undefined"
      // เวลาพัง = อ่านไม่ออกว่าเกิดอะไร) · เผื่อ fail_message ไว้ด้วยกันสองชื่อในอนาคต
      const resp = stockResult as { failure_list?: { model_id: number; failed_reason?: string; fail_message?: string }[] } | null;
      if (resp?.failure_list && resp.failure_list.length > 0) {
        const failMsgs = resp.failure_list.map(f => `model_id=${f.model_id}: ${f.failed_reason || f.fail_message || 'ไม่ทราบสาเหตุ'}`);
        errors.push(`Item ${externalItemId} partial fail: ${failMsgs.join('; ')}`);
        console.warn(`[Shopee Stock] update_stock PARTIAL FAIL item=${externalItemId}:`, failMsgs);
      }
      updatedModels += stockList.length;
      pushedLinkIds.push(...groupLinks.map(l => l.id));
    }

    return {
      success: errors.length === 0,
      updated_models: updatedModels,
      errors,
      pushed_link_ids: pushedLinkIds,
    };
  },

  async fetchPlatformStock(account, links): Promise<PlatformStockRead> {
    const errors: string[] = [];
    const stock = new Map<string, number>();
    const creds = await ensureValidToken(asShopeeAccount(account));

    const linkMap = new Map<string, string>(); // `${item}:${model}` → variation_id
    for (const l of links) {
      if (l.variation_id) linkMap.set(`${l.external_item_id}:${l.external_model_id}`, l.variation_id);
    }

    // **เดินจาก link ที่เราผูกไว้ ไม่ใช่จากรายการสินค้าของร้าน**
    //
    // เดิมเดินด้วย getItemList(itemStatus:'NORMAL') ซึ่งคืนเฉพาะประกาศที่ยังโชว์ขายอยู่
    // → ประกาศที่ถูก UNLIST / SELLER_DELETE หลุดออกจากการ reconcile ทั้งหมด
    // **UNLIST = คนขายกดซ่อนเอง ไม่ได้แปลว่าของหมด** (พบจริง 2026-08-29: ประกาศที่ปิดขาย
    // แต่ยังมีของเหลือ 50 / 16 / 4 ชิ้น) พอเปิดขายกลับ เลขสองฝั่งจะขัดกันตั้งแต่วินาทีแรก
    const linkedItemIds = [...new Set(links.map(l => Number(l.external_item_id)))].filter(Boolean);
    // นับ call จริง (base_info + model_list) — ชั้นกลางลง `quota_used` ของรอบ ห้ามประมาณ
    const counter = { calls: 0 };
    for (let i = 0; i < linkedItemIds.length; i += 50) {
      const details = await getItemFullDetails(creds, linkedItemIds.slice(i, i + 50), counter);
      for (const [itemId, item] of details) {
        const models = item.models.length > 0 ? item.models : [{ model_id: 0, stock: 0 }];
        for (const m of models) {
          const variationId = linkMap.get(`${itemId}:${m.model_id}`);
          if (variationId) stock.set(variationId, m.stock ?? 0);
        }
      }
    }

    return { stock, errors, apiCalls: counter.calls };
  },
};
