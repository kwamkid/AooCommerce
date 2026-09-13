'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { User, Warehouse, X } from 'lucide-react';
import SearchInput from '@/components/ui/SearchInput';
import DateRangePicker from '@/components/ui/DateRangePicker';
import FormSelect from '@/components/ui/FormSelect';
import Button from '@/components/ui/Button';
import Tooltip from '@/components/ui/Tooltip';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { toDateParam, type DocListDateRange } from './useDocListParams';

export interface DocListWarehouse {
  id: string;
  name: string;
  warehouse_type?: string | null;
}

export interface DocListUser {
  id: string;
  name: string;
}

interface DocListFiltersProps {
  search: string;
  /** เรียกหลังหยุดพิมพ์ 400ms (debounce อยู่ในตัวคอมโพเนนต์) */
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  dateRange: DocListDateRange;
  onDateRange: (from: string, to: string) => void;
  warehouses: DocListWarehouse[];
  warehouseId: string;
  onWarehouse: (id: string) => void;
  warehouseLabel?: string;
  users: DocListUser[];
  userId: string;
  onUser: (id: string) => void;
  /** ช่องกรองเฉพาะหน้า เช่น ซัพพลายเออร์ของใบสั่งซื้อ */
  extra?: ReactNode;
  onClear: () => void;
  hasActiveFilters: boolean;
}

/**
 * แถบตัวกรองกลางของหน้าเอกสารคลังทั้ง 4 หน้า
 * (รับเข้า · เบิกออก · โอนย้าย · ใบสั่งซื้อ) — ค้นหา · ช่วงวันที่ · คลัง · ผู้ทำรายการ
 */
export default function DocListFilters({
  search,
  onSearch,
  searchPlaceholder = 'ค้นหาเลขที่, หมายเหตุ...',
  dateRange,
  onDateRange,
  warehouses,
  warehouseId,
  onWarehouse,
  warehouseLabel = 'ทุกคลัง',
  users,
  userId,
  onUser,
  extra,
  onClear,
  hasActiveFilters,
}: DocListFiltersProps) {
  // ช่องค้นหา — พิมพ์เห็นทันที ยิงจริง 400ms หลังหยุดพิมพ์
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => { setSearchInput(search); }, [search]);
  const debouncedSearch = useDebouncedCallback((val: string) => onSearch(val), 400);
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (!val) { debouncedSearch.cancel(); onSearch(''); return; }
    debouncedSearch(val);
  };

  // คลังในบริษัทก่อน แล้วค่อยคลังของตัวแทน
  const warehouseOptions = useMemo(() => [
    ...warehouses.filter(w => w.warehouse_type !== 'consignment').map(w => ({ id: w.id, label: w.name })),
    ...warehouses.filter(w => w.warehouse_type === 'consignment').map(w => ({ id: w.id, label: `[ตัวแทน] ${w.name}` })),
  ], [warehouses]);

  const userOptions = useMemo(
    () => users.map(u => ({ id: u.id, label: u.name })),
    [users],
  );

  return (
    <div className="data-filter-card">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full md:flex-1 md:min-w-[220px]">
          <SearchInput
            value={searchInput}
            onChange={handleSearchChange}
            placeholder={searchPlaceholder}
          />
        </div>
        <div className="w-full md:w-64">
          <DateRangePicker
            value={{ startDate: dateRange.startDate, endDate: dateRange.endDate }}
            onChange={(v) => onDateRange(toDateParam(v?.startDate), toDateParam(v?.endDate))}
            showShortcuts
            placeholder="เลือกช่วงวันที่"
          />
        </div>
        {warehouseOptions.length > 1 && (
          <div className="w-full md:w-48">
            <FormSelect
              value={warehouseId}
              onChange={onWarehouse}
              options={warehouseOptions}
              clearLabel={warehouseLabel}
              placeholder="คลัง"
              icon={<Warehouse className="w-4 h-4" />}
              searchPlaceholder="ค้นหาคลัง..."
            />
          </div>
        )}
        {extra}
        {userOptions.length > 1 && (
          <div className="w-full md:w-44">
            <FormSelect
              value={userId}
              onChange={onUser}
              options={userOptions}
              clearLabel="ทุกคน"
              placeholder="ผู้ทำรายการ"
              icon={<User className="w-4 h-4" />}
              searchPlaceholder="ค้นหาผู้ทำรายการ..."
            />
          </div>
        )}
        {hasActiveFilters && (
          <Tooltip text="ล้างตัวกรอง">
            <Button
              variant="ghost"
              icon={<X className="w-4 h-4" />}
              onClick={onClear}
              aria-label="ล้างตัวกรอง"
            >
              <span className="hidden md:inline">ล้างตัวกรอง</span>
            </Button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
