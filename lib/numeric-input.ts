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
// **เก็บเป็นตัวเลขล้วน ไม่มีขีด/เว้นวรรค** (เจ้าของกำหนด 9 ก.ย. 2026) — ทั้งระบบจะได้ format เดียว
// ค้น/เช็คซ้ำ/จับคู่ออเดอร์จากแพลตฟอร์มด้วยเบอร์ได้ตรง ๆ ไม่ต้องคอย strip ทุกที่
// ⇒ พิมพ์หรือวาง "081-555-4544" / "081 555 4544" / "(02) 123 4567" ได้ แต่ช่องจะเก็บแค่ตัวเลข
//    อักขระอื่น (ตัวอักษร เลขไทย +) ถูกปฏิเสธการพิมพ์ทั้งตัว
//    · "+66…" ตั้งใจไม่รับ — ฐานข้อมูลนี้เป็นเบอร์ไทย 0xxxxxxxxx ทั้งหมด ถ้าปล่อยผ่านจะกลายเป็น "66…"
//      ซึ่งดูเหมือนเบอร์แต่ค้นไม่เจอ · validation ว่าเป็นเบอร์ที่ใช้ได้จริงไหมยังอยู่ที่ฟอร์มปลายทาง

/** props ที่ต้องใส่ให้ช่องเบอร์โทร — `tel` ให้มือถือขึ้นแป้นตัวเลข */
export const PHONE_INPUT_PROPS = { type: 'text' as const, inputMode: 'tel' as const, autoComplete: 'tel' as const };

/** ตัวเลขล้วน — ใช้ทั้งตอนพิมพ์และที่ API ก่อนเขียน DB (ข้อมูลจากทางอื่นก็โดน normalize) */
export function normalizePhone(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[\s\-()]/g, '');
}

/**
 * กรองสิ่งที่ผู้ใช้พิมพ์/วางลงช่องเบอร์โทร
 * - ตัดขีด/เว้นวรรค/วงเล็บทิ้งให้ (วาง "081-555-4544" มาได้ ช่องเก็บ "0815554544")
 * - คืน `null` เมื่อเหลืออักขระที่ไม่ใช่ตัวเลข = **ไม่ต้องอัปเดต state** (ปฏิเสธการพิมพ์ตัวนั้น)
 */
export function sanitizePhoneInput(raw: string): string | null {
  const next = normalizePhone(raw);
  return /^\d*$/.test(next) ? next : null;
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

/**
 * คำค้นที่ "ดูเหมือนเบอร์" → ตัดตัวคั่นทิ้งก่อนไปเทียบกับ DB ที่เก็บตัวเลขล้วน
 * ("081-555" ต้องเจอ "0815554544") · คำที่มีตัวอักษรคืนเดิม ไม่ยุ่ง (ค้นชื่อ/อีเมลตามปกติ)
 * ใช้ที่ API ค้นลูกค้าทุกตัว — ห้ามให้แต่ละหน้า strip เอง
 */
export function normalizePhoneQuery(q: string): string {
  const t = q.trim();
  return /^[\d\s\-().+]+$/.test(t) && /\d/.test(t) ? normalizePhone(t) : t;
}

/**
 * รูปแบบมาตรฐานเบอร์ไทยสำหรับ **เก็บ/เทียบ** — ยกมาจาก CustomerForm ที่เคยเขียนไว้เอง
 *   "+66 81 555 4544" / "66815554544" → "0815554544"   (รหัสประเทศ → 0)
 *   "815554544" (9 หลัก ไม่มี 0 นำ)      → "0815554544"   (ลูกค้าที่พิมพ์ตกเลข 0)
 * ⚠️ ไม่ใช้ตอน "พิมพ์" (sanitizePhoneInput) — แปลง 66→0 กลางคันจะทำให้ตัวอักษรเด้งใต้นิ้ว
 *    ใช้ตอนบันทึก/เช็คซ้ำ/จับคู่ออเดอร์เท่านั้น
 */
export function toThaiPhone(raw: string | null | undefined): string {
  let d = normalizePhone(raw).replace(/^\+/, '');
  if (d.startsWith('66') && d.length >= 11) d = '0' + d.slice(2);
  if (d.length === 9 && !d.startsWith('0')) d = '0' + d;
  return d;
}

/** เบอร์ไทยที่ใช้ได้: 9–10 หลัก ขึ้นต้นด้วย 0 (บ้าน 9 · มือถือ 10) — ว่างถือว่าผ่าน ให้ `required` ตัดสินเอง */
export function isValidThaiPhone(raw: string | null | undefined): boolean {
  const d = toThaiPhone(raw);
  if (!d) return true;
  return (d.length === 9 || d.length === 10) && d.startsWith('0');
}
