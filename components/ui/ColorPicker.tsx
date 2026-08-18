// เลือกสี — ชุดสีสำเร็จรูป + จานสีของเครื่อง + กรอกรหัสสีเอง
//
// ใช้แทนการวาง <input type="color"> ดิบ ๆ ในแต่ละหน้า เพื่อให้ทุกที่ที่ให้ผู้ใช้
// เลือกสีหน้าตาและพฤติกรรมเหมือนกัน (ตามกฎ code-simplicity.md)
'use client';

import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import FormInput from './FormInput';
import { MODERN_COLOR_PRESETS, type ColorPreset } from '@/lib/color-presets';

interface ColorPickerProps {
  /** รหัสสี #RRGGBB — ค่าว่างได้เมื่อ allowEmpty */
  value: string;
  onChange: (hex: string) => void;
  /** ชุดสีที่ให้เลือก (ค่าเริ่มต้น = ชุดสี modern กลางของระบบ) */
  presets?: ColorPreset[];
  /** อนุญาตให้ "ไม่กำหนด" ได้ เช่น สีปุ่มที่ปล่อยให้ใช้สีแบรนด์ */
  allowEmpty?: boolean;
  /** ข้อความปุ่มล้างค่า เมื่อ allowEmpty */
  emptyLabel?: string;
  /** สีที่จะใช้จริงเมื่อค่าว่าง — ใช้แสดงในจานสีให้ตรงกับผลลัพธ์ */
  fallbackValue?: string;
  label?: string;
  hint?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export default function ColorPicker({
  value, onChange, presets = MODERN_COLOR_PRESETS,
  allowEmpty = false, emptyLabel = 'ใช้ค่าเริ่มต้น', fallbackValue = '#000000',
  label, hint,
}: ColorPickerProps) {
  const effective = value || fallbackValue;
  // เก็บข้อความที่พิมพ์แยกจากค่าจริง — ระหว่างพิมพ์ยังไม่ครบ 6 หลักต้องไม่เด้ง
  const [text, setText] = useState(value);
  useEffect(() => { setText(value); }, [value]);

  const commitText = (raw: string) => {
    const next = raw.trim().startsWith('#') ? raw.trim() : `#${raw.trim()}`;
    setText(raw);
    if (HEX.test(next)) onChange(next.toLowerCase());
    else if (allowEmpty && raw.trim() === '') onChange('');
  };

  return (
    <div>
      {label && <label className="field-label">{label}</label>}

      <div className="flex flex-wrap gap-2 mb-3">
        {presets.map(p => {
          const active = value.toLowerCase() === p.value.toLowerCase();
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange(p.value.toLowerCase())}
              title={p.name}
              aria-label={`ใช้สี ${p.name}`}
              aria-pressed={active}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                active ? 'ring-2 ring-offset-2 ring-gray-900 dark:ring-white dark:ring-offset-slate-800' : ''
              }`}
              style={{ background: p.value }}
            >
              {active && <Check className="w-4 h-4" style={{ color: '#fff', mixBlendMode: 'difference' }} />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <input
          type="color"
          value={effective}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className="w-10 h-10 rounded-lg border border-gray-200 dark:border-slate-600 cursor-pointer bg-transparent flex-shrink-0"
          aria-label={label ? `เลือกสีเอง: ${label}` : 'เลือกสีเอง'}
        />
        <div className="w-36">
          <FormInput
            value={text}
            onChange={(e) => commitText(e.target.value)}
            placeholder={allowEmpty ? 'ว่าง = ค่าเริ่มต้น' : '#000000'}
            className="font-mono"
          />
        </div>
        {allowEmpty && value && (
          <button type="button" onClick={() => onChange('')}
            className="subtitle-text text-[#F4511E] hover:underline">
            {emptyLabel}
          </button>
        )}
      </div>

      {hint && <p className="helper-text text-gray-500 mt-1.5">{hint}</p>}
    </div>
  );
}
