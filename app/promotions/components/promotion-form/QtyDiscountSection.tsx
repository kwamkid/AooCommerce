'use client';

import ItemsTable from '@/components/ui/ItemsTable';
import FormSelect from '@/components/ui/FormSelect';
import { Plus, X } from 'lucide-react';
import { DISCOUNT_TYPE_OPTIONS } from './types';
import type { UsePromotionFormReturn } from './usePromotionForm';

interface Props {
  hook: UsePromotionFormReturn;
}

export default function QtyDiscountSection({ hook }: Props) {
  const {
    form,
    errors,
    products,
    loadingProducts,
    tableItems,
    itemsTableColumns,
    roleOpts,
    handleTableAdd,
    handleTableUpdateField,
    handleTableRemove,
    handleAddTier,
    handleRemoveTier,
    handleUpdateTier,
  } = hook;

  return (
    <>
      {/* Items table (max 1 item) */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">สินค้าที่ลดราคา</h2>
        {errors.items && (
          <p data-error="true" className="text-red-500 text-sm mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            {errors.items}
          </p>
        )}
        <ItemsTable
          items={tableItems}
          columns={itemsTableColumns}
          onAdd={form.items.length >= 1 ? undefined : handleTableAdd}
          onUpdateField={handleTableUpdateField}
          onRemove={handleTableRemove}
          products={products}
          loadingProducts={loadingProducts}
          searchPlaceholder="+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
          searchMode="product"
          roleOptions={roleOpts}
          emptyMessage="เลือกสินค้า 1 รายการที่ต้องการตั้งส่วนลดตามจำนวน"
          showSummary={false}
          priceReadOnly
        />
      </div>

      {/* Tiers */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300">ขั้นส่วนลด</h2>
          <button
            onClick={handleAddTier}
            className="flex items-center gap-1 px-3 py-1.5 text-base font-medium text-primary hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            เพิ่มขั้น
          </button>
        </div>

        {errors.tiers && (
          <p data-error="true" className="text-red-500 text-sm mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            {errors.tiers}
          </p>
        )}

        {form.tiers.length > 0 ? (
          <div className="space-y-2">
            {form.tiers.map((tier) => (
              <div key={tier.key} className="flex items-center gap-2 flex-wrap">
                <span className="text-base text-gray-500 dark:text-slate-400 w-16 flex-shrink-0">ซื้อ ≥</span>
                <input
                  type="number"
                  value={tier.min_qty}
                  onChange={e => handleUpdateTier(tier.key, 'min_qty', Math.max(1, parseInt(e.target.value) || 1))}
                  min={1}
                  className="w-20 h-[34px] px-2 text-center border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-base text-gray-500 dark:text-slate-400">ชิ้น</span>
                <div className="w-40">
                  <FormSelect
                    value={tier.discount_type}
                    onChange={(v: string) => handleUpdateTier(tier.key, 'discount_type', v)}
                    options={DISCOUNT_TYPE_OPTIONS}
                    searchThreshold={99}
                  />
                </div>
                <input
                  type="number"
                  value={tier.discount_value || ''}
                  onChange={e => handleUpdateTier(tier.key, 'discount_value', parseFloat(e.target.value) || 0)}
                  min={0}
                  placeholder="0"
                  className="w-24 h-[34px] px-2 text-right border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => handleRemoveTier(tier.key)}
                  className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-gray-400 dark:text-slate-500 text-base">
            กดเพิ่มขั้นส่วนลด เช่น ซื้อ 2 ชิ้นลด 10%
          </div>
        )}
      </div>
    </>
  );
}
