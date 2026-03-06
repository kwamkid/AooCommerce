'use client';

import { useRef, useState, useEffect } from 'react';
import { Package, Trash2, AlertTriangle, X } from 'lucide-react';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import FormSelect from '@/components/ui/FormSelect';

// ── Types ──────────────────────────────────────────────────────────────────

export interface TableItem {
  variation_id: string;
  product_id?: string;
  product_name: string;
  variation_label?: string | null;
  sku?: string | null;
  product_code?: string | null;
  image?: string | null;
  quantity: number;
  unit_price?: number;
  unit_cost?: number;
  discount_value?: number;
  discount_type?: 'percent' | 'amount';
  reason?: string | null;
  qty_received?: number | null;
  po_quantity?: number | null;
  stock_source?: number | null;
  stock_dest?: number | null;
  /** GP breakdown text, e.g. "฿990 - GP30% = ฿693" */
  gpInfo?: string | null;
}

export type ColumnKey =
  | 'qty'
  | 'unit_price'
  | 'unit_cost'
  | 'discount'
  | 'reason'
  | 'stock_badge'
  | 'stock_source'
  | 'stock_dest'
  | 'qty_received'
  | 'po_quantity'
  | 'total';

interface ItemsTableProps {
  items: TableItem[];
  columns: ColumnKey[];

  // edit callbacks — omit all = readOnly
  onAdd?: (product: ProductSearchItem) => void;
  onUpdateField?: (idx: number, field: keyof TableItem, value: number | string) => void;
  onRemove?: (idx: number) => void;

  // product search
  products?: ProductSearchItem[];
  loadingProducts?: boolean;
  searchPlaceholder?: string;
  searchDisabledMessage?: string;

  // stock data
  stockMap?: Record<string, number>;

  // stock in dropdown
  showStockInSearch?: boolean;   // default: auto (true if stockMap has entries)
  disableOutOfStock?: boolean;   // disable items with stock <= 0 in dropdown

  // reason options
  reasonOptions?: { value: string; label: string }[];

