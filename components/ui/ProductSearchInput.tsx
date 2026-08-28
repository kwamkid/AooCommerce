'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { Plus, Package, Loader2, Flame } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';

export interface ProductSearchItem {
  id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string | null;
  variation_label?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  /** Max price across variations (product mode only, for price range display) */
  max_price?: number;
  discount_price?: number;
  brand_id?: string | null;
  /** Number of variations for this product (populated in product mode) */
  variation_count?: number;
  /** Top seller source — used to label suggestion rows */
  top_seller_source?: 'customer' | 'company';
}

export type SearchMode = 'variation' | 'product';

interface ProductSearchInputProps {
  products: ProductSearchItem[];
  onSelect: (product: ProductSearchItem) => void;
  placeholder?: string;
  /** Additional fields to search besides name and code */
  searchFields?: (keyof ProductSearchItem)[];
  /** Loading indicator */
  loading?: boolean;
  /** Custom render for each result row (for stock badges, etc.) */
  renderExtra?: (product: ProductSearchItem) => ReactNode;
  /** Show "+1" badge for already-added items */
  isAlreadyAdded?: (product: ProductSearchItem) => boolean;
  /** Disable specific items (e.g. out of stock) */
  isDisabled?: (product: ProductSearchItem) => boolean;
  /** Format the subtitle line (default: code + sku) */
  formatSubtitle?: (product: ProductSearchItem) => string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** External ref for imperative focus */
  inputRef?: React.RefObject<HTMLInputElement | null>;
  /** Search mode: 'variation' (default) = each variation as row, 'product' = grouped by product */
  mode?: SearchMode;
  /** Suggestions shown when input is focused with empty query (e.g. top sellers). */
  suggestions?: ProductSearchItem[];
  /** Header label rendered above the suggestion list. */
  suggestionsLabel?: string;
}

