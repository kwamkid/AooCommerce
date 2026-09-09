'use client';

import { forwardRef, useState } from 'react';
import { NUMERIC_TEXT_INPUT_PROPS, allowsNegative, sanitizeNumericInput } from '@/lib/numeric-input';

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

/**
 * ช่องกรอกตัวเลขของทั้งระบบ — สร้างบน `type="text"` + `inputMode="decimal"`
 * **ไม่ใช่ `type="number"` โดยตั้งใจ**:
 *
 *  • `type="number"` ให้เบราว์เซอร์ปรับค่าเองทีละ `step` เมื่อเลื่อนล้อเมาส์/สองนิ้ว
 *    บนแทร็กแพดขณะช่องยัง focus อยู่ (และตอนกดลูกศรขึ้น-ลง) — ไม่มีใครกรอกราคาด้วยท่านั้น
 *    แต่มันทำให้ตัวเลขเพี้ยนแบบ "เกือบถูก" โดยไม่มีอะไรเตือน: ค่าส่ง 100 กลายเป็น 99.96
 *    (step 0.01 × 4 จังหวะ) ทั้งบิลจริง ORD-202609-0017 เมื่อ 7 ก.ย. 2026 และลูกค้า
 *    จ่ายตามยอดผิดนั้นผ่าน Beam ไปแล้ว → ตัดความสามารถนี้ทิ้งที่ต้นเหตุ
 *  • `inputMode="decimal"` มือถือยังได้แป้นตัวเลขเหมือนเดิม
 *  • CSS ฟอร์มทั้งเว็บ (สูง 42px · dark mode · กัน iOS zoom) ครอบ `input[type="text"]`
 *    อยู่แล้วใน globals.css → หน้าตาไม่เปลี่ยน
 *
 * การพิมพ์: เก็บเป็นสตริงระหว่าง focus ผู้ใช้จึงลบจนว่างได้ (raw `type="number"` +
 * `parseFloat(...) || 0` จะยัด "0" กลับทันทีที่ลบตัวสุดท้าย) · อักขระที่ไม่ใช่ตัวเลข
 * ถูกปฏิเสธตั้งแต่พิมพ์ · คอมมาจากการวางค่าถูกตัดให้ ("1,290" → 1290 ซึ่ง `type="number"`
 * เดิมปฏิเสธทั้งก้อน) · ตอน blur ค่าว่าง/ไม่ใช่ตัวเลข = 0 แล้ว clamp เข้ากรอบ `min`/`max`
 */
/** หน้าตาเริ่มต้น — ชุดเดียวกับ input ของ FormInput (ขอบ · โฟกัส · dark) */
const DEFAULT_CLASS = 'w-full px-3 bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg border border-gray-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors';

const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  // `step` ไม่ถูกส่งต่อลง DOM แล้ว (มันคือขนาดก้าวของ spinner ที่เราตัดทิ้งไปทั้งอัน)
  // แต่ยังรับไว้จาก props เพื่อไม่ต้องไล่แก้ call site เดิมทั้งหมด
  { value, onChange, onFocus, onBlur, min, max, className, ...rest },
  ref,
) {
  const [display, setDisplay] = useState<string>(() => String(value));
  // เป็น state ไม่ใช่ ref เพราะต้องอ่านระหว่าง render (ข้างล่าง) — กฎ react-hooks/refs ห้ามอ่าน ref ตอน render
  const [focused, setFocused] = useState(false);

  // Sync from external value, but only when NOT focused — don't overwrite
  // the user's in-progress typing (e.g. empty string while deleting 0).
  // ปรับ state ตาม prop ระหว่าง render (แบบที่ React แนะนำ) แทน useEffect —
  // กฎ react-hooks/set-state-in-effect ของโปรเจกต์ห้าม setState ใน effect
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (!focused) setDisplay(String(value));
  }

  const minNum = min === undefined || min === '' ? undefined : Number(min);
  const maxNum = max === undefined || max === '' ? undefined : Number(max);
  const allowNegative = allowsNegative(min as number | string | undefined);

  const clamp = (n: number) => {
    let out = n;
    if (minNum !== undefined && !isNaN(minNum) && out < minNum) out = minNum;
    if (maxNum !== undefined && !isNaN(maxNum) && out > maxNum) out = maxNum;
    return out;
  };

  return (
    <input
      {...rest}
      // ไม่ส่ง className มา = หน้าตาเดียวกับช่อง FormInput (เดิมไม่มีขอบเลย กล่องกลืนกับพื้นหลัง)
      // ส่งมา = ใช้ของผู้เรียกทั้งก้อน (ช่องในตาราง/แถวสินค้าแต่งเองอยู่แล้ว)
      className={className ?? DEFAULT_CLASS}
      step={undefined}
      ref={ref}
      {...NUMERIC_TEXT_INPUT_PROPS}
      value={display}
      onChange={(e) => {
        const next = sanitizeNumericInput(e.target.value, { allowNegative });
        if (next === null) return;   // อักขระที่ไม่ใช่ตัวเลข = ปฏิเสธการพิมพ์
        setDisplay(next);
        // Emit a number to the parent — empty / NaN treated as 0 so downstream
        // validators (`value <= 0`) still trigger when expected.
        const n = parseFloat(next);
        onChange(isNaN(n) ? 0 : n);
      }}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        const parsed = parseFloat(display);
        const settled = clamp(isNaN(parsed) ? 0 : parsed);
        if (String(settled) !== display) setDisplay(String(settled));
        if (settled !== value) onChange(settled);
        onBlur?.(e);
      }}
    />
  );
});

export default NumberInput;
