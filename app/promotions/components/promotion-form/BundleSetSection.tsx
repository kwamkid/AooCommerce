'use client';

import ItemsTable from '@/components/ui/ItemsTable';
import type { UsePromotionFormReturn } from './usePromotionForm';

interface Props {
  hook: UsePromotionFormReturn;
}

export default function BundleSetSection({ hook }: Props) {
  const {
    form,
    errors,
    products,
    loadingProducts,
    tableItems,
    itemsTableColumns,
    roleOpts,
    showBundlePrice,
    showBundleDiscount,
    totalDefaultPrice,
    handleTableAdd,
    handleTableUpdateField,
    handleTableRemove,
  } = hook;

  return (
    <>
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">สินค้าในโปรโมชั่น</h2>
        {errors.items && (
          <p data-error="true" className="text-red-500 text-sm mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            {errors.items}
          </p>
        )}
        <ItemsTable
          items={tableItems}
          columns={itemsTableColumns}
          onAdd={handleTableAdd}
          onUpdateField={handleTableUpdateField}
          onRemove={handleTableRemove}
          products={products}
          loadingProducts={loadingProducts}
          searchPlaceholder="+ เพิ่มสินค้า — พิมพ์ชื่อหรือรหัส..."
          searchMode="product"
          roleOptions={roleOpts}
          emptyMessage="เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน"
          showSummary={false}
          priceReadOnly
        />
      </div>

      {/* Summary */}
      {(showBundlePrice || showBundleDiscount) && form.items.length > 0 && (
        <div className="flex justify-end">
          <div className="text-sm text-gray-600 dark:text-slate-400">
            รวมราคาปกติ: <span className="font-medium text-gray-900 dark:text-white">{totalDefaultPrice.toLocaleString()}</span> บาท
            {showBundleDiscount && parseFloat(form.discount_value) > 0 && (
              <span className="ml-2">
                → หลังลด: <span className="font-medium text-primary">
                  {form.discount_type === 'percent'
                    ? `${(totalDefaultPrice * (1 - parseFloat(form.discount_value) / 100)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                    : `${(totalDefaultPrice - parseFloat(form.discount_value)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
                  }
                </span> บาท
              </span>
            )}
            {form.items.some(i => i.role === 'gift') && (
              <span className="text-xs text-gray-400 ml-1">(ไม่รวมของแถม)</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}
