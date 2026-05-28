'use client';

import { Fragment, useRef, useState, useEffect } from 'react';
import { Package, Trash2, AlertTriangle, X, Gift } from 'lucide-react';
import ProductSearchInput, { type ProductSearchItem, type SearchMode } from '@/components/ui/ProductSearchInput';
import FormSelect from '@/components/ui/FormSelect';
import DiscountInput from '@/components/ui/DiscountInput';
import PostfixInput from '@/components/ui/PostfixInput';
import NumberInput from '@/components/ui/NumberInput';
import { productDisplayName } from '@/lib/product-display';

// ── Types ──────────────────────────────────────────────────────────────────

export interface PromotionComponent {
  variation_id: string;
  product_name: string;
  product_code?: string | null;
  sku?: string | null;
  barcode?: string | null;
  image?: string | null;
  role: string;
  quantity: number;
  default_price?: number;
  special_price?: number | null;
}

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
  /** Promotion data */
  promotion_id?: string | null;
  promotion_name?: string | null;
  promotion_type?: string | null;
  promotion_components?: PromotionComponent[];
  /** Item role for promotion forms */
  role?: string | null;
  /** Special price for buy_get_discount items */
  special_price?: number | null;
  /** Max price across variations — for price range display */
  max_price?: number | null;
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
  | 'total'
  | 'role'
  | 'special_price';

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
  /** Disable over-stock warning (e.g. for PO — stock is incoming, not outgoing) */
  disableStockWarning?: boolean;
  /** Disable stock_dest over-stock warning (e.g. replenishment — adding stock, not deducting) */
  disableDestWarning?: boolean;

  // reason options
  reasonOptions?: { value: string; label: string }[];

  // role column options (for promotion forms)
  roleOptions?: { id: string; label: string }[];

  // misc
  emptyMessage?: string;
  showSummary?: boolean;
  /** Make unit_price column display-only (not editable) even when table is editable */
  priceReadOnly?: boolean;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Search mode: 'variation' (default) or 'product' (grouped by product) */
  searchMode?: SearchMode;
  /** Force mobile/compact card layout regardless of viewport width */
  forceCompact?: boolean;
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

const INPUT_CLS = 'px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:bg-gray-100 dark:disabled:bg-slate-800 disabled:text-gray-400 dark:disabled:text-slate-500 disabled:cursor-not-allowed';

