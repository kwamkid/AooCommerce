// ลิงก์บิลออนไลน์ — **ทางเดียวที่หน้าจอควรใช้**
//
// ⛔ ห้ามประกอบเอง (`/bills/${order.id}`) — ลิงก์ต้องใช้ `orders.share_token`
//    ไม่ใช่ id เพราะ id เดา/ไล่ได้แล้วเห็นบิลของลูกค้าคนอื่น
//
// token อยู่ฝั่ง server (หน้ารายการออเดอร์ไม่ได้โหลดมาด้วย) จึงต้องถามตอนกดปุ่ม
// — ผู้ใช้กดแล้วได้ลิงก์ทันที ไม่ต้องแบกฟิลด์นี้ไปทุกหน้า

import { apiFetch } from '@/lib/api-client';

/**
 * ลิงก์เต็มของบิลออนไลน์ (พร้อมโดเมน)
 * ถามไม่ได้ (เน็ตสะดุด / ไม่มีสิทธิ์) → คืน null ให้ผู้เรียกบอกผู้ใช้เอง
 */
export async function getBillLink(orderId: string): Promise<string | null> {
  try {
    const res = await apiFetch(`/api/bills/link?order_id=${encodeURIComponent(orderId)}`);
    const data = await res.json();
    if (!res.ok || !data.path) return null;
    return `${window.location.origin}${data.path}`;
  } catch {
    return null;
  }
}
