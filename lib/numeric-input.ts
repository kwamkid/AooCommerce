// Path: lib/numeric-input.ts
// ช่องกรอกตัวเลขทั้งระบบใช้ `type="text"` + `inputMode="decimal"` **ไม่ใช่ `type="number"`**
//
// เหตุผล: `type="number"` ให้เบราว์เซอร์ปรับค่าเองทีละ `step` เมื่อเลื่อนล้อเมาส์/สองนิ้ว
// บนแทร็กแพดขณะช่องยัง focus อยู่ (และตอนกดลูกศรขึ้น-ลง) — ไม่มีใครกรอกราคาด้วยท่านั้น
// แต่มันทำให้ตัวเลขเพี้ยนแบบ "เกือบถูก" เงียบ ๆ: ค่าส่ง 100 กลายเป็น 99.96 (step 0.01 ×
// 4 จังหวะ) ทั้งบิลจริง ORD-202609-0017 เมื่อ 7 ก.ย. 2026 และลูกค้าจ่ายตามยอดผิดนั้นไปแล้ว
//
// `inputMode="decimal"` มือถือยังได้แป้นตัวเลข · CSS ฟอร์มทั้งเว็บครอบ `input[type="text"]`
// อยู่แล้ว (globals.css) หน้าตาจึงไม่เปลี่ยน · ตัวกรองด้านล่างทำหน้าที่แทนการบล็อกอักขระ
// ที่ `type="number"` เคยทำให้

/** props ที่ต้องใส่แทน `type="number"` — ใช้กับ `<input>` ดิบทุกตัวที่รับตัวเลข */
export const NUMERIC_TEXT_INPUT_PROPS = { type: 'text' as const, inputMode: 'decimal' as const };

/**
 * กรองสิ่งที่ผู้ใช้พิมพ์/วางลงช่องตัวเลข
 * - คืน string ที่ยอมรับได้ (ตัดคอมมา/ช่องว่างให้ — "1,290" ที่ `type="number"` เคยปฏิเสธทั้งก้อน)
 * - คืน `null` เมื่อมีอักขระที่ไม่ใช่ตัวเลข = **ไม่ต้องอัปเดต state** (ปฏิเสธการพิมพ์ตัวนั้น)
 *
 * ยอมให้ค่าระหว่างพิมพ์ที่ยังไม่สมบูรณ์: `""` (ลบจนว่าง) · `"-"` · `"12."`
 */
export function sanitizeNumericInput(
  raw: string,
  opts: { allowNegative?: boolean } = {},
): string | null {
  const next = raw.replace(/[,\s]/g, '');
  const allowed = opts.allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
  return allowed.test(next) ? next : null;
}

/** ค่าติดลบยอมรับได้ไหม — ดูจาก `min` ที่ call site ส่งมา (ไม่ระบุ = ยอม) */
export function allowsNegative(min: number | string | undefined): boolean {
  if (min === undefined || min === '') return true;
  const n = Number(min);
  return isNaN(n) || n < 0;
}

/**
 * ห่อ handler ของช่องตัวเลขดิบ (`<input>` ที่ไม่ได้ใช้ `NumberInput`/`FormInput`)
 * — กรองอักขระก่อนส่งค่าต่อ ค่าที่ไม่ใช่ตัวเลขจะไม่ถูกส่งเลย
 *
 * @example
 *   <input {...NUMERIC_TEXT_INPUT_PROPS} value={weight}
 *          onChange={onNumericChange(setWeight)} />
 */
export function onNumericChange(
  handler: (value: string) => void,
  opts: { allowNegative?: boolean } = {},
) {
  return (e: { target: { value: string } }) => {
    const next = sanitizeNumericInput(e.target.value, opts);
    if (next !== null) handler(next);
  };
}

/**
 * เวอร์ชันสำหรับช่องที่เป็น uncontrolled (`defaultValue` + ref — ไม่มี state ให้ห่อ)
 * — กรองค่าที่ DOM โดยตรงตอนผู้ใช้พิมพ์
 */
export function onNumericInput(opts: { allowNegative?: boolean } = {}) {
  return (e: { currentTarget: HTMLInputElement }) => {
    const el = e.currentTarget;
    const next = sanitizeNumericInput(el.value, opts);
    el.value = next ?? el.value.replace(opts.allowNegative ? /[^\d.-]/g : /[^\d.]/g, '');
  };
}

// ─────────────────────────── เบอร์โทร ───────────────────────────
//
// ช่องเบอร์โทรทั่วระบบเคยเป็น <input> ดิบต่างคนต่างเขียน (~30 จุด 19 ไฟล์) ไม่มีตัวไหนกรอง
// อักขระเลย พิมพ์ "จฟหกด" ลงช่องเบอร์ได้ (เจ้าของทัก 9 ก.ย. 2026) — ยุบมาที่นี่ที่เดียว
// ตามแบบเดียวกับตัวเลขข้างบน: props ชุดเดียว + ตัวกรอง + ตัวห่อ handler
//
// ยอมรับ: ตัวเลข · ขีด · เว้นวรรค · + (เบอร์ต่างประเทศ) · วงเล็บ (รหัสพื้นที่)
// เพราะคนวางเบอร์จากที่อื่นมาทั้ง "081-555-4544" "+66 81 555 4544" "(02) 123 4567"
// — validation ว่าเป็นเบอร์ที่ใช้ได้จริงไหมอยู่ที่ฟอร์มปลายทาง ตรงนี้กันแค่อักขระที่ไม่มีทางถูก

/** props ที่ต้องใส่ให้ช่องเบอร์โทร — `tel` ให้มือถือขึ้นแป้นตัวเลข */
export const PHONE_INPUT_PROPS = { type: 'text' as const, inputMode: 'tel' as const, autoComplete: 'tel' as const };

/**
 * กรองสิ่งที่ผู้ใช้พิมพ์/วางลงช่องเบอร์โทร
 * - คืน string เดิมเมื่อทุกตัวอักษรใช้ได้
 * - คืน `null` เมื่อมีอักขระที่ไม่ใช่เบอร์ = **ไม่ต้องอัปเดต state** (ปฏิเสธการพิมพ์ตัวนั้น)
 */
export function sanitizePhoneInput(raw: string): string | null {
  return /^[\d\s\-+()]*$/.test(raw) ? raw : null;
}

/**
 * ห่อ handler ของช่องเบอร์โทรดิบ — อักขระที่ไม่ใช่เบอร์จะไม่ถูกส่งต่อเลย
 *
 * @example
 *   <input {...PHONE_INPUT_PROPS} value={phone} onChange={onPhoneChange(setPhone)} />
 */
export function onPhoneChange(handler: (value: string) => void) {
  return (e: { target: { value: string } }) => {
    const next = sanitizePhoneInput(e.target.value);
    if (next !== null) handler(next);
  };
}
