// Path: components/ui/ChipsInput.tsx
//
// ช่องกรอก "หลายค่าสั้น ๆ" แบบเดียวกับช่องพิมพ์แท็ก — พิมพ์แล้วกด Enter (หรือ ,) ค่านั้นกลายเป็น
// เม็ดยาอยู่ในกล่องเดียวกัน กากบาทเอาออก · Backspace ตอนช่องว่างถอดเม็ดสุดท้าย
//
// ต่างจาก `TagInput` ตรงที่ค่าเป็น **ข้อความอิสระ** ไม่ผูกกับตารางแท็กของบริษัท
// (ปุ่มตอบเร็วของบรอดแคสต์ · คำค้น · อีเมลหลายคน) — เดิมบรอดแคสต์ใช้ช่องกรอก + ปุ่ม "เพิ่ม"
// แยกกัน เจ้าของขอให้เป็นช่องเดียวเหมือนพิมพ์แท็ก (10 ก.ย. 2026)
//
// กรอบ/สีโฟกัสชุดเดียวกับ FormInput · เม็ดยาคือ `Badge onRemove` ตัวเดียวกับชิปเลือกผู้รับ
'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import Badge from './Badge';

interface ChipsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  label?: string;
  /** คำอธิบายใต้ป้าย (เหนือกล่อง) */
  description?: string;
  placeholder?: string;
  /** จำนวนสูงสุด — ครบแล้วช่องพิมพ์หายไป เหลือเม็ดยาให้ถอด */
  max?: number;
  /** ความยาวสูงสุดต่อค่า */
  maxLength?: number;
  disabled?: boolean;
  /** ชื่อปุ่มถอดสำหรับ screen reader ต่อค่า */
  removeLabel?: (item: string) => string;
  error?: string | null;
}

export default function ChipsInput({
  value, onChange, label, description, placeholder, max, maxLength, disabled, removeLabel, error,
}: ChipsInputProps) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState('');
  const full = max != null && value.length >= max;

  const commit = () => {
    const item = draft.trim();
    if (!item || full) return;
    // ซ้ำ = ไม่เพิ่ม (ปุ่มซ้ำสองอันไม่มีประโยชน์) แต่ล้างช่องให้เหมือนสำเร็จ
    if (!value.includes(item)) onChange([...value, item]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit(); return; }
    if (e.key === 'Backspace' && !draft && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      {label && <label htmlFor={id} className="field-label">{label}</label>}
      {description && <p className="subtitle-text mb-2">{description}</p>}
      {/* กดที่ไหนในกล่องก็โฟกัสช่องพิมพ์ — กล่องทั้งใบคือ input ในสายตาผู้ใช้ */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`w-full min-h-10 px-2 py-1.5 flex flex-wrap items-center gap-1.5 rounded-lg border bg-white dark:bg-slate-700 transition-colors cursor-text focus-within:ring-2 ${
          error
            ? 'border-red-400 focus-within:ring-red-400/40 focus-within:border-red-500'
            : 'border-gray-300 dark:border-slate-600 focus-within:ring-primary/40 focus-within:border-primary'
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        {value.map((item, i) => (
          <Badge
            key={`${item}-${i}`}
            tone="gray"
            shape="pill"
            size="md"
            onRemove={disabled ? undefined : () => onChange(value.filter((_, j) => j !== i))}
            removeLabel={removeLabel ? removeLabel(item) : `เอา ${item} ออก`}
          >
            {item}
          </Badge>
        ))}
        {!full && (
          <input
            ref={inputRef}
            id={id}
            value={draft}
            maxLength={maxLength}
            disabled={disabled}
            placeholder={value.length === 0 ? placeholder : undefined}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            // คลิกออกทั้งที่พิมพ์ค้าง = ตั้งใจจะเอาค่านั้น ไม่ใช่ทิ้ง
            onBlur={commit}
            className="flex-1 min-w-24 h-7 bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none"
          />
        )}
      </div>
      <div className="mt-1 flex items-start justify-between gap-3">
        {error
          ? <p className="helper-text text-red-600 dark:text-red-400">{error}</p>
          : <span className="helper-text">{full ? `ครบ ${max} แล้ว — เอาออกก่อนถ้าจะเปลี่ยน` : 'พิมพ์แล้วกด Enter'}</span>}
        {max != null && (
          <span className="helper-text tabular-nums flex-shrink-0">{value.length}/{max}</span>
        )}
      </div>
    </div>
  );
}
