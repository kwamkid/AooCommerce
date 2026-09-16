// Path: lib/insert-at-cursor.ts
//
// แทรกข้อความตรงตำแหน่งเคอร์เซอร์ของช่องพิมพ์ — ใช้ทุกที่ที่มีปุ่ม "แทรก…"
// (ชิปตัวแปร · ลิงก์หน้าร้าน · ข้อความสำเร็จรูป)
//
// ทำไมไม่ต่อท้ายเฉย ๆ: คนเขียนอยู่กลางประโยคแล้วกดแทรก ของจะไปโผล่ท้ายข้อความ
// ต้องมาลากย้ายเอง · ท่านี้เคยเขียนซ้ำอยู่ 2 ที่ (VarChips + SavedReplyModal) ยุบมาไว้ที่นี่

/**
 * คืน **ค่าใหม่ของช่อง** ให้ผู้เรียกเอาไป setState เอง แล้วคืนเคอร์เซอร์ไปท้ายของที่แทรกให้
 * (รอ `requestAnimationFrame` เพราะต้องให้ React วาดค่าใหม่ลงช่องก่อน ไม่งั้น setSelectionRange
 * ไปตกบนข้อความเก่าแล้วเคอร์เซอร์เด้งผิดที่)
 *
 * ไม่มี element (ยังไม่ mount) = ต่อท้ายให้แทน ดีกว่าแทรกไม่ได้เลย
 */
export function insertAtCursor(
  el: HTMLTextAreaElement | HTMLInputElement | null,
  value: string,
  text: string,
): string {
  if (!el) return value + text;
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  const caret = start + text.length;
  requestAnimationFrame(() => {
    el.focus();
    el.setSelectionRange(caret, caret);
  });
  return value.slice(0, start) + text + value.slice(end);
}
