// ─────────────────────────────────────────────────────────────────────────────
// ออกเอกสารอัตโนมัติของออเดอร์ — ทางเข้าเดียวของทุก route
//
// **ทำไมต้องมีไฟล์นี้** (ไม่ใช่เรียก `autoIssueDocument` ตรง ๆ):
// ทั้ง 11 จุดที่เคยเรียกเขียนเหมือนกันหมดว่า
//     autoIssueDocument(id, companyId).catch(() => {});
// คือ **ปล่อย promise ลอย ไม่ await ไม่อยู่ใน after()** บน Vercel พอ response ถูกส่ง
// ออกไป function ถูก freeze ทันที งานที่ยังไม่เสร็จตายกลางคัน — เอกสารภาษีไม่ออก
// และ `.catch(() => {})` กลืน error ทิ้ง จึงไม่มีแม้แต่ log ให้รู้ว่าพลาด
// (กับดักเดียวกับที่ทำให้ Shopee stock push ตายเงียบ พ.ค.–ส.ค. 2026)
//
// ที่นี่จึง **await ให้เสร็จจริง** ก่อนตอบกลับ — งานคือ query ไม่กี่ตัวกับ insert
// ช้ากว่าเดิมหลักสิบมิลลิวินาที แลกกับเอกสารที่ไม่หาย และผู้ใช้เห็นเอกสารทันทีที่รีเฟรช
//
// พังทีละใบได้ ไม่ล้มทั้งชุด และทุกใบที่พังต้องมี log พร้อม order id เสมอ
// ─────────────────────────────────────────────────────────────────────────────
import { parallelLimit } from '@/lib/parallel';

/**
 * ออกเอกสารตาม flow ของออเดอร์ (ABB/REC · TAX · DN · ST) ให้ครบทุกใบที่ส่งมา
 *
 * ตัวตัดสินว่าใบไหนได้เอกสารอะไรอยู่ที่ `autoIssueDocument` ใน `lib/invoice-service.ts`
 * — อ่าน flow_type · order_status · payment_status · companies.vat_registered
 * และกันออกซ้ำเองอยู่แล้ว เรียกซ้ำจึงปลอดภัย
 *
 * @param orderIds ใบไหนก็ได้ (ซ้ำ/ว่าง/null ได้ เดี๋ยวกรองให้)
 */
export async function issueOrderDocuments(
  orderIds: (string | null | undefined)[],
  companyId: string,
): Promise<void> {
  const ids = [...new Set(orderIds.filter(Boolean))] as string[];
  if (ids.length === 0) return;

  const { autoIssueDocument } = await import('@/lib/invoice-service');

  await parallelLimit(ids, async (orderId) => {
    try {
      await autoIssueDocument(orderId, companyId);
    } catch (err) {
      // ห้ามเงียบ — ใบที่ออกไม่ได้ต้องตามหาได้จาก log
      console.error(`[issueOrderDocuments] ออกเอกสารของออเดอร์ ${orderId} ไม่สำเร็จ:`, err);
    }
  }, 5);
}
