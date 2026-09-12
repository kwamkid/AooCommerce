// Path: components/products/form/PriceReduceInput.tsx
//
// ช่อง "ลดเหลือ" ของฟอร์มสินค้า — กล่องเดียว กดท้ายช่องเลือกว่าจะพิมพ์แบบไหน:
//   ฿   ลดเหลือ  = พิมพ์ราคาสุดท้าย (ค่าที่เก็บจริง)
//   %   ลด       = ระบบคิดราคาจากราคาปกติให้
//   −฿  ลดไป     = ราคาปกติ ลบ จำนวนที่พิมพ์
// ค่าที่ส่งกลับ (`onChange(value)`) เป็น discount_price เสมอ · โหมดไม่ถูกบันทึก · บรรทัดใต้ช่องบอกผลลัพธ์
// ป้ายของช่องเปลี่ยนตามโหมด (`reduceModeLabel`) — ผู้เรียกวาดป้ายเอง จึงต้องรู้โหมด: ส่ง `mode` +
// `onModeChange` (controlled) · ตารางที่มีหัวคอลัมน์เดียวใช้โหมดเดียวร่วมกันทุกแถว
// ใช้กับ: การ์ดสินค้าปกติ · ตารางตัวเลือก (ต่อแถว + "ใช้กับทุกแถว") · ตารางชุดย่อยของสินค้าชุด
// ตัวคำนวณอยู่ใน lib/product-variants.ts (`applyReduce` / `reduceSummary`) — ห้ามคิดเองในหน้า
'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Minus, Percent, Tag } from 'lucide-react';
import ActionMenu from '@/components/ui/ActionMenu';
import NumberInput from '@/components/ui/NumberInput';
import { formatPrice } from '@/lib/utils/format';
import { type ReduceMode, type ReduceSpec, applyReduce, reduceSummary } from '@/lib/product-variants';

const MODES: { mode: ReduceMode; short: string; label: string; description: string; icon: ReactNode }[] = [
  { mode: 'price', short: '฿', label: 'ลดเหลือ (บาท)', description: 'พิมพ์ราคาสุดท้ายที่จะขาย', icon: <Tag className="w-4 h-4" /> },
  { mode: 'percent', short: '%', label: 'ลด %', description: 'ระบบคิดราคาจากราคาปกติให้', icon: <Percent className="w-4 h-4" /> },
  { mode: 'amount', short: '−฿', label: 'ลดไป (บาท)', description: 'ราคาปกติ ลบ จำนวนที่พิมพ์', icon: <Minus className="w-4 h-4" /> },
];

/** ป้ายของช่องตามโหมด — `unit` = ใส่หน่วยในวงเล็บ (ป้ายการ์ด) · ไม่ใส่ = หัวตาราง/ป้ายเล็ก */
export function reduceModeLabel(mode: ReduceMode, unit = true): string {
  switch (mode) {
    case 'price': return unit ? 'ลดเหลือ (฿)' : 'ลดเหลือ';
    case 'percent': return unit ? 'ลด (%)' : 'ลด %';
    case 'amount': return unit ? 'ลดไป (฿)' : 'ลดไป';
  }
}