  // misc
  emptyMessage?: string;
  showSummary?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function StockBadge({ qty, destStyle }: { qty: number | null | undefined; destStyle?: boolean }) {
  if (qty === null || qty === undefined) return <span className="text-xs text-gray-400 dark:text-slate-500">-</span>;
  if (destStyle) {
    const cls = qty <= 0
      ? 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-400'
      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{qty.toLocaleString()}</span>;
  }
  const cls = qty <= 0
    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    : qty <= 5
    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{qty.toLocaleString()}</span>;
}

const INPUT_CLS = 'px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]';

// ── Component ──────────────────────────────────────────────────────────────

export default function ItemsTable({
  items,
  columns,
  onAdd,
  onUpdateField,
  onRemove,
  products = [],
  loadingProducts = false,
  searchPlaceholder = '+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส...',
  searchDisabledMessage,
  stockMap = {},
  showStockInSearch,
  disableOutOfStock = false,
  reasonOptions = [
    { value: 'เสียหาย', label: 'เสียหาย' },
    { value: 'หมดอายุ', label: 'หมดอายุ' },
    { value: 'ตัวอย่าง', label: 'ตัวอย่าง' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
  ],
  emptyMessage = 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านล่าง',
  showSummary = true,
  inputRef: externalInputRef,
}: ItemsTableProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const searchRef = externalInputRef ?? internalInputRef;

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  // ESC to close lightbox
  useEffect(() => {
    if (!lightboxSrc) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightboxSrc(null); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [lightboxSrc]);

  const readOnly = !onAdd && !onUpdateField && !onRemove;

  const hasDiscount = columns.includes('discount');
  const hasPrice = columns.includes('unit_price');
  const hasCost = columns.includes('unit_cost');
  const hasReason = columns.includes('reason');
  const hasStock = columns.includes('stock_badge');
  const hasStockSource = columns.includes('stock_source');
  const hasStockDest = columns.includes('stock_dest');
  const hasQtyReceived = columns.includes('qty_received');
  const hasPoQty = columns.includes('po_quantity');
  const hasTotal = columns.includes('total');

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = items.reduce((s, i) => s + i.quantity * (i.unit_price ?? i.unit_cost ?? 0), 0);

  // Auto-detect whether to show stock in search dropdown
  const hasStockData = Object.keys(stockMap).length > 0;
  const shouldShowStockInSearch = showStockInSearch ?? hasStockData;

  // ── Product cell ──────────────────────────────────────────────────────

  function ProductCell({ item }: { item: TableItem }) {
    const name = item.product_name + (item.variation_label ? ` - ${item.variation_label}` : '');
    const sub = [item.product_code, item.sku && item.sku !== item.product_code && item.sku !== item.variation_label ? item.sku : null].filter(Boolean).join(' · ');
    return (
      <div className="flex items-center gap-3">
        {item.image
          ? <img src={item.image} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightboxSrc(item.image!)} />
          : <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
              <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
            </div>
        }
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">{name}</p>
          <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
            {sub && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{sub}</p>}
            {hasStock && <StockBadge qty={stockMap[item.variation_id]} />}
          </div>
          {item.gpInfo && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{item.gpInfo}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Qty stepper ───────────────────────────────────────────────────────

  function QtyCell({ item, idx }: { item: TableItem; idx: number }) {
    const poMismatch = hasPoQty && item.po_quantity != null && item.quantity !== item.po_quantity;
    if (readOnly) {
      return <span className="text-sm font-medium text-gray-900 dark:text-white">{item.quantity}</span>;
    }
    return (
      <div className={`inline-flex items-center border rounded-lg overflow-hidden ${
        poMismatch ? 'border-amber-400 dark:border-amber-500' : 'border-gray-300 dark:border-slate-600'
      }`}>
        <button type="button"
          onClick={() => onUpdateField!(idx, 'quantity', Math.max(1, item.quantity - 1))}
          disabled={item.quantity <= 1}
          className="w-7 h-8 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors text-sm border-r border-inherit"
        >−</button>
        <div className="relative">
          <input type="number" min="1"
            value={item.quantity}
            onChange={e => onUpdateField!(idx, 'quantity', parseInt(e.target.value) || 1)}
            className={`${poMismatch ? 'w-14 pr-7' : 'w-10'} h-8 px-1 text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none border-none`}
          />
          {poMismatch && (
            <span className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex items-center gap-px text-amber-600 dark:text-amber-400"
              title={`ต่างจาก PO ${Math.abs(item.quantity - (item.po_quantity ?? 0))} ชิ้น`}>
              <AlertTriangle className="w-3 h-3" />
              <span className="text-[9px] font-semibold">
                {item.quantity > (item.po_quantity ?? 0) ? '+' : ''}{item.quantity - (item.po_quantity ?? 0)}
              </span>
            </span>
          )}
        </div>
        <button type="button"
          onClick={() => onUpdateField!(idx, 'quantity', item.quantity + 1)}
          className="w-7 h-8 flex items-center justify-center text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors text-sm border-l border-inherit"
        >+</button>
      </div>
    );
  }

  // ── Desktop table ─────────────────────────────────────────────────────

  function DesktopTable() {
    return (
      <div className="hidden xl:block">
        <table className="data-table items-table w-full table-fixed">
          <thead className="data-thead">
            <tr>
              <th className="data-th">สินค้า</th>
              {hasStockSource && <th className="data-th text-center" style={{width:'8rem'}}>สต๊อกต้นทาง</th>}
              {hasStockDest && <th className="data-th text-center" style={{width:'8rem'}}>สต๊อกที่ร้าน</th>}
              {hasPoQty && <th className="data-th text-center" style={{width:'6rem'}}>จำนวน PO</th>}
              <th className="data-th text-center" style={{width:'8rem'}}>จำนวน</th>
              {hasQtyReceived && <th className="data-th text-center" style={{width:'4.5rem'}}>รับแล้ว</th>}
              {hasPrice && <th className="data-th text-right" style={{width:'7.5rem'}}>ราคา/ชิ้น</th>}
              {hasCost && <th className="data-th text-right" style={{width:'7.5rem'}}>ต้นทุน/ชิ้น</th>}
              {hasDiscount && <th className="data-th text-center" style={{width:'8rem'}}>ส่วนลด</th>}
              {hasReason && <th className="data-th" style={{width:'8rem'}}>เหตุผล</th>}
              {hasTotal && <th className="data-th text-right" style={{width:'6rem'}}>รวม</th>}
              {!readOnly && <th className="data-th" style={{width:'2.5rem'}}></th>}
            </tr>
          </thead>
          <tbody className="data-tbody">
            {items.map((item, idx) => {
              const lineTotal = item.quantity * (item.unit_price ?? item.unit_cost ?? 0);
              const stockQty = stockMap[item.variation_id];
              const isOverStock = hasStock && stockQty !== undefined && item.quantity > stockQty;
              return (
                <tr key={`${item.variation_id}-${idx}`} className="data-tr">
                  <td className="py-3"><ProductCell item={item} /></td>

                  {hasStockSource && (
                    <td className="py-3 text-center"><StockBadge qty={item.stock_source} /></td>
                  )}
                  {hasStockDest && (
                    <td className="py-3 text-center"><StockBadge qty={item.stock_dest} destStyle /></td>
                  )}
                  {hasPoQty && (
                    <td className="py-3 text-center">
                      <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                        {item.po_quantity?.toLocaleString() ?? '-'}
                      </span>
                    </td>
                  )}

                  <td className="py-3 text-center">
                    <QtyCell item={item} idx={idx} />
                    {isOverStock && !readOnly && (
                      <div className="flex items-center justify-center gap-1 mt-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-2.5 h-2.5" />เกินสต๊อก
                      </div>
                    )}
                  </td>

                  {hasQtyReceived && (
                    <td className="py-3 text-center">
                      {item.qty_received == null
                        ? <span className="text-xs text-gray-400">-</span>
                        : <span className={`text-sm font-medium ${item.qty_received < item.quantity ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                            {item.qty_received}
                            {item.qty_received < item.quantity && <span className="block text-xs">ขาด {item.quantity - item.qty_received}</span>}
                          </span>
                      }
                    </td>
                  )}

                  {hasPrice && (
                    <td className="py-3 text-right">
                      {readOnly
                        ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.unit_price ?? 0)}</span>
                        : <div className="relative inline-block">
                            <input type="number" min="0" step="0.01" value={item.unit_price ?? 0}
                              onChange={e => onUpdateField!(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                              className={`w-24 text-right pr-5 ${INPUT_CLS}`} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">฿</span>
                          </div>
                      }
                    </td>
                  )}
                  {hasCost && (
                    <td className="py-3 text-right">
                      {readOnly
                        ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.unit_cost ?? 0)}</span>
                        : <div className="relative inline-block">
                            <input type="number" min="0" step="0.01" value={item.unit_cost ?? 0}
                              onChange={e => onUpdateField!(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                              className={`w-24 text-right pr-5 ${INPUT_CLS}`} />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">฿</span>
                          </div>
                      }
                    </td>
                  )}
                  {hasDiscount && (
                    <td className="px-2 py-3">
                      <div className="flex items-stretch justify-center">
                        <input type="number" min="0" step="0.01"
                          max={item.discount_type === 'percent' ? 100 : undefined}
                          value={item.discount_value ?? 0}
                          onChange={e => onUpdateField!(idx, 'discount_value', parseFloat(e.target.value) || 0)}
                          disabled={readOnly}
                          className={`w-16 text-center rounded-l-lg rounded-r-none border-r-0 ${INPUT_CLS}`} />
                        <button type="button"
                          onClick={() => onUpdateField!(idx, 'discount_type', item.discount_type === 'percent' ? 'amount' : 'percent')}
                          disabled={readOnly}
                          className="px-2 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[26px] flex items-center justify-center disabled:opacity-50">
                          {item.discount_type === 'percent' ? '%' : '฿'}
                        </button>
                      </div>
                    </td>
                  )}
                  {hasReason && (
                    <td className="py-3">
                      {readOnly
                        ? <span className="text-sm text-gray-600 dark:text-slate-400">{item.reason || '-'}</span>
                        : <FormSelect
                            value={item.reason ?? ''}
                            onChange={v => onUpdateField!(idx, 'reason', v)}
                            options={reasonOptions.map(o => ({ id: o.value, label: o.label }))}
                            placeholder="เลือกเหตุผล"
                            searchThreshold={99}
                            portal
                          />
                      }
                    </td>
                  )}
                  {hasTotal && (
                    <td className="py-3 text-right">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">฿{fmt(lineTotal)}</span>
                    </td>
                  )}
                  {!readOnly && (
                    <td className="px-2 py-3 text-center">
                      <button type="button" onClick={() => onRemove!(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // ── Mobile cards ──────────────────────────────────────────────────────

  function MobileCards() {
    return (
      <div className="xl:hidden divide-y divide-gray-100 dark:divide-slate-700">
        {items.map((item, idx) => {
          const lineTotal = item.quantity * (item.unit_price ?? item.unit_cost ?? 0);
          const stockQty = stockMap[item.variation_id];
          const isOverStock = hasStock && stockQty !== undefined && item.quantity > stockQty;
          const poMismatch = hasPoQty && item.po_quantity != null && item.quantity !== item.po_quantity;
          return (
            <div key={`${item.variation_id}-${idx}`} className="p-3">
              <div className="flex items-start gap-3">
                {item.image
                  ? <img src={item.image} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => setLightboxSrc(item.image!)} />
                  : <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2">
                    {item.product_name}{item.variation_label ? ` - ${item.variation_label}` : ''}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {(item.product_code || item.sku) && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 truncate">
                        {[item.product_code, item.sku && item.sku !== item.product_code && item.sku !== item.variation_label ? item.sku : null].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {hasStock && <StockBadge qty={stockQty} />}
                    {hasStockSource && <StockBadge qty={item.stock_source} />}
                  </div>
                  {item.gpInfo && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">{item.gpInfo}</p>
                  )}
                </div>
                {!readOnly && (
                  <button type="button" onClick={() => onRemove!(idx)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded flex-shrink-0 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-end gap-2">
                {hasPoQty && item.po_quantity != null && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">จำนวน PO</label>
                    <div className="h-8 flex items-center justify-center border border-gray-200 dark:border-slate-600 rounded-lg text-sm bg-gray-50 dark:bg-slate-700/50 text-gray-500 dark:text-slate-400 font-medium px-3">
                      {item.po_quantity.toLocaleString()}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">จำนวน</label>
                  <QtyCell item={item} idx={idx} />
                </div>
                {hasQtyReceived && item.qty_received != null && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">รับแล้ว</label>
                    <span className={`text-sm font-medium ${item.qty_received < item.quantity ? 'text-amber-600' : 'text-green-600'}`}>
                      {item.qty_received}
                    </span>
                  </div>
                )}
                {hasStockDest && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">สต๊อกที่ร้าน</label>
                    <StockBadge qty={item.stock_dest} destStyle />
                  </div>
                )}
                {hasPrice && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">ราคา/ชิ้น</label>
                    {readOnly
                      ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.unit_price ?? 0)}</span>
                      : <div className="relative">
                          <input type="number" min="0" step="0.01" value={item.unit_price ?? 0}
                            onChange={e => onUpdateField!(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                            className={`w-24 text-right pr-5 ${INPUT_CLS}`} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">฿</span>
                        </div>
                    }
                  </div>
                )}
                {hasCost && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">ต้นทุน</label>
                    {readOnly
                      ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.unit_cost ?? 0)}</span>
                      : <div className="relative">
                          <input type="number" min="0" step="0.01" value={item.unit_cost ?? 0}
                            onChange={e => onUpdateField!(idx, 'unit_cost', parseFloat(e.target.value) || 0)}
                            className={`w-24 text-right pr-5 ${INPUT_CLS}`} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">฿</span>
                        </div>
                    }
                  </div>
                )}
                {hasDiscount && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">ส่วนลด</label>
                    <div className="flex items-stretch">
                      <input type="number" min="0" step="0.01"
                        max={item.discount_type === 'percent' ? 100 : undefined}
                        value={item.discount_value ?? 0}
                        onChange={e => onUpdateField!(idx, 'discount_value', parseFloat(e.target.value) || 0)}
                        disabled={readOnly}
                        className={`w-14 text-center rounded-l-lg rounded-r-none border-r-0 ${INPUT_CLS}`} />
                      <button type="button"
                        onClick={() => onUpdateField!(idx, 'discount_type', item.discount_type === 'percent' ? 'amount' : 'percent')}
                        disabled={readOnly}
                        className="px-1.5 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 min-w-[24px] flex items-center justify-center disabled:opacity-50">
                        {item.discount_type === 'percent' ? '%' : '฿'}
                      </button>
                    </div>
                  </div>
                )}
                {hasReason && (
                  <div className="flex-1 min-w-[140px]">
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">เหตุผล</label>
                    {readOnly
                      ? <span className="text-sm text-gray-600 dark:text-slate-400">{item.reason || '-'}</span>
                      : <FormSelect
                          value={item.reason ?? ''}
                          onChange={v => onUpdateField!(idx, 'reason', v)}
                          options={reasonOptions.map(o => ({ id: o.value, label: o.label }))}
                          placeholder="เลือกเหตุผล"
                          searchThreshold={99}
                          portal
                        />
                    }
                  </div>
                )}
                {hasTotal && (
                  <div className="ml-auto text-right">
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">รวม</label>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">฿{fmt(lineTotal)}</span>
                  </div>
                )}
              </div>

              {(isOverStock || poMismatch) && !readOnly && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {isOverStock && 'จำนวนเกินสต๊อกที่มี'}
                  {poMismatch && `ต่างจาก PO ${Math.abs(item.quantity - (item.po_quantity ?? 0))} ชิ้น`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <>
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
        {/* Empty state — search on top when no items */}
        {items.length === 0 && !readOnly && (
          <>
            <div className="px-4 py-3">
              {searchDisabledMessage
                ? <p className="text-sm text-gray-400 dark:text-slate-500">{searchDisabledMessage}</p>
                : <ProductSearchInput
                    products={products}
                    onSelect={onAdd!}
                    loading={loadingProducts}
                    placeholder={searchPlaceholder}
                    inputRef={searchRef as React.RefObject<HTMLInputElement>}
                    isAlreadyAdded={p => items.some(i => i.variation_id === p.id)}
                    isDisabled={disableOutOfStock ? p => (stockMap[p.id] ?? 1) <= 0 : undefined}
                    renderExtra={shouldShowStockInSearch ? (p) => {
                      const qty = stockMap[p.id];
                      if (qty === undefined) return null;
                      return (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                          qty <= 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                          : qty <= 5 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                        }`}>
                          {qty <= 0 ? 'หมด' : `สต๊อก ${qty}`}
                        </span>
                      );
                    } : undefined}
                  />
              }
            </div>
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-slate-500 border-t border-gray-100 dark:border-slate-700">
              <Package className="w-14 h-14 mb-3 opacity-40" />
              <p className="text-sm">{emptyMessage}</p>
            </div>
          </>
        )}

        {items.length === 0 && readOnly && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-slate-500">
            <Package className="w-14 h-14 mb-3 opacity-40" />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        )}

        {/* Items — search appended below */}
        {items.length > 0 && (
          <>
            <DesktopTable />
            <MobileCards />
            {!readOnly && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                {searchDisabledMessage
                  ? <p className="text-sm text-gray-400 dark:text-slate-500">{searchDisabledMessage}</p>
                  : <ProductSearchInput
                      products={products}
                      onSelect={onAdd!}
                      loading={loadingProducts}
                      placeholder={searchPlaceholder}
                      inputRef={searchRef as React.RefObject<HTMLInputElement>}
                      isAlreadyAdded={p => items.some(i => i.variation_id === p.id)}
                      isDisabled={disableOutOfStock ? p => (stockMap[p.id] ?? 1) <= 0 : undefined}
                      renderExtra={shouldShowStockInSearch ? (p) => {
                        const qty = stockMap[p.id];
                        if (qty === undefined) return null;
                        return (
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                            qty <= 0 ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                            : qty <= 5 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
                          }`}>
                            {qty <= 0 ? 'หมด' : `สต๊อก ${qty}`}
                          </span>
                        );
                      } : undefined}
                    />
                }
              </div>
            )}
          </>
        )}

        {/* Summary footer */}
        {showSummary && items.length > 0 && (hasTotal || hasCost || hasPrice) && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 rounded-b-xl flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-slate-400">
              {items.length} รายการ · {totalQty.toLocaleString()} ชิ้น
            </span>
            <span className="text-sm font-semibold text-gray-900 dark:text-white">฿{fmt(totalAmount)}</span>
          </div>
        )}
        {showSummary && items.length > 0 && !hasTotal && !hasCost && !hasPrice && (
          <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 rounded-b-xl flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-slate-400">{items.length} รายการ</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              จำนวนรวม: {totalQty.toLocaleString()} ชิ้น
            </span>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightboxSrc(null)}
          role="dialog"
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxSrc}
            alt="Product"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
