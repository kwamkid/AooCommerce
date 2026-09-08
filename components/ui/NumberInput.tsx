'use client';

import { forwardRef, useState, useEffect, useRef } from 'react';

interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

/**
 * Numeric input that lets the user fully clear the field while typing.
 *
 * Raw `<input type="number" value={n} onChange={parseFloat(e.target.value) || 0}>`
 * forces "0" back the moment the user deletes the last digit — they can never
 * see an empty field. This component keeps a local string while focused, so
 * the user can clear / retype freely. On blur, an empty or invalid value
 * snaps back to 0 (and `onChange(0)` is emitted).
 */
const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onChange, onFocus, onBlur, onWheel, ...rest },
  ref,
) {
  const [display, setDisplay] = useState<string>(() => String(value));
  const focused = useRef(false);

  // Sync from external value, but only when NOT focused — don't overwrite
  // the user's in-progress typing (e.g. empty string while deleting 0).
  useEffect(() => {
    if (!focused.current) setDisplay(String(value));
  }, [value]);

  return (
    <input
      {...rest}
      ref={ref}
      type="number"
      value={display}
      onChange={(e) => {
        const next = e.target.value;
        setDisplay(next);
        // Emit a number to the parent — empty / NaN treated as 0 so downstream
        // validators (`value <= 0`) still trigger when expected.
        const n = parseFloat(next);
        onChange(isNaN(n) ? 0 : n);
      }}
      onFocus={(e) => {
        focused.current = true;
        onFocus?.(e);
      }}
      // ⚠️ ห้ามให้การเลื่อนหน้าจอเปลี่ยนตัวเลข — `<input type="number">` ที่ยัง focus อยู่
      // จะบวก/ลบค่าทีละ `step` ตามล้อเมาส์/สองนิ้วบนแทร็กแพด ผู้ใช้ที่พิมพ์เสร็จแล้วเลื่อน
      // หน้าจอต่อจึงได้ค่าเพี้ยนโดยไม่รู้ตัว (step=0.01 เลื่อนผ่าน 4 จังหวะ = เพี้ยน 4 สตางค์
      // — ค่าส่ง 100 กลายเป็น 99.96 ทั้งบิล ORD-202609-0017 เมื่อ 7 ก.ย. 2026)
      // blur แทน preventDefault เพื่อให้หน้ายังเลื่อนได้ตามปกติ
      onWheel={(e) => {
        e.currentTarget.blur();
        onWheel?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        if (display === '' || isNaN(parseFloat(display))) {
          setDisplay('0');
          onChange(0);
        }
        onBlur?.(e);
      }}
    />
  );
});

export default NumberInput;
