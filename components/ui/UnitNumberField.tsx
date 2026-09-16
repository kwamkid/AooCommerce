// ช่องกรอกตัวเลขพร้อมหน่วยท้ายช่อง (วัน · ชิ้น · %) + ป้ายกำกับ + คำอธิบายใต้ช่อง
//
// เดิมรูปแบบนี้ถูกพิมพ์ inline ซ้ำในหน้าตั้งค่าหลายที่ พร้อมคลาสยาว ๆ ชุดเดียวกัน
// แล้วเพี้ยนกันเองทีละหน้า (บางที่ focus ring สีอำพัน บางที่ส้ม) — รวมไว้ที่เดียว
'use client';

import NumberInput from '@/components/ui/NumberInput';

interface Props {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** หน่วยที่ลอยอยู่ท้ายช่อง เช่น "วัน" */
  unit?: string;
  /** คำอธิบายใต้ช่อง เช่น "หลังวางบิล" */
  hint?: string;
  min?: number;
  max?: number;
  disabled?: boolean;
}

export default function UnitNumberField({
  label, value, onChange, unit, hint, min, max, disabled,
}: Props) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-600 dark:text-slate-400 mb-1">{label}</label>
      <div className="relative">
        <NumberInput
          value={value}
          onChange={onChange}
          disabled={disabled}
          className={`w-full px-3 py-2 ${unit ? 'pr-10' : ''} border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-base focus:outline-none focus:ring-2 focus:ring-primary/40`}
          min={min !== undefined ? String(min) : undefined}
          max={max !== undefined ? String(max) : undefined}
        />
        {unit && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">
            {unit}
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-gray-400 dark:text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
