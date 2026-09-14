'use client';

// เรียกงานสต็อกของร้าน marketplace จากฝั่งจอ — ที่เดียวที่รู้วิธีคุยกับ 2 route นี้
//
// มีผู้เรียก 3 ที่: แท็บ "ซิงค์สินค้า & สต็อก" · โมดัลต้อนรับหลังเชื่อมร้าน ·
// การ์ดร้านตอนย้ายคลัง — เดิมลูป cursor เขียนอยู่ในการ์ดที่เดียว พอมีที่เรียกเพิ่ม
// ถ้า copy ไปจะกลายเป็นสามลูปที่แก้ไม่พร้อมกัน (ร้านใหญ่ยิงไม่จบใน request เดียว
// route จึงคืน next_cursor มาให้ทำต่อ — พลาดตรงนี้ = ส่งไม่ครบร้านโดยไม่มีใครรู้)

import { apiFetch } from '@/lib/api-client';

export interface StockActionResult {
  ok: boolean;
  message: string;
}

/** ดึงยอดจากร้านลงคลังของร้านนี้ — เติมเฉพาะช่องที่ยอดในระบบยังเป็น 0 */
export async function pullStockRequest(accountId: string): Promise<StockActionResult> {
  try {
    const res = await apiFetch('/api/marketplace/products/pull-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marketplace_account_id: accountId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      return { ok: false, message: data.error || data.errors?.[0] || 'ดึงสต็อกไม่สำเร็จ' };
    }
    return {
      ok: true,
      message: `ดึงสต็อกสำเร็จ — เติมให้ ${data.filled} รายการ (ข้าม ${data.skipped_nonzero} รายการที่มียอดอยู่แล้ว)`,
    };
  } catch {
    return { ok: false, message: 'ดึงสต็อกไม่สำเร็จ' };
  }
}

/**
 * ส่งยอดในระบบขึ้นร้าน **ทั้งร้าน** — route ทำได้ไม่จบใน request เดียวจึงคืน
 * `next_cursor` มา วนต่อให้จนครบ (เพดาน 20 รอบ กันวนไม่รู้จบถ้าฝั่ง route เพี้ยน)
 * `onProgress` ใช้รายงานระหว่างทาง (toast / แถบ overlay)
 */
export async function pushStockAllRequest(
  accountId: string,
  onProgress?: (message: string) => void
): Promise<StockActionResult & { pushed: number }> {
  let cursor: number | undefined;
  let pushed = 0;
  try {
    for (let round = 0; round < 20; round++) {
      const res = await apiFetch('/api/marketplace/products/push-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketplace_account_id: accountId, cursor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, pushed, message: data.error || 'ส่งสต็อกขึ้นร้านไม่สำเร็จ' };
      }
      pushed += data.updated_models || 0;
      if (!data.partial) {
        return data.success
          ? { ok: true, pushed, message: `ส่งยอดขึ้นร้านครบแล้ว (${pushed} รายการ)` }
          : { ok: false, pushed, message: data.errors?.[0] || 'ส่งยอดขึ้นร้านไม่ครบ' };
      }
      cursor = data.next_cursor;
      onProgress?.(data.message || `กำลังส่ง... (${data.done}/${data.total})`);
    }
    return { ok: false, pushed, message: 'ส่งยอดขึ้นร้านไม่ครบ — กดส่งซ้ำเพื่อทำต่อจากที่ค้าง' };
  } catch {
    return { ok: false, pushed, message: 'ส่งสต็อกขึ้นร้านไม่สำเร็จ' };
  }
}