interface PriceReduceInputProps {
  /** discount_price ปัจจุบัน · 0 = ไม่มีส่วนลด */
  value: number;
  /**
   * ราคาปกติของแถวนี้ — ไม่ส่ง = ช่อง "ใช้กับทุกแถว" (แต่ละแถวราคาปกติไม่เท่ากัน)
   * component จะไม่คำนวณ/ไม่โชว์ผล ผู้เรียกเอา `spec` ไป `applyReduce()` ต่อแถวเอง
   */
  basePrice?: number;
  /** `value` = discount_price ที่คิดแล้ว · `spec` = สิ่งที่ผู้ใช้พิมพ์ (สำหรับ "ใช้กับทุกแถว") */
  onChange: (value: number, spec: ReduceSpec) => void;
  /** โหมดจากผู้เรียก (ใช้วาดป้าย / ใช้ร่วมกันทั้งตาราง) — ไม่ส่ง = จำเองในช่อง */
  mode?: ReduceMode;
  onModeChange?: (mode: ReduceMode) => void;
  error?: boolean;
  align?: 'left' | 'right';
  'aria-label'?: string;
  /** บรรทัดผลลัพธ์ใต้ช่อง — ปิดเมื่อผู้เรียกมีข้อความ error ของตัวเองอยู่แล้ว หรือที่แคบ */
  showHint?: boolean;
  /** ข้อความเมื่อยังไม่มีส่วนลด */
  emptyHint?: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtPercent = (n: number) => String(round2(n));

export default function PriceReduceInput({
  value,
  basePrice,
  onChange,
  mode: modeProp,
  onModeChange,
  error,
  align = 'left',
  'aria-label': ariaLabel = 'ลดเหลือ',
  showHint = true,
  emptyHint = 'ว่าง = ขายราคาปกติ',
}: PriceReduceInputProps) {
  const [internalMode, setInternalMode] = useState<ReduceMode>('price');
  const mode = modeProp ?? internalMode;
  // สิ่งที่พิมพ์ในโหมด % / ลดไป (โหมด ฿ ใช้ `value` ตรง ๆ)
  const [draft, setDraft] = useState(0);

  const current = MODES.find(m => m.mode === mode)!;
  const summary = basePrice != null ? reduceSummary(basePrice, value) : null;

  // ตัวเลขของโหมดใหม่ที่แปลงจากราคาที่เก็บอยู่ — ราคาไม่เปลี่ยน แค่เปลี่ยนวิธีพิมพ์
  const draftFor = (m: ReduceMode) => {
    if (m === 'percent') return summary ? summary.percent : 0;
    if (m === 'amount') return summary ? summary.amount : 0;
    return 0;
  };

  // โหมดเปลี่ยนจากข้างนอก (แถวอื่นในตารางสลับ) → แปลง draft ระหว่าง render
  // (แบบเดียวกับ NumberInput — กฎ react-hooks/set-state-in-effect ห้าม setState ใน effect)
  const [prevMode, setPrevMode] = useState(mode);
  if (mode !== prevMode) {
    setPrevMode(mode);
    setDraft(draftFor(mode));
  }

  const handleInput = (n: number) => {
    if (mode === 'price') {
      onChange(n, { mode, input: n });
      return;
    }
    setDraft(n);
    const spec: ReduceSpec = { mode, input: n };
    onChange(basePrice != null ? applyReduce(basePrice, spec) : 0, spec);
  };

  const switchMode = (next: ReduceMode) => {
    if (next === mode) return;
    const nextDraft = draftFor(next);
    setInternalMode(next);
    setDraft(nextDraft);
    setPrevMode(next);
    onModeChange?.(next);
    onChange(value, { mode: next, input: next === 'price' ? value : nextDraft });
  };

  let hint: string | null = null;
  if (showHint) {
    if (basePrice == null) {
      hint = mode === 'price' ? null : 'คิดจากราคาปกติของแต่ละแถว';
    } else if (!(value > 0)) {
      hint = emptyHint;
    } else if (summary) {
      const parts: string[] = [];
      if (mode !== 'price') parts.push(`= ฿${formatPrice(value)}`);
      if (mode !== 'percent') parts.push(`ลด ${fmtPercent(summary.percent)}%`);
      if (mode !== 'amount') parts.push(`ลด ${formatPrice(summary.amount)} ฿`);
      hint = parts.join(' · ');
    }
  }

  return (
    <div>
      <div
        className={`flex h-[42px] rounded-lg border bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-colors ${
          error ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
        }`}
      >
        {/* key={mode}: ให้ NumberInput ทิ้งข้อความที่พิมพ์ค้างเมื่อสลับโหมด */}
        <NumberInput
          key={mode}
          value={mode === 'price' ? value : draft}
          onChange={handleInput}
          min={0}
          max={mode === 'percent' ? 100 : undefined}
          placeholder="0"
          aria-label={`${ariaLabel} (${current.label})`}
          className={`min-w-0 flex-1 h-full px-3 text-base bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-l-lg focus:outline-none ${
            align === 'right' ? 'text-right' : ''
          }`}
        />
        <ActionMenu
          placement="auto"
          align="end"
          trigger={
            <>
              <span>{current.short}</span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </>
          }
          triggerClassName="flex items-center gap-0.5 px-2 h-full border-l border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors whitespace-nowrap"
          items={MODES.map(m => ({
            key: m.mode,
            label: m.label,
            description: m.description,
            icon: m.icon,
            primary: m.mode === mode,
            onClick: () => switchMode(m.mode),
          }))}
        />
      </div>
      {hint && <p className="helper-text mt-1">{hint}</p>}
    </div>
  );
}