export default function ProductSearchInput({
  products,
  onSelect,
  placeholder = 'พิมพ์ชื่อสินค้า, รหัส หรือ SKU เพื่อค้นหา...',
  searchFields = ['sku', 'barcode'],
  loading = false,
  renderExtra,
  isAlreadyAdded,
  isDisabled,
  formatSubtitle,
  autoFocus,
  inputRef: externalRef,
  mode = 'variation',
  suggestions,
  suggestionsLabel = 'ขายดี 30 วันล่าสุด',
}: ProductSearchInputProps) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const internalRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** focus รอบถัดไปเป็นของระบบ (หลังเพิ่มสินค้า) ไม่ใช่ผู้ใช้ตั้งใจ → อย่ากางรายการแนะนำ */
  const skipFocusOpenRef = useRef(false);
  const searchRef = externalRef || internalRef;

  // Filter products client-side
  const filteredRaw = search
    ? products.filter(p => {
        const q = search.toLowerCase();
        if (p.name.toLowerCase().includes(q)) return true;
        if (p.code.toLowerCase().includes(q)) return true;
        for (const field of searchFields) {
          const val = p[field];
          if (val && String(val).toLowerCase().includes(q)) return true;
        }
        return false;
      })
    : [];

  // In product mode: group by product_id, show 1 row per product
  const filtered = mode === 'product'
    ? (() => {
        const seen = new Map<string, ProductSearchItem>();
        const countMap = new Map<string, number>();
        const priceRange = new Map<string, { min: number; max: number }>();
        // Count all variations + compute price range per product
        for (const p of products) {
          countMap.set(p.product_id, (countMap.get(p.product_id) || 0) + 1);
          const price = p.default_price || 0;
          const range = priceRange.get(p.product_id);
          if (!range) {
            priceRange.set(p.product_id, { min: price, max: price });
          } else {
            range.min = Math.min(range.min, price);
            range.max = Math.max(range.max, price);
          }
        }
        for (const p of filteredRaw) {
          if (!seen.has(p.product_id)) {
            const range = priceRange.get(p.product_id);
            seen.set(p.product_id, {
              ...p,
              id: p.product_id, // use product_id as id in product mode
              variation_label: undefined, // don't show single variation label
              variation_count: countMap.get(p.product_id) || 1,
              default_price: range?.min || p.default_price || 0,
              max_price: range?.max || p.default_price || 0,
            });
          }
        }
        return Array.from(seen.values());
      })()
    : filteredRaw;

  // When input is empty AND the parent supplied suggestions (e.g. top sellers),
  // show them instead of an empty dropdown. Search results take over once the
  // user types anything.
  const isSuggestionMode = !search && (suggestions?.length ?? 0) > 0;
  const displayItems: ProductSearchItem[] = isSuggestionMode
    ? (suggestions ?? [])
    : filtered;

  // Reset highlight when displayed list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [displayItems.length, search, isSuggestionMode]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-product-item]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleSelect = useCallback((product: ProductSearchItem) => {
    // Cancel any pending blur timeout so it doesn't interfere with re-focus
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    onSelect(product);
    setSearch('');
    setShowDropdown(false);
    setHighlightIndex(-1);
    // Re-focus for next search/scan — แต่ **ไม่กางรายการแนะนำ**: ผู้ใช้ที่เพิ่งเพิ่มของเสร็จ
    // มักจะดูสรุป/กดถัดไปต่อ รายการแนะนำที่เด้งเองจะบังปุ่มพอดี (ผู้ใช้ทัก 2026-08-29)
    // พิมพ์ต่อหรือคลิกช่องอีกทีค่อยกาง
    skipFocusOpenRef.current = true;
    setTimeout(() => {
      searchRef.current?.focus();
    }, 50);
  }, [onSelect, searchRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearch('');
      setShowDropdown(false);
      setHighlightIndex(-1);
      return;
    }

    if (!showDropdown || displayItems.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < displayItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : displayItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < displayItems.length) {
        const product = displayItems[highlightIndex];
        const disabled = isDisabled?.(product) ?? false;
        if (!disabled) {
          handleSelect(product);
        }
      }
    }
  }, [showDropdown, displayItems, highlightIndex, isDisabled, handleSelect]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-1.5 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg hover:border-primary transition-colors" style={{ backgroundColor: '#63f5b121' }}>
        <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => {
            skipFocusOpenRef.current = false;
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          // คลิกที่ช่อง = ตั้งใจจะหาของ → กางเสมอ (ตอนถูก focus อยู่แล้ว onFocus ไม่ยิงซ้ำ)
          onMouseDown={() => {
            skipFocusOpenRef.current = false;
            setShowDropdown(true);
          }}
          onFocus={() => {
            // focus ที่ระบบสั่งเองหลังเพิ่มสินค้า — ให้เคอร์เซอร์รออยู่เฉย ๆ ไม่ต้องกางบังปุ่ม
            if (skipFocusOpenRef.current) {
              skipFocusOpenRef.current = false;
              return;
            }
            setShowDropdown(true);
          }}
          onBlur={() => {
            blurTimeoutRef.current = setTimeout(() => {
              setShowDropdown(false);
              setHighlightIndex(-1);
              blurTimeoutRef.current = null;
            }, 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 outline-none bg-transparent text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
        />
        {loading && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Dropdown results */}
      {showDropdown && (search || isSuggestionMode) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-72 overflow-auto"
        >
          {isSuggestionMode && (
            <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400 bg-gray-50 dark:bg-slate-700/40 border-b border-gray-100 dark:border-slate-700 sticky top-0">
              <Flame className="w-3.5 h-3.5 text-orange-500" />
              {suggestionsLabel}
            </div>
          )}
          {loading && displayItems.length === 0 ? (
            <div className="px-4 py-3 flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              กำลังโหลดสินค้า...
            </div>
          ) : displayItems.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
              ไม่พบสินค้า
            </div>
          ) : (
            displayItems.map((product, index) => {
              const disabled = isDisabled?.(product) ?? false;
              const alreadyAdded = isAlreadyAdded?.(product) ?? false;
              const rawLabel = product.variation_label || '';
              // Hide variation_label if it's just a barcode/number or same as code/sku
              const variationLabel = (rawLabel && rawLabel !== product.code && rawLabel !== product.sku && !/^\d+$/.test(rawLabel)) ? rawLabel : '';
              const isHighlighted = index === highlightIndex;

              const subtitle = formatSubtitle
                ? formatSubtitle(product)
                : (() => {
                    const parts = [product.code];
                    if (product.sku && product.sku !== product.code) parts.push(`SKU: ${product.sku}`);
                    if (product.default_price != null) {
                      if (product.max_price && product.max_price > product.default_price) {
                        // Price range for product-level items
                        parts.push(`฿${formatNumber(product.default_price)} - ฿${formatNumber(product.max_price)}`);
                      } else if (product.discount_price != null && product.discount_price > 0 && product.discount_price < product.default_price) {
                        parts.push(`฿${formatNumber(product.discount_price)}`);
                      } else {
                        parts.push(`฿${formatNumber(product.default_price)}`);
                      }
                    }
                    return parts.join(' | ');
                  })();

              return (
                <button
                  key={`${product.id}-${index}`}
                  type="button"
                  data-product-item
                  onClick={() => !disabled && handleSelect(product)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 text-left transition-colors flex items-center gap-3 ${
                    disabled
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-700/30'
                      : isHighlighted
                        ? 'bg-gray-100 dark:bg-slate-700'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  {product.image ? (
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-10 h-10 object-cover rounded flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-gray-100 dark:bg-slate-700 rounded flex items-center justify-center flex-shrink-0">
                      <Package className="w-5 h-5 text-gray-400 dark:text-slate-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 break-words">
                      {product.name}
                      {variationLabel && ` - ${variationLabel}`}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 truncate flex items-center gap-1.5">
                      <span>{subtitle}</span>
                      {mode === 'product' && product.variation_count && product.variation_count > 1 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[10px] font-medium">
                          {product.variation_count} variation
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Extra content (stock badges, etc.) */}
                  {renderExtra?.(product)}
                  {/* Already added indicator */}
                  {alreadyAdded && !renderExtra && (
                    <span className="text-xs text-primary font-medium flex-shrink-0">
                      +1
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
