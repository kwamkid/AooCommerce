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
        className="grid gap-1.5"
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
              // สีการเลือกอยู่ที่ .choice-card / .choice-card-active ใน globals.css (ชุดเดียวกับการ์ด Radio/Checkbox)
              className={`choice-card relative flex flex-col items-center gap-1.5 px-2 py-2.5 text-center disabled:opacity-50 disabled:cursor-not-allowed ${
                active ? 'choice-card-active ring-1 ring-primary' : ''
              }`}
            >
              {active && (
                <span className="absolute top-1 right-1 w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center">
                  <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
                </span>
              )}
              {opt.preview && (
                <span className="flex items-center justify-center h-12 w-full">{opt.preview}</span>
              )}
              <span className={`subtitle-text font-medium leading-tight ${active ? 'text-orange-700' : 'text-gray-700 dark:text-slate-300'}`}>
                {opt.label}
              </span>
              {opt.description && (
                <span className="text-gray-400 leading-tight" style={{ fontSize: 11 }}>{opt.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
