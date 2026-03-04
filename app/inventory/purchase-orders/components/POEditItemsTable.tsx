'use client';

import type { EditItem } from './types';
import { formatCurrency } from './types';
import { productDisplayName, productSubtitle } from '../../components/types';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { Package, Package2, Factory, Trash2 } from 'lucide-react';

const getDisplayName = (item: EditItem) => productDisplayName({ product_name: item.name, product_code: item.code, variation_label: item.variation_label, sku: item.sku });
const getSubtitle = (item: EditItem) => productSubtitle({ product_code: item.code, sku: item.sku });

interface Props {
  items: EditItem[];
  supplierId: string;
  supplierProducts: ProductSearchItem[];
  loadingProducts: boolean;
  stockMap: Record<string, number>;
  onAddProduct: (product: ProductSearchItem) => void;
  onUpdateQty: (idx: number, v: number) => void;
  onUpdateCost: (idx: number, v: number) => void;
  onRemove: (idx: number) => void;
}

export default function POEditItemsTable({
  items, supplierId, supplierProducts, loadingProducts, stockMap,
  onAddProduct, onUpdateQty, onUpdateCost, onRemove,
}: Props) {
  const totalAmount = items.reduce((s, i) => s + (i.quantity * i.unit_cost), 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
      {/* Desktop table */}
      {items.length > 0 && (
        <div className="hidden md:block overflow-x-auto">
          <table className="data-table">
            <thead className="data-thead">
              <tr>
                <th className="data-th">สินค้า</th>
                <th className="data-th text-center w-28 whitespace-nowrap">สต๊อก</th>
                <th className="data-th text-center w-24">จำนวน</th>
                <th className="data-th text-center w-28">ต้นทุน/ชิ้น</th>
                <th className="data-th text-right w-28">รวม</th>
                <th className="data-th w-12"></th>
              </tr>
            </thead>
            <tbody className="data-tbody">
              {items.map((item, idx) => (
                <tr key={`${item.variation_id}-${idx}`} className="data-tr">
                  <td className="px-6 py-3">
                    <div className="flex items-center gap-2.5">
                      {item.image ? <img src={item.image} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" /> : <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0"><Package className="w-5 h-5 text-gray-400" /></div>}
                      <div className="min-w-0">
                        <div className="data-primary text-gray-900 dark:text-white line-clamp-2">{getDisplayName(item)}</div>
                        <span className="data-secondary text-gray-400 dark:text-slate-500">{getSubtitle(item)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 text-center">
                    {(() => { const st = stockMap[item.variation_id] ?? null; if (st === null) return <span className="text-xs text-gray-400">-</span>; return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${st <= 0 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : st <= 5 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>{st.toLocaleString()}</span>; })()}
                  </td>
                  <td className="px-6 py-3 text-center">
                    <input type="number" min="1" value={item.quantity} onChange={e => onUpdateQty(idx, parseInt(e.target.value) || 1)} className="w-20 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]" />
                  </td>
                  <td className="px-6 py-3 text-center">
                    <input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => onUpdateCost(idx, parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]" />
                  </td>
                  <td className="px-6 py-3 text-right"><span className="data-number text-gray-900 dark:text-white">฿{formatCurrency(item.quantity * item.unit_cost)}</span></td>
                  <td className="px-2 py-3 text-center">
                    <button type="button" onClick={() => onRemove(idx)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {items.length > 0 && (
        <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
          {items.map((item, idx) => (
            <div key={`${item.variation_id}-${idx}`} className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  {item.image ? <img src={item.image} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0" /> : <div className="w-12 h-12 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0"><Package className="w-6 h-6 text-gray-400" /></div>}
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white text-sm line-clamp-2">{getDisplayName(item)}</p>
                    <p className="text-xs text-gray-400 dark:text-slate-500 truncate">{getSubtitle(item)}</p>
                  </div>
                </div>
                <button type="button" onClick={() => onRemove(idx)} className="p-1.5 text-gray-400 hover:text-red-600 rounded-lg flex-shrink-0"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="mt-2.5 grid grid-cols-3 gap-2">
                <div><label className="text-xs text-gray-500 mb-0.5 block">จำนวน</label><input type="number" min="1" value={item.quantity} onChange={e => onUpdateQty(idx, parseInt(e.target.value) || 1)} className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" /></div>
                <div><label className="text-xs text-gray-500 mb-0.5 block">ต้นทุน</label><input type="number" min="0" step="0.01" value={item.unit_cost} onChange={e => onUpdateCost(idx, parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-center text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white" /></div>
                <div><label className="text-xs text-gray-500 mb-0.5 block">รวม</label><div className="px-2 py-1.5 text-sm text-right font-medium text-gray-900 dark:text-white">฿{formatCurrency(item.quantity * item.unit_cost)}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Product search */}
      {supplierId ? (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
          <ProductSearchInput products={supplierProducts} onSelect={onAddProduct} loading={loadingProducts} placeholder="ค้นหาสินค้าของ supplier นี้..." isAlreadyAdded={(p) => items.some(i => i.variation_id === p.id)} />
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-gray-100 dark:border-slate-700">
          <p className="text-sm text-gray-400 dark:text-slate-500">เลือก Supplier ก่อนเพื่อค้นหาสินค้า</p>
        </div>
      )}

      {/* Empty states */}
      {items.length === 0 && supplierId && (
        <div className="text-center py-8 text-gray-400 dark:text-slate-500"><Package2 className="w-10 h-10 mx-auto mb-2" /><p className="text-sm">เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน</p></div>
      )}
      {!supplierId && (
        <div className="text-center py-8 text-gray-400 dark:text-slate-500"><Factory className="w-10 h-10 mx-auto mb-2 opacity-50" /><p className="text-sm">เลือก Supplier ก่อน</p></div>
      )}

      {/* Summary */}
      {items.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-700 rounded-b-lg flex items-center justify-between">
          <span className="text-sm text-gray-500 dark:text-slate-400">รวม {items.length} รายการ | {totalQty.toLocaleString()} ชิ้น</span>
          <span className="text-sm font-semibold text-gray-900 dark:text-white">฿{formatCurrency(totalAmount)}</span>
        </div>
      )}
    </div>
  );
}
