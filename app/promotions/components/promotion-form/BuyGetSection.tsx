'use client';

import ItemsTable from '@/components/ui/ItemsTable';
import ProductSearchInput from '@/components/ui/ProductSearchInput';
import PriceDiscountCombo from '@/components/ui/PriceDiscountCombo';
import NumberInput from '@/components/ui/NumberInput';
import ProductImageThumb, { type ThumbSize } from '@/components/ui/ProductImageThumb';
import { Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { productDisplayName, productSubtitle } from '@/lib/product-display';
import type { PromotionItemForm } from './types';
import type { UsePromotionFormReturn } from './usePromotionForm';

interface Props {
  hook: UsePromotionFormReturn;
}

export default function BuyGetSection({ hook }: Props) {
  const {
    form,
    errors,
    itemErrorKeys,
    products,
    loadingProducts,
    tableItems,
    expandedYProducts, setExpandedYProducts,
    handleAddMainProduct,
    handleAddProductWithVariations,
    handleRemoveProductVariations,
    handleUpdateItem,
    handleTableUpdateField,
    handleTableRemove,
  } = hook;

  const isBuyGetDiscount = form.promotion_type === 'buy_get_discount';
  const yRole = form.promotion_type === 'buy_get_free' ? 'gift' : 'discounted';

  // Shared: render item info cell
  const renderItemInfo = (item: PromotionItemForm, thumbSize: ThumbSize = 'sm') => {
    const displayName = productDisplayName(item);
    const sub = productSubtitle(item);
    return (
      <>
        <ProductImageThumb src={item.image} alt={displayName} size={thumbSize} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
            {displayName}
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate">
            {sub}
            <span className={sub ? 'ml-1' : ''}>| ฿{item.default_price.toLocaleString()}</span>
            {isBuyGetDiscount && item.special_price != null && item.special_price < item.default_price && (
              <span className="ml-1 text-primary">→ ฿{item.special_price.toLocaleString()}</span>
            )}
          </div>
        </div>
      </>
    );
  };

  // Shared: render discount + limit inputs
  const renderInputs = (item: PromotionItemForm) => (
    <>
      {isBuyGetDiscount ? (
        <PriceDiscountCombo
          value={item.discount_value ?? ''}
          mode={item.price_mode || 'fixed_price'}
          error={itemErrorKeys.has(item.key)}
          onValueChange={v => {
            handleUpdateItem(item.key, 'discount_value', v);
            const m = item.price_mode || 'fixed_price';
            const num = parseFloat(v) || 0;
            if (m === 'percent') {
              handleUpdateItem(item.key, 'special_price', Math.round(item.default_price * (1 - num / 100)));
            } else if (m === 'fixed_discount') {
              handleUpdateItem(item.key, 'special_price', Math.max(0, item.default_price - num));
            } else {
              handleUpdateItem(item.key, 'special_price', num || null);
            }
          }}
          onModeChange={m => {
            handleUpdateItem(item.key, 'price_mode', m);
            handleUpdateItem(item.key, 'discount_value', '');
            handleUpdateItem(item.key, 'special_price', null);
          }}
        />
      ) : (
        <NumberInput
          value={item.quantity}
          onChange={(n) => handleUpdateItem(item.key, 'quantity', Math.max(1, n || 1))}
          min={1}
          className="w-16 h-[42px] px-2 text-right border border-gray-300 dark:border-slate-500 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm"
        />
      )}
      <input
        type="number"
        value={item.sub_item_limit ?? ''}
        onChange={e => {
          const val = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
          handleUpdateItem(item.key, 'sub_item_limit', val);
        }}
        placeholder="ไม่จำกัด"
        min={0}
        className="w-20 h-[42px] px-2 text-right border border-gray-300 dark:border-slate-500 rounded-lg bg-transparent text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary text-sm placeholder:text-gray-300 dark:placeholder:text-slate-600"
      />
    </>
  );

  // Y items grouped by product
  const yItems = form.items.filter(i => i.role === yRole);
  const grouped = new Map<string, PromotionItemForm[]>();
  for (const item of yItems) {
    const pid = item.product_id;
    if (!grouped.has(pid)) grouped.set(pid, []);
    grouped.get(pid)!.push(item);
  }

  return (
    <>
      {/* Table 1: สินค้าหลัก (X) */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
          สินค้าหลัก (X) — สินค้าที่ต้องซื้อ
        </h2>
        {errors.items && !form.items.some(i => i.role === 'main') && (
          <p data-error="true" className="text-red-500 text-sm mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            {errors.items}
          </p>
        )}
        <ItemsTable
          items={tableItems.filter(i => i.role === 'main')}
          columns={['qty']}
          onAdd={handleAddMainProduct}
          onUpdateField={(idx, field, value) => {
            const mainItems = form.items.filter(i => i.role === 'main');
            const item = mainItems[idx];
            if (!item) return;
            const realIdx = form.items.findIndex(i => i.key === item.key);
            if (realIdx >= 0) handleTableUpdateField(realIdx, field, value);
          }}
          onRemove={(idx) => {
            const mainItems = form.items.filter(i => i.role === 'main');
            const item = mainItems[idx];
            if (!item) return;
            const realIdx = form.items.findIndex(i => i.key === item.key);
            if (realIdx >= 0) handleTableRemove(realIdx);
          }}
          products={products}
          loadingProducts={loadingProducts}
          searchPlaceholder="+ เพิ่มสินค้าหลัก..."
          searchMode="product"
          emptyMessage="เพิ่มสินค้าที่ลูกค้าต้องซื้อ"
          showSummary={false}
        />
      </div>

      {/* Table 2: Y items */}
      <div>
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-2">
          {form.promotion_type === 'buy_get_free'
            ? 'ของแถม (Y) — ได้ฟรี'
            : 'สินค้าราคาพิเศษ (Y) — ได้ในราคาพิเศษ'}
        </h2>
        {errors.items && form.items.some(i => i.role === 'main') && (
          <p data-error="true" className="text-red-500 text-sm mb-2 flex items-center gap-1.5">
            <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
            {errors.items}
          </p>
        )}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700">
          <div className="p-3 border-b border-gray-100 dark:border-slate-700">
            <ProductSearchInput
              products={products}
              loading={loadingProducts}
              onSelect={handleAddProductWithVariations}
              placeholder={form.promotion_type === 'buy_get_free' ? '+ เพิ่มของแถม — เลือกสินค้า...' : '+ เพิ่มสินค้าราคาพิเศษ — เลือกสินค้า...'}
              mode="product"
            />
          </div>

          {grouped.size === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-slate-500 text-base">
              {form.promotion_type === 'buy_get_free' ? 'เพิ่มสินค้าที่แถมฟรี' : 'เพิ่มสินค้าที่ลูกค้าจะได้ในราคาพิเศษ'}
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {[...grouped.entries()].map(([productId, variations]) => {
                const first = variations[0];
                const isSimple = variations.length <= 1;
                const isExpanded = expandedYProducts.has(productId);

                // Simple product (1 variation): single row
                if (isSimple) {
                  const item = first;
                  const hasErr = itemErrorKeys.has(item.key);
                  return (
                    <div key={productId} data-error={hasErr ? 'true' : undefined} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${hasErr ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                      {renderItemInfo(item)}
                      {renderInputs(item)}
                      <button
                        type="button"
                        onClick={() => handleRemoveProductVariations(productId)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                }

                // Multi-variation product
                return (
                  <div key={productId}>
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 dark:bg-slate-700/50">
                      <ProductImageThumb src={first.image} alt={first.product_name} size="sm" />

                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">
                          {first.product_name}
                        </div>
                        <div className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
                          {first.product_code}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedYProducts(prev => {
                          const next = new Set(prev);
                          if (next.has(productId)) next.delete(productId);
                          else next.add(productId);
                          return next;
                        })}
                        className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors flex-shrink-0"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="text-xs">{variations.length}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveProductVariations(productId)}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {isExpanded && variations.map(item => {
                      const hasErr = itemErrorKeys.has(item.key);
                      return (
                        <div key={item.key} data-error={hasErr ? 'true' : undefined} className={`flex items-center gap-3 px-4 py-2 pl-8 border-b border-gray-100 dark:border-slate-700/50 transition-colors ${hasErr ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          {renderItemInfo(item, 'xs')}
                          {renderInputs(item)}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
