// Path: components/products/form/ProductCodesHelp.tsx
//
// ปุ่ม "?" ข้างป้าย รหัสสินค้า / SKU / บาร์โค้ด → หน้าต่างรูปตัวอย่างว่าสามอย่างนี้ต่างกันยังไง
// (เจ้าของขอ 12 ก.ย. 2026: "มีตัวอย่างรูปให้ดูได้มั้ย") · ช่องที่กดมาจะถูกไฮไลต์ทั้งในรูปและในการ์ดคำอธิบาย
// รูปเป็น SVG ในโค้ด ใช้คลาส fill/stroke ของ Tailwind จึงสลับโหมดมืดได้เอง ไม่ต้องมีไฟล์รูป
'use client';

import { useState } from 'react';
import { HelpCircle } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';

export type ProductCodeKind = 'code' | 'sku' | 'barcode';

const ITEMS: { key: ProductCodeKind; title: string; example: string; what: string; use: string; rule: string }[] = [
  {
    key: 'code',
    title: 'รหัสสินค้า',
    example: 'P5192',
    what: 'รหัสของสินค้าทั้งตัว — 1 สินค้ามี 1 รหัส ไม่ว่าจะมีกี่สีกี่ขนาด',
    use: 'ค้นหาและอ้างอิงสินค้าในระบบเรา เช่น หน้ารายการ ไฟล์ Excel รายงาน',
    rule: 'ห้ามซ้ำในร้าน · ตอนเพิ่มสินค้าใหม่เว้นว่างได้ ระบบตั้งให้',
  },
  {
    key: 'sku',
    title: 'SKU',
    example: 'TS-RED-S',
    what: 'รหัสของ "แต่ละแบบที่ขาย" — เสื้อสีแดงไซซ์ S กับสีดำไซซ์ M มี SKU คนละตัว',
    use: 'จับคู่สินค้ากับ Shopee / TikTok / Lazada และตัดสต็อกให้ถูกแบบ',
    rule: 'ห้ามซ้ำทั้งร้าน · สินค้าปกติ (มีแบบเดียว) ใช้ค่าเดียวกับรหัสสินค้าก็ได้',
  },
  {
    key: 'barcode',
    title: 'บาร์โค้ด',
    example: '8850123456789',
    what: 'ตัวเลขใต้แท่งบาร์โค้ดที่พิมพ์อยู่บนกล่องหรือป้ายสินค้า',
    use: 'ยิงสแกนตอนขายหน้าร้าน (POS) และตอนรับของเข้าคลัง',
    rule: 'ส่วนใหญ่เป็นเลข 13 หลักจากโรงงาน · ไม่มีก็เว้นว่างได้',
  },
];

// ── the picture ──

const BOX = 'fill-white dark:fill-slate-800 stroke-gray-300 dark:stroke-slate-600';
const CHIP = 'fill-gray-50 dark:fill-slate-900 stroke-gray-200 dark:stroke-slate-700';
const HIGHLIGHT = 'fill-orange-50 dark:fill-orange-950 stroke-primary';
const TEXT = 'fill-gray-900 dark:fill-white';
const MUTED = 'fill-gray-500 dark:fill-slate-400';
/** alternating bar / space widths (× 2px) — just a picture, not a real EAN */
const BAR_WIDTHS = [2, 1, 1, 3, 1, 2, 2, 1, 1, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 1, 2, 1];

function BarcodeGraphic({ x, y, digits, highlight }: { x: number; y: number; digits: string; highlight: boolean }) {
  const bars: { x: number; w: number }[] = [];
  let cursor = x;
  BAR_WIDTHS.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x: cursor, w: w * 2 });
    cursor += w * 2;
  });
  const center = (x + cursor) / 2;
  return (
    <g>
      {highlight && (
        <rect x={center - 49} y={y - 7} width={98} height={64} rx={6} className={HIGHLIGHT} strokeWidth={2} />
      )}
      {bars.map(b => (
        <rect key={b.x} x={b.x} y={y} width={b.w} height={34} className="fill-gray-800 dark:fill-slate-200" />
      ))}
      <text x={center} y={y + 50} textAnchor="middle" fontSize={11} fontFamily="ui-monospace, monospace" className={TEXT}>
        {digits}
      </text>
    </g>
  );
}

