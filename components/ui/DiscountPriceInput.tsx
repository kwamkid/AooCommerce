// Path: components/ui/DiscountPriceInput.tsx
//
// ช่อง "ลดเหลือ (฿)" (ของกลาง — ฟอร์มสินค้า · โปรโมชัน) — ช่องหลักเป็นราคาสุดท้ายเสมอ (= discount_price ที่เก็บ)
// ปุ่มเครื่องคิดเลขท้ายช่องเปิด popover เล็ก ๆ ให้พิมพ์ "ลด %" หรือ "ลดไป (บาท)" เห็นราคาที่จะได้ กดตกลงแล้ว
// เขียนลงช่องหลักเลย — ไม่มีโหมดให้จำ เปิดแก้ไขทีหลังก็เห็นเป็นบาทเหมือนเดิม (เจ้าของเคาะ 13 ก.ย. 2026)
// บรรทัดใต้ช่องบอกว่าราคานี้เท่ากับลดกี่ % / กี่บาท
//
// ใช้กับ: การ์ดสินค้าปกติ · ตารางตัวเลือก (ต่อแถว + "ใช้กับทุกแถว") · ตารางชุดย่อยของสินค้าชุด · หน้าโปรโมชัน
// "ใช้กับทุกแถว" ไม่มีราคาปกติเดียว → ส่ง `spec` มาแสดงเป็นเม็ด "ลด 10%" แล้วผู้เรียกเอา spec
// ไป `applyReduce()` ต่อแถวเอง · ตัวคำนวณอยู่ใน lib/price-reduce.ts — ห้ามคิดเองในหน้า
'use client';

import { useRef, useState } from 'react';
import { Calculator } from 'lucide-react';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Popover from '@/components/ui/Popover';
import NumberInput from '@/components/ui/NumberInput';
import Tooltip from '@/components/ui/Tooltip';
import { formatPrice } from '@/lib/utils/format';
import { NO_REDUCE, type ReduceSpec, applyReduce, reduceSummary } from '@/lib/price-reduce';

/** กรอบแดงของช่องในกล่อง — หน้าตาเดียวกับช่อง NumberInput ปกติ แต่ขอบแดง */
const INPUT_ERROR = 'w-full h-[42px] px-3 text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg border border-red-400 dark:border-red-500 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors';
const ERROR_TEXT = 'mt-1 text-sm text-red-600 dark:text-red-400';
const FieldError = ({ text }: { text?: string | null }) => (text ? <p className={ERROR_TEXT}>{text}</p> : null);

