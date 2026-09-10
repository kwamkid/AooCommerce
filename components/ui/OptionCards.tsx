// ตัวเลือกแบบการ์ด — ใช้แทน dropdown เมื่อ "ตัวเลือกอธิบายด้วยภาพได้ดีกว่าคำ"
// เช่น สัดส่วนรูป เลย์เอาต์ สไตล์แถบหัว
//
// dropdown บังคับให้ผู้ใช้จินตนาการเอาเองว่า "แนวตั้ง 4:5" หน้าตาเป็นยังไง
// การ์ดที่วาดรูปทรงจริงให้ดูตัดสินใจได้ทันทีโดยไม่ต้องกดลองแล้วกดกลับ
//
// ขนาดพรีวิวมี 2 ขั้น: `sm` = รูปทรงเล็ก ๆ พอบอกความต่าง (ค่าเริ่มต้น) · `lg` = มอคอัปทั้งใบ
// ที่ต้อง "ดูออก" โดยไม่ต้องอ่าน (เช่นห้องแชทจำลองของแต่ละชนิดข้อความบรอดแคสต์)
'use client';

import type { ReactNode } from 'react';
import { Check } from 'lucide-react';

export interface OptionCardItem<T extends string = string> {
  /**
   * ภาพตัวอย่างของตัวเลือกนี้ — วาดด้วย div/svg ตามจริง ไม่ใช่ไอคอนสื่อความ
   *
   * ส่งรูปตัวอย่างจริง (screenshot) เป็น `<img className="w-full h-full object-cover">` ได้
   * — layout `horizontal` มีกรอบ overflow-hidden ครอบให้อยู่แล้ว รูปจึงเต็มกรอบพอดีโดยไม่ล้น
   */
  id: T;
  label: string;
  description?: string;
  preview?: ReactNode;
}

/**
 * stacked    = พรีวิวอยู่บน ตัวหนังสืออยู่ล่าง (ค่าเดิม — ตัวเลือกสั้น ๆ หลายอันเรียงกัน)
 * horizontal = พรีวิวอยู่ซ้าย ตัวหนังสืออยู่ขวา — ใช้เมื่อพรีวิวต้องใหญ่พอจะ "ดูออก"
 *              ว่าต่างกันตรงไหน (เช่นรูปแบบข้อความที่ลูกค้าจะเห็นในแชท)
 */
export type OptionCardsLayout = 'stacked' | 'horizontal';

/**
 * sm = รูปทรงเล็กพอบอกความต่าง (stacked สูง 48px · horizontal 128×96)
 * lg = มอคอัปทั้งใบในกรอบเต็มความกว้าง (stacked สูง 128px · horizontal 192×144)
 *      — stacked แตกคอลัมน์ตามจอให้เอง เพราะพรีวิวสูงขนาดนี้วาง 4 ใบบนจอแคบไม่ไหว
 */
export type OptionCardsPreviewSize = 'sm' | 'lg';

interface OptionCardsProps<T extends string> {
  value: T;
  onChange: (id: T) => void;
  options: OptionCardItem<T>[];
  label?: string;
  /** จำนวนคอลัมน์บนจอกว้าง (ค่าเริ่มต้น: stacked = จำนวนตัวเลือก · horizontal = 1 แถวต่อบรรทัด) */
  columns?: number;
  layout?: OptionCardsLayout;
  previewSize?: OptionCardsPreviewSize;
  disabled?: boolean;
}

/** คลาสคอลัมน์แบบคงที่ — Tailwind ต้องเห็นชื่อคลาสในซอร์ส (ประกอบสตริงตอนรันไม่ได้) */
const STACKED_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/** stacked + พรีวิวใหญ่ — จอแคบพับเป็น 2 คอลัมน์ก่อน ค่อยกางครบบนจอกว้าง */
const STACKED_COLS_LG: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
  4: 'grid-cols-2 xl:grid-cols-4',
};

