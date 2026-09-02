'use client';

import Tooltip from '@/components/ui/Tooltip';
import { formatThaiDateTime } from '@/lib/utils/format';

interface PrintStatusDotsProps {
  printedLabelAt?: string | null;
  printedPackingAt?: string | null;
  printedInvoiceAt?: string | null;
}

const DOT_CONFIG = [
  { key: 'label', label: 'ใบปะหน้า', field: 'printedLabelAt' as const },
  { key: 'packing', label: 'ใบจัดของ', field: 'printedPackingAt' as const },
  { key: 'invoice', label: 'ใบกำกับ/ใบเสร็จ', field: 'printedInvoiceAt' as const },
];

export default function PrintStatusDots({
  printedLabelAt,
  printedPackingAt,
  printedInvoiceAt,
}: PrintStatusDotsProps) {
  const values = { printedLabelAt, printedPackingAt, printedInvoiceAt };

  // ป้ายใช้ <Tooltip> ไม่ใช่ title="" ของเบราว์เซอร์ (แต่งไม่ได้ · ขึ้นช้า · มือถือไม่ขึ้น)
  const tip = DOT_CONFIG.map(d => {
    const ts = values[d.field];
    return `${d.label}: ${ts ? formatThaiDateTime(ts) : 'ยังไม่พิมพ์'}`;
  }).join('\n');

  return (
    <Tooltip text={tip}>
      <div className="flex items-center gap-1" aria-label="สถานะการพิมพ์เอกสาร">
        {DOT_CONFIG.map(d => {
          const printed = !!values[d.field];
          return (
            <span
              key={d.key}
              className={`w-2 h-2 rounded-full ${
                printed
                  ? 'bg-green-500'
                  : 'bg-gray-300 dark:bg-slate-600'
              }`}
            />
          );
        })}
      </div>
    </Tooltip>
  );
}