function RoleBadge({ role }: { role: string }) {
  switch (role) {
    case 'gift':
      return <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400"><Gift className="w-2.5 h-2.5" />แถมฟรี</span>;
    case 'discounted':
      return <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">ราคาพิเศษ</span>;
    default:
      return null;
  }
}

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
  disableStockWarning = false,
  disableDestWarning = false,
  reasonOptions = [
    { value: 'เสียหาย', label: 'เสียหาย' },
    { value: 'หมดอายุ', label: 'หมดอายุ' },
    { value: 'ตัวอย่าง', label: 'ตัวอย่าง' },
    { value: 'อื่นๆ', label: 'อื่นๆ' },
  ],
  roleOptions = [],
  emptyMessage = 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านล่าง',
  showSummary = true,
  priceReadOnly = false,
  inputRef: externalInputRef,
  searchMode = 'variation',
  forceCompact = false,
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
  const hasRole = columns.includes('role');
  const hasSpecialPrice = columns.includes('special_price');

  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalAmount = items.reduce((s, i) => {
    const sub = i.quantity * (i.unit_price ?? i.unit_cost ?? 0);
    const disc = i.discount_type === 'percent'
      ? sub * ((i.discount_value || 0) / 100)
      : (i.discount_value || 0);
    return s + sub - disc;
  }, 0);

  // Auto-detect whether to show stock in search dropdown
  const hasStockData = Object.keys(stockMap).length > 0;
  const shouldShowStockInSearch = showStockInSearch ?? hasStockData;

  // ── Product cell ──────────────────────────────────────────────────────

  function ProductCell({ item, idx }: { item: TableItem; idx?: number }) {
    const hasPromo = item.promotion_components && item.promotion_components.length > 0;
    const name = productDisplayName(item);
    // Build subtitle: SKU + price (when no price column)
    const subParts: string[] = [];
    if (item.sku) subParts.push(item.sku);
    if (item.unit_price != null && !hasPrice) {
      if (item.max_price && item.max_price > item.unit_price) {
        subParts.push(`฿${fmt(item.unit_price)} - ฿${fmt(item.max_price)}`);
      } else if (item.unit_price > 0) {
        subParts.push(`฿${fmt(item.unit_price)}`);
      }
    }
    const sub = subParts.join(' | ');
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
            {hasPromo && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                โปรโมชั่น ({item.promotion_components!.length} รายการ)
              </span>
            )}
            {!hasPromo && sub && <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{sub}</p>}
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
        <div className="relative">
          <NumberInput min="1"
            value={item.quantity}
            onChange={(n) => onUpdateField!(idx, 'quantity', n)}
            onBlur={() => {
              if (!item.quantity || item.quantity < 1) {
                onUpdateField!(idx, 'quantity', 1);
              }
            }}
            className={`w-full ${poMismatch ? 'pr-7' : ''} h-8 px-2 text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none border-none`}
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
      </div>
    );
  }

  // ── Desktop table ─────────────────────────────────────────────────────

  function DesktopTable() {
    return (
      <div className={forceCompact ? 'hidden' : 'hidden xl:block'}>
        <table className="data-table items-table w-full table-fixed">
          <thead className="data-thead">
            <tr>
              <th className="data-th">สินค้า</th>
              {hasRole && <th className="data-th" style={{width:'9rem'}}>บทบาท</th>}
              {hasStockSource && <th className="data-th text-center" style={{width:'5rem'}}>สต๊อกต้นทาง</th>}
              {hasStockDest && <th className="data-th text-center" style={{width:'5rem'}}>สต๊อกที่ร้าน</th>}
              {hasPoQty && <th className="data-th text-center" style={{width:'5rem'}}>จำนวน PO</th>}
              <th className="data-th text-center" style={{width:'4.5rem'}}>จำนวน</th>
              {hasQtyReceived && <th className="data-th text-center" style={{width:'4rem'}}>รับแล้ว</th>}
              {hasPrice && <th className="data-th text-right" style={{width:'7rem'}}>ราคา/ชิ้น</th>}
              {hasCost && <th className="data-th text-right" style={{width:'7rem'}}>ต้นทุน/ชิ้น</th>}
              {hasSpecialPrice && <th className="data-th text-right" style={{width:'7rem'}}>ราคาพิเศษ</th>}
              {hasDiscount && <th className="data-th text-center" style={{width:'7rem'}}>ส่วนลด</th>}
              {hasReason && <th className="data-th" style={{width:'7rem'}}>เหตุผล</th>}
              {hasTotal && <th className="data-th text-right" style={{width:'6rem'}}>รวม</th>}
              {!readOnly && <th className="data-th" style={{width:'2rem'}}></th>}
            </tr>
          </thead>
          <tbody className="data-tbody">
            {items.map((item, idx) => {
              const subtotal = item.quantity * (item.unit_price ?? item.unit_cost ?? 0);
              const discAmt = item.discount_type === 'percent'
                ? subtotal * ((item.discount_value || 0) / 100)
                : (item.discount_value || 0);
              const lineTotal = subtotal - discAmt;
              const stockQty = stockMap[item.variation_id];
              const isOverStock = !disableStockWarning && hasStock && stockQty !== undefined && item.quantity > stockQty;
              const destQty = item.stock_dest;
              const isOverDest = !disableDestWarning && hasStockDest && destQty !== undefined && destQty !== null && item.quantity > destQty;
              const hasPromoComponents = item.promotion_components && item.promotion_components.length > 0;
              return (
                <Fragment key={`${item.variation_id}-${idx}`}>
                <tr className="data-tr">
                  <td className="py-3">{ProductCell({ item, idx })}</td>

                  {hasRole && (
                    <td className="py-3">
                      {readOnly
                        ? <span className="text-sm text-gray-600 dark:text-slate-400">{roleOptions.find(r => r.id === item.role)?.label ?? item.role ?? '-'}</span>
                        : <FormSelect
                            value={item.role ?? ''}
                            onChange={v => onUpdateField!(idx, 'role', v)}
                            options={roleOptions}
                            searchThreshold={99}
                            portal
                          />
                      }
                    </td>
                  )}

                  {hasStockSource && (
                    <td className="py-3 text-center"><StockBadge qty={item.stock_source} /></td>
                  )}
                  {hasStockDest && (
                    <td className="py-3 text-center">
                      <StockBadge qty={item.stock_dest} destStyle />
                    </td>
                  )}
                  {hasPoQty && (
                    <td className="py-3 text-center">
                      <span className="text-sm text-gray-500 dark:text-slate-400 font-medium">
                        {item.po_quantity?.toLocaleString() ?? '-'}
                      </span>
                    </td>
                  )}

                  <td className="py-3 text-center">
                    {QtyCell({ item, idx })}
                    {(isOverDest || isOverStock) && !readOnly && (
                      <div className={`flex items-center justify-center gap-0.5 mt-0.5 text-[10px] ${isOverDest ? 'text-red-500' : 'text-amber-600 dark:text-amber-400'}`}>
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
                      {(readOnly || priceReadOnly || !!item.promotion_id)
                        ? <span className="text-sm text-gray-900 dark:text-white">
                            {item.max_price && item.max_price > (item.unit_price ?? 0)
                              ? `฿${fmt(item.unit_price ?? 0)} - ฿${fmt(item.max_price)}`
                              : `฿${fmt(item.unit_price ?? 0)}`
                            }
                          </span>
                        : <PostfixInput
                            value={item.unit_price || ''}
                            onChange={v => onUpdateField!(idx, 'unit_price', v === '' ? 0 : parseFloat(v) || 0)}
                            onBlur={() => { if (!item.unit_price) onUpdateField!(idx, 'unit_price', 0); }}
                            postfix="฿"
                            type="number"
                            min={0}
                            step={0.01}
                            compact
                            inputClassName="w-full"
                          />
                      }
                    </td>
                  )}
                  {hasCost && (
                    <td className="py-3 text-right">
                      {readOnly
                        ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.unit_cost ?? 0)}</span>
                        : <PostfixInput
                            value={item.unit_cost || ''}
                            onChange={v => onUpdateField!(idx, 'unit_cost', v === '' ? 0 : parseFloat(v) || 0)}
                            onBlur={() => { if (!item.unit_cost) onUpdateField!(idx, 'unit_cost', 0); }}
                            postfix="฿"
                            type="number"
                            min={0}
                            step={0.01}
                            compact
                            inputClassName="w-full"
                          />
                      }
                    </td>
                  )}
                  {hasSpecialPrice && (
                    <td className="py-3 text-right">
                      {item.role === 'discounted'
                        ? (readOnly
                            ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.special_price ?? 0)}</span>
                            : <PostfixInput
                                value={item.special_price ?? ''}
                                onChange={v => onUpdateField!(idx, 'special_price', v === '' ? 0 : parseFloat(v))}
                                postfix="฿"
                                type="number"
                                min={0}
                                step={0.01}
                                placeholder="0"
                                compact
                                inputClassName="w-full"
                              />
                          )
                        : <span className="text-sm text-gray-400">-</span>
                      }
                    </td>
                  )}
                  {hasDiscount && (
                    <td className="px-2 py-3">
                      <DiscountInput
                        value={item.discount_value ? String(item.discount_value) : ''}
                        discountType={item.discount_type === 'percent' ? 'percent' : 'fixed_discount'}
                        onValueChange={v => onUpdateField!(idx, 'discount_value', v === '' ? 0 : parseFloat(v) || 0)}
                        onTypeChange={t => onUpdateField!(idx, 'discount_type', t === 'percent' ? 'percent' : 'amount')}
                        onBlur={() => { if (!item.discount_value) onUpdateField!(idx, 'discount_value', 0); }}
                        disabled={readOnly || !!item.promotion_id}
                        compact
                      />
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
                {/* Promotion component sub-rows */}
                {hasPromoComponents && item.promotion_components!.map((comp, ci) => (
                  <tr key={`promo-${idx}-${ci}`} className="bg-purple-50/50 dark:bg-purple-900/10">
                    <td className="py-2 pl-16">
                      <div className="flex items-center gap-2">
                        <div className="w-1 h-8 rounded bg-purple-300 dark:bg-purple-700 flex-shrink-0" />
                        {comp.image
                          ? <img src={comp.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                          : <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                              <Package className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
                            </div>
                        }
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-slate-200 line-clamp-2">{comp.product_name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {comp.product_code && (
                              <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{comp.product_code}</p>
                            )}
                            <RoleBadge role={comp.role} />
                          </div>
                        </div>
                      </div>
                    </td>
                    {hasRole && <td />}
                    {hasStockSource && <td />}
                    {hasStockDest && <td />}
                    {hasPoQty && <td />}
                    <td className="py-2 text-center">
                      <span className="text-sm text-gray-600 dark:text-slate-300">{comp.quantity}</span>
                    </td>
                    {hasQtyReceived && <td />}
                    {hasPrice && (
                      <td className="py-2 text-right">
                        {comp.special_price != null && comp.special_price !== comp.default_price ? (
                          <div>
                            <span className="text-xs text-gray-400 dark:text-slate-500 line-through">฿{fmt(comp.default_price ?? 0)}</span>
                            <span className="text-sm text-primary font-medium ml-1">฿{fmt(comp.special_price)}</span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-600 dark:text-slate-300">฿{fmt(comp.default_price ?? 0)}</span>
                        )}
                      </td>
                    )}
                    {hasCost && <td />}
                    {hasSpecialPrice && <td />}
                    {hasDiscount && <td />}
                    {hasReason && <td />}
                    {hasTotal && <td />}
                    {!readOnly && <td />}
                  </tr>
                ))}
                </Fragment>
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
      <div className={`${forceCompact ? 'divide-y divide-gray-100 dark:divide-slate-700' : 'xl:hidden divide-y divide-gray-100 dark:divide-slate-700'} min-w-0`}>
        {items.map((item, idx) => {
          const mSubtotal = item.quantity * (item.unit_price ?? item.unit_cost ?? 0);
          const mDiscAmt = item.discount_type === 'percent'
            ? mSubtotal * ((item.discount_value || 0) / 100)
            : (item.discount_value || 0);
          const lineTotal = mSubtotal - mDiscAmt;
          const stockQty = stockMap[item.variation_id];
          const isOverStock = hasStock && stockQty !== undefined && item.quantity > stockQty;
          const destQty = item.stock_dest;
          const isOverDest = hasStockDest && destQty !== undefined && destQty !== null && item.quantity > destQty;
          const poMismatch = hasPoQty && item.po_quantity != null && item.quantity !== item.po_quantity;
          return (
            <div key={`${item.variation_id}-${idx}`} className="p-3 overflow-hidden">
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
                    {productDisplayName(item)}
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {item.promotion_components && item.promotion_components.length > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                        โปรโมชั่น ({item.promotion_components.length} รายการ)
                      </span>
                    ) : (() => {
                      const parts: string[] = [];
                      if (item.sku) parts.push(item.sku);
                      if (item.unit_price != null && !hasPrice) {
                        if (item.max_price && item.max_price > item.unit_price) {
                          parts.push(`฿${fmt(item.unit_price)} - ฿${fmt(item.max_price)}`);
                        } else if (item.unit_price > 0) {
                          parts.push(`฿${fmt(item.unit_price)}`);
                        }
                      }
                      const mobileSub = parts.join(' | ');
                      return mobileSub ? <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{mobileSub}</p> : null;
                    })()}
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
                {hasRole && (
                  <div className="min-w-[120px]">
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">บทบาท</label>
                    {readOnly
                      ? <span className="text-sm text-gray-600 dark:text-slate-400">{roleOptions.find(r => r.id === item.role)?.label ?? item.role ?? '-'}</span>
                      : <FormSelect
                          value={item.role ?? ''}
                          onChange={v => onUpdateField!(idx, 'role', v)}
                          options={roleOptions}
                          searchThreshold={99}
                          portal
                        />
                    }
                  </div>
                )}
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
                  {QtyCell({ item, idx })}
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
                    {(readOnly || priceReadOnly)
                      ? <span className="text-sm text-gray-900 dark:text-white">
                          {item.max_price && item.max_price > (item.unit_price ?? 0)
                            ? `฿${fmt(item.unit_price ?? 0)} - ฿${fmt(item.max_price)}`
                            : `฿${fmt(item.unit_price ?? 0)}`
                          }
                        </span>
                      : <div className="relative">
                          <NumberInput min="0" step="0.01" value={item.unit_price ?? 0}
                            onChange={(n) => onUpdateField!(idx, 'unit_price', n)}
                            onBlur={() => { if (!item.unit_price) onUpdateField!(idx, 'unit_price', 0); }}
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
                          <NumberInput min="0" step="0.01" value={item.unit_cost ?? 0}
                            onChange={(n) => onUpdateField!(idx, 'unit_cost', n)}
                            onBlur={() => { if (!item.unit_cost) onUpdateField!(idx, 'unit_cost', 0); }}
                            className={`w-24 text-right pr-5 ${INPUT_CLS}`} />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">฿</span>
                        </div>
                    }
                  </div>
                )}
                {hasSpecialPrice && item.role === 'discounted' && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-slate-400 mb-0.5 block">ราคาพิเศษ</label>
                    {readOnly
                      ? <span className="text-sm text-gray-900 dark:text-white">฿{fmt(item.special_price ?? 0)}</span>
                      : <div className="relative">
                          <NumberInput min="0" step="0.01" value={item.special_price ?? 0}
                            onChange={(n) => onUpdateField!(idx, 'special_price', n)}
                            placeholder="0"
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
                      <NumberInput min="0" step="0.01"
                        max={item.discount_type === 'percent' ? 100 : undefined}
                        value={item.discount_value ?? 0}
                        onChange={(n) => onUpdateField!(idx, 'discount_value', n)}
                        onBlur={() => { if (!item.discount_value) onUpdateField!(idx, 'discount_value', 0); }}
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

              {isOverDest && !readOnly && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-red-500">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />จำนวนเกินสต๊อกที่ร้าน (มี {destQty})
                </div>
              )}
              {(isOverStock || poMismatch) && !isOverDest && !readOnly && (
                <div className="mt-1.5 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                  {isOverStock && 'จำนวนเกินสต๊อกที่มี'}
                  {poMismatch && `ต่างจาก PO ${Math.abs(item.quantity - (item.po_quantity ?? 0))} ชิ้น`}
                </div>
              )}

              {/* Promotion components (mobile) */}
              {item.promotion_components && item.promotion_components.length > 0 && (
                <div className="mt-2 ml-3 pl-3 border-l-2 border-purple-200 dark:border-purple-800 space-y-2">
                  {item.promotion_components.map((comp, ci) => (
                    <div key={ci} className="flex items-center gap-2">
                      {comp.image
                        ? <img src={comp.image} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                        : <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                            <Package className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-slate-200 line-clamp-2">{comp.product_name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {comp.product_code && (
                            <span className="text-xs text-gray-400 dark:text-slate-500 truncate">{comp.product_code}</span>
                          )}
                          <RoleBadge role={comp.role} />
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <span className="text-sm text-gray-600 dark:text-slate-300">×{comp.quantity}</span>
                        {comp.special_price != null && comp.special_price !== comp.default_price ? (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400 line-through">฿{fmt(comp.default_price ?? 0)}</span>
                            <span className="text-xs text-primary font-medium">฿{fmt(comp.special_price)}</span>
                          </div>
                        ) : comp.default_price ? (
                          <div className="text-xs text-gray-500 dark:text-slate-400">฿{fmt(comp.default_price)}</div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────

  // When the form has no items yet, the dashed-green ProductSearchInput is
  // the entire empty state — render it WITHOUT the outer card border + the
  // redundant "ยังไม่มีสินค้า" hint. The search input itself reads
  // "+ เพิ่มสินค้าหรือโปรโมชั่น — พิมพ์ชื่อหรือรหัส..." which already
  // explains what to do.
  const isEmptyEditable = items.length === 0 && !readOnly && onAdd;

  return (
    <>
      <div className={isEmptyEditable
        ? ''
        : 'bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700'}
      >
        {isEmptyEditable && (
          searchDisabledMessage
            ? <p className="text-sm text-gray-400 dark:text-slate-500 px-1 py-2">{searchDisabledMessage}</p>
            : <ProductSearchInput
                products={products}
                onSelect={onAdd}
                loading={loadingProducts}
                placeholder={searchPlaceholder}
                inputRef={searchRef as React.RefObject<HTMLInputElement>}
                mode={searchMode}
                isAlreadyAdded={p => items.some(i => searchMode === 'product' ? i.product_id === p.product_id : i.variation_id === p.id)}
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
        )}

        {items.length === 0 && readOnly && (
          <div className="flex items-center justify-center gap-2 py-6 text-gray-400 dark:text-slate-500">
            <Package className="w-5 h-5 opacity-50" />
            <p className="text-sm">{emptyMessage}</p>
          </div>
        )}

        {/* Items — search appended below */}
        {items.length > 0 && (
          <>
            {DesktopTable()}
            {MobileCards()}
            {!readOnly && onAdd && (
              <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
                {searchDisabledMessage
                  ? <p className="text-sm text-gray-400 dark:text-slate-500">{searchDisabledMessage}</p>
                  : <ProductSearchInput
                      products={products}
                      onSelect={onAdd}
                      loading={loadingProducts}
                      placeholder={searchPlaceholder}
                      inputRef={searchRef as React.RefObject<HTMLInputElement>}
                      mode={searchMode}
                      isAlreadyAdded={p => items.some(i => searchMode === 'product' ? i.product_id === p.product_id : i.variation_id === p.id)}
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
