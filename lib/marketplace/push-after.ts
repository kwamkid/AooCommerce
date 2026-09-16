// ─────────────────────────────────────────────────────────────────────────────
// กระจายยอดขึ้นร้าน "หลังตอบผู้ใช้แล้ว"
//
// ทำไมต้องมีไฟล์นี้: ยอดในคลังเปลี่ยนได้จากสิบกว่าเส้นทาง (ออเดอร์ · POS · ใบลดหนี้ ·
// รับของเข้า · เบิกออก · ย้ายคลัง · ส่งของไปห้าง/ตัวแทน · รายงานขายฝาก) แต่ marketplace
// ไม่มีทางรู้เองว่ายอดเปลี่ยน — ถ้าเส้นไหนลืมกระจาย ร้านจะค้างยอดเก่าไปเรื่อย ๆ จนกว่าจะ
// มี movement อื่นของตัวเลือกนั้นมาแก้ให้บังเอิญ ผลคือ **ขายเกิน** (ร้านโชว์มากกว่าจริง)
// หรือ **ขายไม่ได้ทั้งที่มีของ** (ร้านโชว์น้อยกว่าจริง) — เจอมาแล้วทั้งสองแบบ
//
// ทำไมต้อง `after()`: งานเบื้องหลังที่ปล่อยลอยใน route handler โดน Vercel freeze ทิ้ง
// งานตาย + log ตายพร้อมกัน (ดู memory/after-in-route-handlers.md)
//
// ทำไมไม่ยัดเข้า stock-service: stock-service ถูกเรียกในลูปรายตัวเลือก กระจายทีละตัว =
// ยิงร้านซ้ำ ๆ เปลืองโควตา — ผู้เรียกต้องสะสม variation ให้ครบรอบก่อนแล้วค่อยเรียกตัวนี้ครั้งเดียว
// ─────────────────────────────────────────────────────────────────────────────
import { after } from 'next/server';

/**
 * สั่งกระจายยอดของ `variationIds` ขึ้นทุกร้านที่ผูกไว้ หลัง response ถูกส่งออกไปแล้ว
 *
 * @param variationIds ตัวเลือกที่ยอดเปลี่ยนจริงในรอบนี้ (ซ้ำ/ว่างได้ เดี๋ยวกรองให้)
 * @param warehouseIds คลังที่ถูกแตะ — ใช้กรองว่าร้านไหนต้องรู้ · ไม่ส่ง = ให้ตัดสินจากทุกคลัง
 */
export function pushStockAfter(
  variationIds: (string | null | undefined)[],
  warehouseIds?: (string | null | undefined)[],
): void {
  const ids = [...new Set(variationIds.filter(Boolean))] as string[];
  if (ids.length === 0) return;
  const whs = [...new Set((warehouseIds || []).filter(Boolean))] as string[];

  after(() =>
    import('@/lib/marketplace/stock-push')
      .then(m => m.syncStockNow(ids, whs.length > 0 ? whs : undefined))
      .catch(e => console.error('[pushStockAfter] กระจายยอดขึ้นร้านไม่สำเร็จ:', e))
  );
}