/** แนวนอนกินความกว้างมาก — จอแคบเรียงลงมาทีละแถวเสมอ แล้วค่อยแตกคอลัมน์บนจอกว้าง */
const HORIZONTAL_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 md:grid-cols-2',
  3: 'grid-cols-1 md:grid-cols-3',
  4: 'grid-cols-1 md:grid-cols-4',
};

/** กรอบพรีวิวของ layout horizontal ต่อขนาด */
const HORIZONTAL_PREVIEW: Record<OptionCardsPreviewSize, string> = {
  sm: 'w-32 h-24',
  lg: 'w-48 h-36',
};

export default function OptionCards<T extends string>({
  value, onChange, options, label, columns, layout = 'stacked', previewSize = 'sm', disabled,
}: OptionCardsProps<T>) {
  const horizontal = layout === 'horizontal';
  const large = previewSize === 'lg';
  const cols = Math.min(columns ?? (horizontal ? 1 : options.length), 4);
  const colMap = horizontal ? HORIZONTAL_COLS : large ? STACKED_COLS_LG : STACKED_COLS;
  const colClass = colMap[cols] || 'grid-cols-1';

  return (
    <div>
      {label && <label className="field-label">{label}</label>}
      <div
        className={`grid gap-1.5 ${colClass}`}
        role="radiogroup"
        aria-label={label}
      >
        {options.map(opt => {
          const active = opt.id === value;
          // สีการเลือกอยู่ที่ .choice-card / .choice-card-active ใน globals.css (ชุดเดียวกับการ์ด Radio/Checkbox)
          const base = `choice-card relative disabled:opacity-50 disabled:cursor-not-allowed ${
            active ? 'choice-card-active ring-1 ring-primary' : ''
          }`;
          // z-10 เพราะพรีวิวขนาด lg เป็นกรอบมีพื้นสีเต็มความกว้าง ติ๊กต้องลอยอยู่บนมัน
          const check = active && (
            <span className="absolute top-1 right-1 z-10 w-3.5 h-3.5 rounded-full bg-primary text-white flex items-center justify-center">
              <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
            </span>
          );
          const labelClass = active ? 'text-orange-700' : 'text-gray-700 dark:text-slate-300';

          if (horizontal) {
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(opt.id)}
                className={`${base} flex items-center gap-3 p-2 pr-5 text-left`}
              >
                {check}
                {opt.preview && (
                  <span className={`${HORIZONTAL_PREVIEW[previewSize]} flex-shrink-0 rounded-md overflow-hidden bg-gray-100 dark:bg-slate-700 flex items-center justify-center`}>
                    {opt.preview}
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className={`block body-text font-medium leading-tight ${labelClass}`}>
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="block subtitle-text text-gray-500 dark:text-slate-400 leading-tight mt-1">
                      {opt.description}
                    </span>
                  )}
                </span>
              </button>
            );
          }

          if (large) {
            // มอคอัปเต็มกรอบ — ไม่ center เพราะมอคเติมกรอบเองทั้งใบ · ตัวหนังสือขึ้นสเกลอ่านได้ (≥14)
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                disabled={disabled}
                onClick={() => onChange(opt.id)}
                className={`${base} flex flex-col items-center gap-2 p-2 pb-2.5 text-center`}
              >
                {check}
                {opt.preview && (
                  <span className="block w-full h-32 rounded-md overflow-hidden bg-gray-100 dark:bg-slate-700">
                    {opt.preview}
                  </span>
                )}
                <span className={`body-text font-medium leading-tight ${labelClass}`}>
                  {opt.label}
                </span>
                {opt.description && (
                  <span className="subtitle-text text-gray-500 dark:text-slate-400 leading-tight">
                    {opt.description}
                  </span>
                )}
              </button>
            );
          }

          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(opt.id)}
              className={`${base} flex flex-col items-center gap-1.5 px-2 py-2.5 text-center`}
            >
              {check}
              {opt.preview && (
                <span className="flex items-center justify-center h-12 w-full">{opt.preview}</span>
              )}
              <span className={`subtitle-text font-medium leading-tight ${labelClass}`}>
                {opt.label}
              </span>
              {opt.description && (
                <span className="helper-text text-gray-400 leading-tight">{opt.description}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
