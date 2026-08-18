// ตัวเลือกแบบการ์ด — ใช้แทน dropdown เมื่อ "ตัวเลือกอธิบายด้วยภาพได้ดีกว่าคำ"
// เช่น สัดส่วนรูป เลย์เอาต์ สไตล์แถบหัว
//
// dropdown บังคับให้ผู้ใช้จินตนาการเอาเองว่า "แนวตั้ง 4:5" หน้าตาเป็นยังไง
// การ์ดที่วาดรูปทรงจริงให้ดูตัดสินใจได้ทันทีโดยไม่ต้องกดลองแล้วกดกลับ
'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface OptionCardItem<T extends string = string> {
  id: T;
  label: string;
  description?: string;
  /** ภาพตัวอย่างของตัวเลือกนี้ — วาดด้วย div/svg ตามจริง ไม่ใช่ไอคอนสื่อความ */
  preview?: ReactNode;
}

interface OptionCardsProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  options: OptionCardItem<T>[];
  label?: string;
  /** จำนวนคอลัมน์บนจอกว้าง (ค่าเริ่มต้น = จำนวนตัวเลือก) */
  columns?: number;
  disabled?: boolean;
}

export default function OptionCards<T extends string>({
  value, onChange, options, label, columns, disabled,
}: OptionCardsProps<T>) {
  const cols = columns ?? options.length;

  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.min(cols, 4)}, minmax(0, 1fr))` }}
        role="radiogroup"
        aria-label={label}
      >
        {options.map(opt => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={`relative flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-colors text-center disabled:opacity-50 disabled:cursor-not-allowed ${
                active
                  ? 'border-[#F4511E] bg-orange-50/60 dark:bg-orange-950/20'
                  : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500'
              }`}
            >
              {active && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#F4511E] text-white flex items-center justify-center">
                  <Check className="w-3 h-3" strokeWidth={3} />
                </span>
              )}
              {opt.preview && (
                <span className="flex items-center justify-center h-14 w-full">{opt.preview}</span>
              )}
              <span className={`subtitle-text font-medium ${active ? 'text-[#C2410C]' : 'text-gray-700 dark:text-slate-300'}`}>
                {opt.label}
              </span>
              {opt.description && (
                <span className="helper-text text-gray-500 leading-tight">{opt.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