interface DiscountPriceInputProps {
  /** discount_price ปัจจุบัน · 0 = ไม่มีส่วนลด */
  value: number;
  /**
   * ราคาปกติของแถวนี้ — ไม่ส่ง = ช่อง "ใช้กับทุกแถว" (แต่ละแถวราคาปกติไม่เท่ากัน)
   * กล่องคำนวณจะไม่โชว์ราคา และผลลัพธ์ส่งกลับเป็น `spec` ให้ผู้เรียกคิดต่อแถว
   */
  basePrice?: number;
  /** "ใช้กับทุกแถว" เท่านั้น: spec ที่ตั้งไว้ (mode ≠ price = แสดงเป็นเม็ด "ลด 10%" แทนตัวเลข) */
  spec?: ReduceSpec;
  /** `value` = discount_price · `spec` = สิ่งที่ผู้ใช้เลือก (ผู้เรียกแบบทุกแถวใช้ตัวนี้) */
  onChange: (value: number, spec: ReduceSpec) => void;
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

export default function DiscountPriceInput({
  value,
  basePrice,
  spec,
  onChange,
  error,
  align = 'left',
  'aria-label': ariaLabel = 'ลดเหลือ',
  showHint = true,
  emptyHint = 'ว่าง = ขายราคาปกติ',
}: DiscountPriceInputProps) {
  const [open, setOpen] = useState(false);
  const calcBtnRef = useRef<HTMLButtonElement>(null);
  // ในกล่อง: สองช่องผูกกัน (มีราคาปกติ) · ช่องที่แก้ล่าสุดคือความหมายที่ใช้
  const [pct, setPct] = useState(0);
  const [amt, setAmt] = useState(0);
  const [last, setLast] = useState<'percent' | 'amount'>('percent');

  const hasBase = basePrice != null;
  const base = basePrice ?? 0;
  const summary = hasBase ? reduceSummary(base, value) : null;
  const bulkChip = !hasBase && spec && spec.mode !== 'price' && spec.input > 0 ? spec : null;

  const openCalc = () => {
    setPct(summary ? summary.percent : 0);
    setAmt(summary ? summary.amount : 0);
    setLast('percent');
    setOpen(true);
  };
  const changePct = (n: number) => {
    setPct(n);
    setLast('percent');
    if (hasBase) setAmt(round2((base * n) / 100));
  };
  const changeAmt = (n: number) => {
    setAmt(n);
    setLast('amount');
    if (hasBase && base > 0) setPct(round2((n / base) * 100));
  };

  const draftSpec: ReduceSpec = { mode: last, input: last === 'percent' ? pct : amt };
  const preview = hasBase ? applyReduce(base, draftSpec) : 0;
  // ลดเกิน 100% / ลดบาทเกินราคาปกติ = ราคาติดลบหรือฟรี ไม่ใช่ส่วนลด (กติกา discount < default ของทั้งระบบ)
  const pctError = pct >= 100 ? 'ลดได้ไม่ถึง 100%' : null;
  const amtError = hasBase && base > 0 && amt >= base ? 'ลดได้ไม่ถึงราคาปกติ' : null;
  const canApply = draftSpec.input > 0 && (!hasBase || base > 0) && !pctError && !amtError;
  const apply = () => {
    if (!canApply) return;
    onChange(hasBase ? preview : 0, draftSpec);
    setOpen(false);
  };
  const onEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } };

  let hint: string | null = null;
  if (showHint && hasBase) {
    if (!(value > 0)) hint = emptyHint;
    else if (summary) hint = `ลด ${fmtPercent(summary.percent)}% · ลด ${formatPrice(summary.amount)} ฿`;
  }

  const frameClass = `flex h-[42px] rounded-lg border bg-white dark:bg-slate-700 focus-within:ring-2 focus-within:ring-primary/40 focus-within:border-primary transition-colors ${
    error ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
  }`;

  return (
    <div>
      <div className={frameClass}>
        {bulkChip ? (
          <div className={`min-w-0 flex-1 flex items-center px-2 ${align === 'right' ? 'justify-end' : ''}`}>
            <Badge tone="orange" onRemove={() => onChange(0, NO_REDUCE)} removeLabel="ล้าง">
              {bulkChip.mode === 'percent' ? `ลด ${fmtPercent(bulkChip.input)}%` : `ลดไป ${formatPrice(bulkChip.input)} ฿`}
            </Badge>
          </div>
        ) : (
          <NumberInput
            value={value}
            onChange={n => onChange(n, { mode: 'price', input: n })}
            min={0}
            placeholder="0"
            aria-label={ariaLabel}
            className={`min-w-0 flex-1 h-full px-3 text-base bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-l-lg focus:outline-none ${
              align === 'right' ? 'text-right' : ''
            }`}
          />
        )}
        <Tooltip text="คิดราคาจาก % หรือลดไปกี่บาท" box="inline-flex">
          <button
            ref={calcBtnRef}
            type="button"
            onClick={() => (open ? setOpen(false) : openCalc())}
            aria-label={`คำนวณ${ariaLabel}จาก % หรือจำนวนบาท`}
            className="flex items-center px-2.5 h-full border-l border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-600 dark:text-slate-200 hover:bg-gray-100 hover:text-primary dark:hover:bg-slate-500 transition-colors"
          >
            <Calculator className="w-4 h-4" />
          </button>
        </Tooltip>
      </div>
      {hint && <p className="helper-text mt-1">{hint}</p>}

      <Popover open={open} onClose={() => setOpen(false)} anchorRef={calcBtnRef} width={300} ariaLabel="คิดราคาลดเหลือ">
        <div className="p-3 space-y-3">
          {hasBase && (
            <p className="text-base text-gray-600 dark:text-slate-300">
              ราคาปกติ <span className="font-medium text-gray-900 dark:text-white">฿{formatPrice(base)}</span>
              {base <= 0 && <span className="ml-2 text-red-600 dark:text-red-400">ใส่ราคาปกติก่อน</span>}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">ลด (%)</label>
              <NumberInput
                value={pct}
                onChange={changePct}
                onKeyDown={onEnter}
                min={0}
                placeholder="0"
                aria-label="ลดกี่เปอร์เซ็นต์"
                autoFocus
                className={pctError ? INPUT_ERROR : undefined}
              />
              <FieldError text={pctError} />
            </div>
            <div>
              <label className="field-label">ลดไป (บาท)</label>
              <NumberInput
                value={amt}
                onChange={changeAmt}
                onKeyDown={onEnter}
                min={0}
                placeholder="0"
                aria-label="ลดไปกี่บาท"
                className={amtError ? INPUT_ERROR : undefined}
              />
              <FieldError text={amtError} />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            {hasBase ? (
              <p className="text-base text-gray-700 dark:text-slate-200">
                ลดเหลือ{' '}
                <span className="text-lg font-semibold text-gray-900 dark:text-white">
                  {canApply ? `฿${formatPrice(preview)}` : '—'}
                </span>
              </p>
            ) : (
              <p className="helper-text">คิดจากราคาปกติของแต่ละแถว</p>
            )}
            <div className="flex gap-2 flex-shrink-0">
              <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
              <Button variant="primary" size="sm" onClick={apply} disabled={!canApply}>ตกลง</Button>
            </div>
          </div>
        </div>
      </Popover>
    </div>
  );
}
