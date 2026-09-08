// Path: lib/chat/line-sticker.ts
// ที่อยู่รูปสติกเกอร์/อีโมจิของ LINE — **ต้องวิ่งผ่าน origin ของเราเสมอ**
//
// ⚠️ ห้ามกลับไปใส่ `https://stickershop.line-scdn.net/...` ใน `<img src>` ตรง ๆ อีก
// เหตุผล: มันเป็นโฮสต์ภายนอกที่ "เครื่องของผู้ใช้" ต้องเข้าถึงเอง — เครื่องไหนที่ DNS
// ของ ISP บล็อก · มีตัวบล็อกโฆษณา (บางบัญชีดำมี line-scdn.net) · อยู่หลังไฟร์วอลล์ที่ทำงาน
// จะเห็นสติกเกอร์เป็นรูปแตกทั้งหน้า **ทั้งที่โค้ดเหมือนกันทุกคนและ CDN ตอบ 200 ปกติ**
// (เจ้าของเปิดได้ แอดมินเปิดไม่ได้ — 9 ก.ย. 2026) · ผ่านเซิร์ฟเวอร์เราแล้วแคชที่ edge
// จบทุกกรณีและได้แคชร่วมกันทั้งร้านด้วย

/** สติกเกอร์ (ฟองแชท + ตัวเลือกสติกเกอร์) */
export function lineStickerUrl(stickerId: string | number): string {
  return `/api/chat/line-sticker?id=${encodeURIComponent(String(stickerId))}`;
}

/** อีโมจิของ LINE (sticon) ที่แทรกอยู่ในข้อความ */
export function lineSticonUrl(productId: string, emojiId: string): string {
  return `/api/chat/line-sticker?product=${encodeURIComponent(productId)}&emoji=${encodeURIComponent(emojiId)}`;
}
