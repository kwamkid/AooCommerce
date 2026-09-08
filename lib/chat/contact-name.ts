// Path: lib/chat/contact-name.ts
//
// "จะเรียกคนในห้องแชทนี้ว่าอะไร" — **กติกาเดียวของทั้งระบบ**
// ใช้ตอนแทน {{ชื่อลูกค้า}} ในข้อความสำเร็จรูป และที่อื่นที่ต้องทักด้วยชื่อในอนาคต
//
// ลำดับ (เจ้าของเลือกไว้ 8 ก.ย. 2026) — ไล่จาก "ชื่อที่ร้านตั้งใจตั้งเอง" ไปหา "ชื่อที่พอมี":
//   1. nickname       ชื่อเล่นที่ร้านตั้งให้ห้องนี้ — คนเดียวที่ตั้งใจพิมพ์ไว้เพื่อเรียก
//   2. contact_person ชื่อผู้ติดต่อของลูกค้า — เป็น "ชื่อคน" เสมอ แม้ลูกค้าเป็นบริษัท
//   3. customer.name  ชื่อลูกค้า — ปลีกคือชื่อคน (ช่องนี้เลยขาดไม่ได้ ไม่งั้นลูกค้าปลีก
//                     ที่ผูกแล้วจะถูกเรียกด้วยชื่อ LINE ทั้งที่ร้านพิมพ์ชื่อจริงไว้แล้ว)
//   4. display_name   ชื่อบนแพลตฟอร์ม — ทางถอยสุดท้าย ลูกค้าเปลี่ยนเองได้ตลอด
//                     และมักเป็นอีโมจิ/จุด/เลข ("🌸น้องเมย์🌸") จึงอยู่ท้ายสุด
//
// ⚠️ ห้ามคืนค่าว่าง — ผู้เรียกคาดว่าได้ชื่ออะไรสักอย่างหรือ null ไปเลย ไม่ใช่ " "

/** รับเฉพาะรูปร่างที่ต้องใช้ ไม่ผูกกับ type ของหน้าแชท (เรียกจาก server ได้ด้วย) */
export interface ContactNameSource {
  nickname?: string | null;
  display_name?: string | null;
  customer?: { name?: string | null; contact_person?: string | null } | null;
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v || '').trim();
  return t || null;
};

/** ชื่อที่ใช้ทักคนในห้องนี้ — null เมื่อไม่มีชื่อสักช่อง (ผู้เรียกตัดสินใจเองว่าจะทำยังไงต่อ) */
export function resolveContactName(contact: ContactNameSource | null | undefined): string | null {
  if (!contact) return null;
  return clean(contact.nickname)
    || clean(contact.customer?.contact_person)
    || clean(contact.customer?.name)
    || clean(contact.display_name);
}
