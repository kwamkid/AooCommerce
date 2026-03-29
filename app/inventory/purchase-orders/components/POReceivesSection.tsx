'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReceiveRef, POItem } from './types';
import { ArrowDownToLine, ChevronDown, ChevronUp, Package } from 'lucide-react';

interface Props {
  receives: ReceiveRef[];
  poItems?: POItem[];
}

export default function POReceivesSection({ receives, poItems }: Props) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (receives.length === 0) return null;

  // Build a map of PO item quantities by variation_id for comparison
  const poQtyMap = new Map<string, number>();
  poItems?.forEach(item => {
    poQtyMap.set(item.variation_id, item.quantity);
  });

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <ArrowDownToLine className="w-4 h-4 text-green-600" /> ประวัติรับของ ({receives.length} ครั้ง)
        </h3>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-slate-700">
        {receives.map(r => {
          const isExpanded = expandedId === r.id;
          const hasItems = r.items && r.items.length > 0;
          const totalQty = r.items?.reduce((s, i) => s + i.quantity, 0) || 0;

          return (
            <div key={r.id}>
              <div
                className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                onClick={() => {
                  if (hasItems) {
                    setExpandedId(isExpanded ? null : r.id);
                  } else {
                    router.push(`/inventory/receives/${r.id}`);
                  }
                }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{r.receive_number}</span>
                  {hasItems && (
                    <span className="text-xs text-gray-400 dark:text-slate-500">
                      {r.items!.length} รายการ · +{totalQty} ชิ้น
                    </span>
                  )}
                  {r.notes && <span className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[120px]">{r.notes}</span>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    {new Date(r.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                  </span>
                  {hasItems && (
                    isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-400" />
                      : <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded items */}
              {isExpanded && hasItems && (
                <div className="bg-gray-50 dark:bg-slate-700/30 px-4 pb-3">
                  <div className="space-y-1.5">
                    {r.items!.map(item => {
                      const poQty = poQtyMap.get(item.variation_id);
                      const isExtraItem = poQty === undefined;
                      const isOverQty = poQty !== undefined && item.quantity > poQty;
                      const rawLabel = item.variation?.variation_label || '';
                      const variationLabel = (rawLabel && rawLabel !== item.variation?.product?.code && rawLabel !== item.variation?.sku && !/^\d+$/.test(rawLabel)) ? rawLabel : '';

                      return (
                        <div key={item.id} className="flex items-center gap-2 py-1">
                          {item.variation?.product?.image ? (
                            <img src={item.variation.product.image} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                          ) : (
                            <div className="w-7 h-7 bg-gray-200 dark:bg-slate-600 rounded flex items-center justify-center flex-shrink-0">
                              <Package className="w-3.5 h-3.5 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-gray-700 dark:text-slate-300 truncate block">
                              {item.variation?.product?.name || '-'}
                              {variationLabel && ` - ${variationLabel}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className={`text-xs font-medium ${
                              isExtraItem
                                ? 'text-orange-600 dark:text-orange-400'
                                : isOverQty
                                  ? 'text-orange-600 dark:text-orange-400'
                                  : 'text-gray-700 dark:text-slate-300'
                            }`}>
                              +{item.quantity}
                            </span>
                            {isExtraItem && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                                นอก PO
                              </span>
                            )}
                            {isOverQty && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                                เกิน +{item.quantity - poQty!}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(`/inventory/receives/${r.id}`)}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    ดูใบรับเข้า →
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
