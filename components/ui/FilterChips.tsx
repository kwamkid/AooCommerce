'use client';

import type { ReactNode } from 'react';
import Tooltip from './Tooltip';

// แถบชิปกรอง (pill + ไอคอน + จำนวน) — ใช้ร่วมทุกที่ที่กรองด้วยแพลตฟอร์ม/หมวด
//
// เดิม copy โครงเดียวกันไว้สองที่ในหน้าช่องทางการขาย (แท็บช่องทางของฉัน กับแท็บ
// เชื่อมต่อ Marketplace) แก้สไตล์ที่หนึ่งแล้วอีกที่ไม่ตาม จนสองแท็บดูไม่เข้าชุดกัน
//
// ⚠️ อย่าสับสนกับ `StatusTabs` — ตัวนั้นสำหรับกรองสถานะในหน้า list (ตัวเลขใหญ่ pill ทึบ)
//    ตัวนี้คือชิปกรองแบบเบา ๆ ที่มีสีประจำแพลตฟอร์มของตัวเอง

/** คลาสตอนถูกเลือกของชิปที่ไม่ผูกกับแพลตฟอร์ม (สีแบรนด์) — ใช้ตัวนี้แทนพิมพ์ hex เองในหน้า */
export const FILTER_CHIP_PRIMARY_ACTIVE = 'border-primary text-primary bg-orange-50/60 dark:bg-orange-950/20';

export interface FilterChip<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
  /** คลาสตอนถูกเลือก — ใส่สีประจำแพลตฟอร์ม เช่น 'border-shopee text-shopee bg-shopee/10' */
  activeClass: string;
  /** คำอธิบายสั้น ๆ ตอน hover/แตะค้าง (ผ่าน `Tooltip` กลาง) — ใช้เมื่อป้ายชิปสั้นจนต้องขยายความ เช่น ไม่แสดง/แสดง/บังคับกรอก */
  tooltip?: string;
  /** ชิปนี้กดไม่ได้ (ตัวเลือกที่ยังใช้ไม่ได้ในสภาพตอนนี้) — ใส่ `tooltip` บอกเหตุผลคู่กันเสมอ */
  disabled?: boolean;
}

/**
 * pill      = ชิปกลม ๆ แยกเม็ด (ค่าเดิม) — ตัวกรอง/โหมดระดับบล็อก
 * segmented = ปุ่มติดกันเป็นกลุ่มเดียว มุมมนน้อย — ใช้กับ "ตัวเลือกย่อยภายในช่องกรอก" เพื่อไม่ให้
 *             ปนกับชิป pill ที่อยู่ใกล้กัน (เจ้าของ: pill สองชุดในการ์ดเดียวกันดูงง 10 ก.ย. 2026)
 */
export type FilterChipsVariant = 'pill' | 'segmented';

export default function FilterChips<T extends string>({
  chips, value, onChange, className, variant = 'pill', size = 'sm', disabled,
}: {
  chips: FilterChip<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  variant?: FilterChipsVariant;
  /**
   * sm = ชิปเตี้ยตามปกติ · md = สูง 42px เท่า `<input>`/`<Button>` — ใช้เมื่อวางอยู่**แถวเดียวกับช่องกรอก**
   * ไม่งั้นเห็นเป็นขั้นบันได (กติกาความสูง 42px เดียวกับ .form-control-md/.btn-md)
   */
  size?: 'sm' | 'md';
  /** อ่านอย่างเดียว — ใช้ตอนฟอร์มกำลังบันทึก หรือแถวที่แก้ไม่ได้ */
  disabled?: boolean;
}) {
  const segmented = variant === 'segmented';
  // md ให้ .form-control-md เป็นคนคุมความสูง/ขนาดตัวอักษร (จึงไม่ใส่ text-sm ทับ)
  const sizeClass = segmented
    ? (size === 'md' ? 'px-3 form-control-md' : 'px-3 py-1.5 text-sm')
    : 'rounded-full border px-3 py-1.5 text-sm';
  const wrapClass = segmented
    ? `inline-flex items-stretch rounded-lg border border-gray-200 dark:border-slate-600 divide-x divide-gray-200 dark:divide-slate-600 overflow-hidden ${className || ''}`
    : `flex flex-wrap items-center gap-2 ${className || ''}`;

  return (
    <div className={wrapClass}>
      {chips.map(chip => {
        const button = (
          <button
            key={chip.id}
            type="button"
            onClick={() => onChange(chip.id)}
            disabled={disabled || chip.disabled}
            // ป้ายห้ามแตกบรรทัด — ชิป md สูงคงที่ 42px ป้ายสองบรรทัดจะล้นขอบบนล่าง (เจ้าของท้วง 11 ก.ย. 2026)
            // ที่แคบให้ผู้เรียกส่งป้ายสั้นมาแทน ไม่ใช่ปล่อยให้ชิปหดจนตัวหนังสือพับ
            className={`inline-flex items-center gap-1.5 font-medium whitespace-nowrap flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sizeClass} ${
              value === chip.id
                ? chip.activeClass
                : `text-gray-600 dark:text-slate-300 enabled:hover:bg-gray-50 dark:enabled:hover:bg-slate-700${
                  segmented ? '' : ' border-gray-200 dark:border-slate-600'
                }`
            }`}
          >
            {chip.icon}
            {chip.label}
            {!!chip.count && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10">{chip.count}</span>
            )}
          </button>
        );
        // ชิปที่ disabled ได้ต้องมีกล่องครอบ (`box="inline-flex"`) ไม่งั้น hover ไม่ติด
        return chip.tooltip
          ? <Tooltip key={chip.id} text={chip.tooltip} box="inline-flex">{button}</Tooltip>
          : button;
      })}
    </div>
  );
}