function VariantCard({ y, label, swatch, sku, barcode, focus }: {
  y: number;
  label: string;
  swatch: string;
  sku: string;
  barcode: string;
  focus: ProductCodeKind;
}) {
  const skuOn = focus === 'sku';
  return (
    <g>
      <rect x={300} y={y} width={330} height={96} rx={10} className={BOX} strokeWidth={1.5} />
      <circle cx={322} cy={y + 25} r={8} fill={swatch} className="stroke-gray-300 dark:stroke-slate-600" />
      <text x={338} y={y + 30} fontSize={15} fontWeight={600} className={TEXT}>{label}</text>
      <rect x={314} y={y + 48} width={160} height={32} rx={6} className={skuOn ? HIGHLIGHT : CHIP} strokeWidth={skuOn ? 2 : 1} />
      <text x={324} y={y + 69} fontSize={12} className={MUTED}>SKU</text>
      <text x={356} y={y + 69} fontSize={13} fontFamily="ui-monospace, monospace" className={TEXT}>{sku}</text>
      <BarcodeGraphic x={516} y={y + 18} digits={barcode} highlight={focus === 'barcode'} />
    </g>
  );
}

function CodesDiagram({ focus }: { focus: ProductCodeKind }) {
  const codeOn = focus === 'code';
  return (
    <div className="overflow-x-auto">
      <svg
        viewBox="0 0 640 244"
        className="w-full min-w-[560px] h-auto"
        role="img"
        aria-label="ตัวอย่าง: เสื้อยืดคอกลม รหัสสินค้า P5192 มี 2 แบบ แต่ละแบบมี SKU และบาร์โค้ดของตัวเอง"
      >
        <text x={125} y={18} textAnchor="middle" fontSize={12} className={MUTED}>1 สินค้า = 1 รหัสสินค้า</text>
        <text x={465} y={18} textAnchor="middle" fontSize={12} className={MUTED}>แต่ละแบบที่ขาย = SKU + บาร์โค้ดของตัวเอง</text>

        {/* product */}
        <rect x={10} y={30} width={230} height={206} rx={12} className={BOX} strokeWidth={1.5} />
        <path
          d="M115 58 L90 70 L98 90 L110 85 L110 133 L140 133 L140 85 L152 90 L160 70 L135 58 Q125 68 115 58 Z"
          className="fill-orange-100 dark:fill-orange-900 stroke-orange-400"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />
        <text x={125} y={162} textAnchor="middle" fontSize={15} fontWeight={600} className={TEXT}>เสื้อยืดคอกลม</text>
        <rect x={32} y={178} width={186} height={36} rx={6} className={codeOn ? HIGHLIGHT : CHIP} strokeWidth={codeOn ? 2 : 1} />
        <text x={44} y={201} fontSize={12} className={MUTED}>รหัสสินค้า</text>
        <text x={206} y={201} textAnchor="end" fontSize={14} fontFamily="ui-monospace, monospace" fontWeight={600} className={TEXT}>P5192</text>

        {/* product → variants */}
        <path d="M240 133 C272 133 268 78 300 78" fill="none" className="stroke-gray-300 dark:stroke-slate-600" strokeWidth={1.5} />
        <path d="M240 133 C272 133 268 186 300 186" fill="none" className="stroke-gray-300 dark:stroke-slate-600" strokeWidth={1.5} />

        <VariantCard y={30} label="แดง / S" swatch="#ef4444" sku="TS-RED-S" barcode="8850123456789" focus={focus} />
        <VariantCard y={138} label="ดำ / M" swatch="#1f2937" sku="TS-BLK-M" barcode="8850123456796" focus={focus} />
      </svg>
    </div>
  );
}

// ── trigger + modal ──

export default function ProductCodesHelp({ focus = 'code' }: { focus?: ProductCodeKind }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip text="รหัสสินค้า · SKU · บาร์โค้ด ต่างกันยังไง" box="inline-flex">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="ดูความต่างของรหัสสินค้า SKU และบาร์โค้ด"
          className="inline-flex items-center justify-center w-5 h-5 rounded-full text-gray-400 hover:text-primary transition-colors"
        >
          <HelpCircle className="w-4 h-4" strokeWidth={2} />
        </button>
      </Tooltip>

      <Modal open={open} onClose={() => setOpen(false)} title="รหัสสินค้า · SKU · บาร์โค้ด ต่างกันยังไง" size="3xl">
        <div className="p-5 space-y-5">
          <CodesDiagram focus={focus} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {ITEMS.map(item => (
              <div
                key={item.key}
                className={`rounded-lg border p-4 space-y-2 ${
                  item.key === focus
                    ? 'border-primary bg-orange-50/60 dark:bg-orange-950/20'
                    : 'border-gray-200 dark:border-slate-700'
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-base font-semibold text-gray-900 dark:text-white">{item.title}</span>
                  <span className="code-text text-gray-500 dark:text-slate-400">{item.example}</span>
                </div>
                <p className="text-base text-gray-700 dark:text-slate-300">{item.what}</p>
                <p className="text-sm text-gray-600 dark:text-slate-400">
                  <span className="font-medium">ใช้ทำอะไร:</span> {item.use}
                </p>
                <p className="helper-text">{item.rule}</p>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
