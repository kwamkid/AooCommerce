'use client';

import { useMemo } from 'react';
import { Tag, FolderTree, X as XIcon } from 'lucide-react';
import Card from '@/components/ui/Card';
import FormSelect from '@/components/ui/FormSelect';
import SearchInput from '@/components/ui/SearchInput';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import SearchableDropdown, { type DropdownOption } from '@/components/ui/SearchableDropdown';

export type ProductStatusFilter = 'active' | 'inactive' | 'all';

interface NamedOption { id: string; name: string }

interface ProductFiltersProps {
  /** Search by name / code / sku / barcode. Omit handler to hide. */
  search?: string;
  onSearchChange?: (v: string) => void;
  searchPlaceholder?: string;

  /** Type filter (simple / variation). Omit handler to hide. */
  type?: string;
  onTypeChange?: (v: string) => void;
  typeOptions?: { id: string; label: string }[];

  /** Status filter — segmented pill: เปิด / ปิด / ทั้งหมด. Omit handler to hide. */
  status?: ProductStatusFilter;
  onStatusChange?: (v: ProductStatusFilter) => void;

  /** Brand multi-select. Omit handler to hide. */
  brandIds?: string[];
  onBrandIdsChange?: (v: string[]) => void;
  brands?: NamedOption[];

  /** Category multi-select. Omit handler to hide. */
  categoryIds?: string[];
  onCategoryIdsChange?: (v: string[]) => void;
  categories?: NamedOption[];

  /** Single-shop dropdown ("all" = no filter). Omit handler to hide. */
  shopAccountId?: string;
  onShopAccountIdChange?: (v: string) => void;
  shopOptions?: DropdownOption[];

  /** Reset handler — clicked X icon. Always visible when provided. */
  onReset?: () => void;

  /** Skip outer <Card> wrap. */
  noCard?: boolean;
}

const STATUS_PILL_OPTIONS: { id: ProductStatusFilter; label: string }[] = [
  { id: 'active', label: 'เปิด' },
  { id: 'inactive', label: 'ปิด' },
  { id: 'all', label: 'ทั้งหมด' },
];

/**
 * Universal product filter bar. Used on /products list, bulk edit pages, etc.
 * Single horizontal flex-wrap row; each filter renders only when its handler
 * is provided. Status uses a segmented pill matching the products-list design.
 */
export default function ProductFilters({
  search,
  onSearchChange,
  searchPlaceholder = 'ค้นหาชื่อสินค้า / รหัส / SKU / Barcode...',
  type,
  onTypeChange,
  typeOptions = [
    { id: 'simple', label: 'สินค้าปกติ' },
    { id: 'variation', label: 'สินค้าย่อย' },
  ],
  status,
  onStatusChange,
  brandIds,
  onBrandIdsChange,
  brands = [],
  categoryIds,
  onCategoryIdsChange,
  categories = [],
  shopAccountId,
  onShopAccountIdChange,
  shopOptions = [],
  onReset,
  noCard = false,
}: ProductFiltersProps) {
  const brandOptions = useMemo(() => brands.map(b => ({ id: b.id, label: b.name })), [brands]);
  const categoryOptions = useMemo(() => categories.map(c => ({ id: c.id, label: c.name })), [categories]);

  const showSearch = !!onSearchChange;
  const showType = !!onTypeChange && type !== undefined;
  const showStatus = !!onStatusChange && status !== undefined;
  const showBrand = !!onBrandIdsChange && brandIds !== undefined;
  const showCategory = !!onCategoryIdsChange && categoryIds !== undefined;
  const showShop = !!onShopAccountIdChange && shopAccountId !== undefined && shopOptions.length > 0;
  const showReset = !!onReset;

  const inner = (
    <div className="flex flex-wrap items-center gap-2">
      {showSearch && (
        <div className="w-full md:flex-1 md:min-w-[220px]">
          <SearchInput value={search ?? ''} onChange={onSearchChange!} placeholder={searchPlaceholder} />
        </div>
      )}

      {showType && (
        <div className="w-full md:w-auto md:min-w-[140px]">
          <FormSelect
            value={type!}
            onChange={onTypeChange!}
            options={typeOptions}
            clearLabel="ทั้งหมด"
            placeholder="ประเภท"
            searchThreshold={99}
          />
        </div>
      )}

      {showCategory && (
        <div className="w-full md:w-auto md:min-w-[160px]">
          <MultiSelectSearch
            value={categoryIds!}
            onChange={onCategoryIdsChange!}
            options={categoryOptions}
            placeholder="ทุกหมวดหมู่"
            emptyLabel="ทุกหมวดหมู่ (ไม่กรอง)"
            searchPlaceholder="ค้นหาหมวดหมู่..."
            icon={<FolderTree className="w-4 h-4" />}
          />
        </div>
      )}

      {showBrand && (
        <div className="w-full md:w-auto md:min-w-[160px]">
          <MultiSelectSearch
            value={brandIds!}
            onChange={onBrandIdsChange!}
            options={brandOptions}
            placeholder="ทุกแบรนด์"
            emptyLabel="ทุกแบรนด์ (ไม่กรอง)"
            searchPlaceholder="ค้นหาแบรนด์..."
            icon={<Tag className="w-4 h-4" />}
          />
        </div>
      )}

      {showShop && (
        <div className="w-full md:w-auto md:min-w-[160px]">
          <SearchableDropdown
            value={shopAccountId!}
            onChange={onShopAccountIdChange!}
            options={shopOptions}
            placeholder="ร้านค้า"
            searchPlaceholder="ค้นหาร้านค้า..."
            allLabel="ทุกร้านค้า"
          />
        </div>
      )}

      {showStatus && (
        <div role="radiogroup" aria-label="สถานะสินค้า" className="w-full md:w-auto flex h-10 items-stretch rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 overflow-hidden md:flex-shrink-0">
          {STATUS_PILL_OPTIONS.map(opt => {
            const active = status === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => onStatusChange!(opt.id)}
                className={`flex-1 md:flex-none px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-[#F4511E] text-white shadow-sm'
                    : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {showReset && (
        <button
          type="button"
          onClick={onReset}
          aria-label="ล้างตัวกรอง"
          title="ล้างตัวกรอง"
          className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors md:flex-shrink-0"
        >
          <XIcon className="w-4 h-4" />
        </button>
      )}
    </div>
  );

  return noCard ? inner : <Card padding="md">{inner}</Card>;
}
