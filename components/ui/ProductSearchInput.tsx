'use client';

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react';
import { Plus, Package, Loader2 } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';

export interface ProductSearchItem {
  id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string | null;
  variation_label?: string;
  sku?: string;
  default_price?: number;
  discount_price?: number;
}

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
}

export default function ProductSearchInput({
  products,
  onSelect,
  placeholder = 'พิมพ์ชื่อสินค้า, รหัส หรือ SKU เพื่อค้นหา...',
  searchFields = ['sku'],
  loading = false,
  renderExtra,
  isAlreadyAdded,
  isDisabled,
  formatSubtitle,
  autoFocus,
  inputRef: externalRef,
}: ProductSearchInputProps) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const internalRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = externalRef || internalRef;

  // Filter products client-side
  const filtered = search
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

  // Reset highlight when filtered list changes
  useEffect(() => {
    setHighlightIndex(-1);
  }, [filtered.length, search]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-product-item]');
      items[highlightIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const handleSelect = useCallback((product: ProductSearchItem) => {
    onSelect(product);
    setSearch('');
    setShowDropdown(false);
    setHighlightIndex(-1);
    // Re-focus for next search/scan
    setTimeout(() => {
      searchRef.current?.focus();
    }, 100);
  }, [onSelect, searchRef]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setSearch('');
      setShowDropdown(false);
      setHighlightIndex(-1);
      return;
    }

    if (!showDropdown || filtered.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev < filtered.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev > 0 ? prev - 1 : filtered.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filtered.length) {
        const product = filtered[highlightIndex];
        const disabled = isDisabled?.(product) ?? false;
        if (!disabled) {
          handleSelect(product);
        }
      }
    }
  }, [showDropdown, filtered, highlightIndex, isDisabled, handleSelect]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2.5 border border-dashed border-gray-300 dark:border-slate-600 rounded-lg hover:border-[#F4511E] transition-colors bg-transparent">
        <Plus className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={e => {
            setSearch(e.target.value);
            setShowDropdown(true);
          }}
          onFocus={() => setShowDropdown(true)}
          onBlur={() => {
            setTimeout(() => {
              setShowDropdown(false);
              setHighlightIndex(-1);
            }, 200);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="flex-1 outline-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
        />
        {loading && (
          <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />
        )}
      </div>

      {/* Dropdown results */}
      {showDropdown && search && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg max-h-72 overflow-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
              ไม่พบสินค้า
            </div>
          ) : (
            filtered.map((product, index) => {
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
                    if (product.sku) parts.push(`SKU: ${product.sku}`);
                    if (product.default_price != null) {
                      if (product.discount_price != null && product.discount_price > 0 && product.discount_price < product.default_price) {
                        parts.push(`฿${formatNumber(product.discount_price)}`);
                      } else {
                        parts.push(`฿${formatNumber(product.default_price)}`);
                      }
                    }
                    return parts.join(' | ');
                  })();

              return (
                <button
                  key={product.id}
                  type="button"
                  data-product-item
                  onClick={() => !disabled && handleSelect(product)}
                  disabled={disabled}
                  className={`w-full px-3 py-2 text-left transition-colors flex items-center gap-3 ${
                    disabled
                      ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-700/30'
                      : isHighlighted
                        ? 'bg-orange-50 dark:bg-slate-700'
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
                    <div className="text-xs text-gray-400 dark:text-slate-500 truncate">
                      {subtitle}
                    </div>
                  </div>
                  {/* Extra content (stock badges, etc.) */}
                  {renderExtra?.(product)}
                  {/* Already added indicator */}
                  {alreadyAdded && !renderExtra && (
                    <span className="text-xs text-[#F4511E] font-medium flex-shrink-0">
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
