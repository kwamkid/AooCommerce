'use client';

import type { POItem } from './types';
import { itemStatusBadge, formatCurrency } from './types';
import { Package2, CheckCircle2 } from 'lucide-react';

interface Props {
  items: POItem[];
  totalAmount: number;
}

export default function POViewItemsTable({ items, totalAmount }: Props) {
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const totalReceived = items.reduce((s, i) => s + i.received_quantity, 0);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white">รายการสินค้า ({items.length} รายการ)</h3>
        <div className="text-sm text-gray-500 dark:text-slate-400">รับแล้ว {totalReceived}/{totalQty} ชิ้น</div>
      </div>

      {/* Desktop */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="data-table-fixed">
          <thead><tr className="data-thead-tr">
            <th className="data-th w-[88px]"></th>
            <th className="data-th">สินค้า</th>
            <th className="data-th w-[80px] text-center">สั่ง</th>
            <th className="data-th w-[80px] text-center">รับแล้ว</th>
            <th className="data-th w-[80px] text-center">คงเหลือ</th>
            <th className="data-th w-[100px] text-right">ต้นทุน/ชิ้น</th>
            <th className="data-th w-[100px] text-right">รวม</th>
            <th className="data-th w-[80px] text-center">สถานะ</th>
          </tr></thead>
          <tbody className="data-tbody">
            {items.map(item => {
              const remaining = item.quantity - item.received_quantity;
              const ib = itemStatusBadge(item.quantity, item.received_quantity);
              return (
                <tr key={item.id} className="data-tr">
                  <td className="px-3 py-3">
                    {item.variation?.product?.image ? <img src={item.variation.product.image} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200 dark:border-slate-600" /> : <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center"><Package2 className="w-6 h-6 text-gray-400" /></div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="data-primary text-gray-900 dark:text-white">{item.variation?.product?.name || '-'}{item.variation?.variation_label && item.variation.variation_label !== 'default' ? ` - ${item.variation.variation_label}` : ''}</div>
                    <div className="data-secondary text-gray-500 dark:text-slate-400">{item.variation?.product?.code}{item.variation?.sku && <span className="ml-2">SKU: {item.variation.sku}</span>}</div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-900 dark:text-white font-medium">{item.quantity}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium text-green-600 dark:text-green-400">{item.received_quantity}</td>
                  <td className="px-4 py-3 text-center text-sm font-medium"><span className={remaining > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}>{remaining}</span></td>
                  <td className="px-4 py-3 text-right text-sm text-gray-700 dark:text-slate-300">฿{formatCurrency(item.unit_cost)}</td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white">฿{formatCurrency(item.quantity * item.unit_cost)}</td>
                  <td className="px-4 py-3 text-center"><span className={`text-xs font-medium ${ib.color}`}>{item.received_quantity >= item.quantity ? <CheckCircle2 className="w-4 h-4 inline" /> : ib.label}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile */}
      <div className="sm:hidden divide-y divide-gray-100 dark:divide-slate-700">
        {items.map(item => {
          const remaining = item.quantity - item.received_quantity;
          const ib = itemStatusBadge(item.quantity, item.received_quantity);
          return (
            <div key={item.id} className="p-4">
              <div className="flex items-start gap-3 mb-2">
                {item.variation?.product?.image ? <img src={item.variation.product.image} alt="" className="w-16 h-16 rounded-lg object-cover" /> : <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center"><Package2 className="w-6 h-6 text-gray-400" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="data-primary text-gray-900 dark:text-white truncate">{item.variation?.product?.name}{item.variation?.variation_label && item.variation.variation_label !== 'default' ? ` - ${item.variation.variation_label}` : ''}</div>
                  <div className="data-secondary text-gray-500">{item.variation?.product?.code}</div>
                </div>
                <span className={`text-xs font-medium ${ib.color}`}>{ib.label}</span>
              </div>
              <div className="grid grid-cols-3 text-center text-xs">
                <div><span className="text-gray-500 block">สั่ง</span><span className="font-medium text-gray-900 dark:text-white">{item.quantity}</span></div>
                <div><span className="text-gray-500 block">รับแล้ว</span><span className="font-medium text-green-600">{item.received_quantity}</span></div>
                <div><span className="text-gray-500 block">คงเหลือ</span><span className={`font-medium ${remaining > 0 ? 'text-amber-600' : 'text-gray-400'}`}>{remaining}</span></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex justify-end">
        <div className="text-right">
          <span className="text-sm text-gray-500 dark:text-slate-400 mr-4">มูลค่ารวม</span>
          <span className="text-lg font-bold text-gray-900 dark:text-white">฿{formatCurrency(totalAmount)}</span>
        </div>
      </div>
    </div>
  );
}
