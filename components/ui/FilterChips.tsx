'use client';

import type { ReactNode } from 'react';

// แถบชิปกรอง (pill + ไอคอน + จำนวน) — ใช้ร่วมทุกที่ที่กรองด้วยแพลตฟอร์ม/หมวด
//
// เดิม copy โครงเดียวกันไว้สองที่ในหน้าช่องทางการขาย (แท็บช่องทางของฉัน กับแท็บ
// เชื่อมต่อ Marketplace) แก้สไตล์ที่หนึ่งแล้วอีกที่ไม่ตาม จนสองแท็บดูไม่เข้าชุดกัน
//
// ⚠️ อย่าสับสนกับ `StatusTabs` — ตัวนั้นสำหรับกรองสถานะในหน้า list (ตัวเลขใหญ่ pill ทึบ)
//    ตัวนี้คือชิปกรองแบบเบา ๆ ที่มีสีประจำแพลตฟอร์มของตัวเอง

export interface FilterChip<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
  /** คลาสตอนถูกเลือก — ใส่สีประจำแพลตฟอร์ม เช่น 'border-shopee text-shopee bg-shopee/10' */
  activeClass: string;
}

export default function FilterChips<T extends string>({
  chips, value, onChange, className,
}: {
  chips: FilterChip<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className || ''}`}>
      {chips.map(chip => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.id)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            value === chip.id
              ? chip.activeClass
              : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
          }`}
        >
          {chip.icon}
          {chip.label}
          {!!chip.count && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{chip.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
