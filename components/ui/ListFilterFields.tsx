'use client';

// ช่องกรองมาตรฐานของหน้า list — เสียบเป็น children ของ `<ListFilters>` ได้ทันที
//
// ทำไมต้องห่อ `FormSelect` อีกชั้น: ความกว้างกับไอคอนของช่องเดียวกันเคยต่างกันทุกหน้า
// (คลัง 48/44/40 · ผู้ทำรายการบางหน้ามีไอคอนบางหน้าไม่มี) พอวางเรียงกันเลยดูไม่เป็นชุด
// ที่นี่กำหนดครั้งเดียว — หน้าแค่บอกว่าจะใช้ช่องไหนกับค่าอะไร
//
// ช่องที่ผูกกับข้อมูลของร้าน (คลัง · แบรนด์ · หมวดหมู่ · Supplier) **โหลดตัวเลือกเอง**
// ผ่าน `useFilterOptions` — หน้าไม่ต้อง fetch เอง · หน้าที่ดึงข้อมูลชุดนั้นอยู่แล้วเพื่อใช้
// อย่างอื่นส่งเข้ามาทาง `options` ได้ (จะไม่ยิงซ้ำ)

import { type ReactNode } from 'react';
import DateRangePicker from '@/components/ui/DateRangePicker';
import FormSelect, { type FormSelectOption } from '@/components/ui/FormSelect';
import { BrandIcon, CategoryIcon, SupplierIcon, WarehouseIcon } from '@/lib/icons';
import { getMonthOptions } from '@/lib/month-options';
import { useFilterOptions, type FilterOptionSource } from '@/lib/useFilterOptions';
import { toDateParam, type ListFilterParams } from '@/lib/useListFilterParams';

/** ความกว้างมาตรฐานของช่องกรองแต่ละขนาด — จอแคบเต็มแถวเสมอ */
const WIDTH = {
  sm: 'w-full md:w-44',
  md: 'w-full md:w-48',
  lg: 'w-full md:w-64',
} as const;

export type FilterFieldWidth = keyof typeof WIDTH;

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  /** ข้อความตอนยังไม่เลือก = ตัวเลือก "ทั้งหมด" ของช่องนั้น */
  clearLabel: string;
  placeholder?: string;
  icon?: ReactNode;
  searchPlaceholder?: string;
  width?: FilterFieldWidth;
  /** ซ่อนช่องเมื่อมีตัวเลือกไม่ถึงเท่านี้ (ค่าเริ่มต้น 2 = มีให้เลือกอันเดียวก็ไม่ต้องโชว์) */
  minOptions?: number;
}

/** ช่องเลือกค่าเดียว — ฐานของช่องกรองเกือบทุกช่อง */
export function FilterSelect({
  value, onChange, options, clearLabel, placeholder, icon,
  searchPlaceholder, width = 'md', minOptions = 2,
}: SelectProps) {
  if (options.length < minOptions) return null;
  return (
    <div className={WIDTH[width]}>
      <FormSelect
        value={value}
        onChange={onChange}
        options={options}
        clearLabel={clearLabel}
        placeholder={placeholder || clearLabel}
        icon={icon}
        searchPlaceholder={searchPlaceholder}
      />
    </div>
  );
}

interface DateRangeProps {
  /** ตัวที่ได้จาก `useListFilterParams` — อ่าน/เขียน `from`,`to` ให้เอง */
  filters: Pick<ListFilterParams, 'dateRange' | 'set'>;
  placeholder?: string;
  width?: FilterFieldWidth;
  /** เลือกวันเดียว (รายงานบางหน้าใช้) */
  asSingle?: boolean;
}

/**
 * ช่วงวันที่ — ต่อกับ hook โดยตรง หน้าไม่ต้องรู้ว่าเก็บใน URL ชื่อ `from`/`to`
 * ปุ่มลัด (วันนี้ · สัปดาห์นี้ · เดือนนี้ · ปีนี้ …) มาจาก `lib/date-range-presets`
 */
export function FilterDateRange({
  filters, placeholder = 'เลือกช่วงวันที่', width = 'lg', asSingle,
}: DateRangeProps) {
  return (
    <div className={WIDTH[width]}>
      <DateRangePicker
        value={{ startDate: filters.dateRange.startDate, endDate: filters.dateRange.endDate }}
        onChange={value => filters.set({
          from: toDateParam(value?.startDate),
          to: toDateParam(value?.endDate),
        })}
        showShortcuts
        asSingle={asSingle}
        placeholder={placeholder}
      />
    </div>
  );
}

interface MonthProps {
  value: string;
  onChange: (value: string) => void;
  width?: FilterFieldWidth;
}

/** เดือน (12 เดือนย้อนหลัง) — หน้าเอกสารบัญชีทั้ง 5 หน้าใช้ชุดเดียวกัน */
export function FilterMonth({ value, onChange, width = 'sm' }: MonthProps) {
  return (
    <FilterSelect
      value={value}
      onChange={onChange}
      options={getMonthOptions()}
      clearLabel="ทุกเดือน"
      width={width}
      minOptions={1}
    />
  );
}


// ── ช่องที่ผูกกับข้อมูลของร้าน ────────────────────────────────────────────

interface StoreDataProps {
  value: string;
  onChange: (value: string) => void;
  /** ส่งมาเอง = ไม่ยิง API (หน้าที่โหลดข้อมูลชุดนี้อยู่แล้ว) */
  options?: FormSelectOption[];
  /** ปิดช่องเมื่อร้านไม่ได้เปิดฟีเจอร์ที่เกี่ยว เช่น `features.product_brand` */
  enabled?: boolean;
  width?: FilterFieldWidth;
}

/** ตัวประกอบร่วมของช่องที่โหลดตัวเลือกเองได้ */
function useStoreDataOptions(
  source: FilterOptionSource,
  provided: FormSelectOption[] | undefined,
  enabled: boolean,
) {
  const fetched = useFilterOptions(source, enabled && !provided);
  return provided ?? fetched.options;
}

export function FilterBrand({ value, onChange, options, enabled = true, width = 'sm' }: StoreDataProps) {
  const list = useStoreDataOptions('brands', options, enabled);
  if (!enabled) return null;
  return (
    <FilterSelect
      value={value} onChange={onChange} options={list}
      clearLabel="ทุกแบรนด์" icon={<BrandIcon className="w-4 h-4" />}
      searchPlaceholder="ค้นหาแบรนด์..." width={width}
    />
  );
}

export function FilterCategory({ value, onChange, options, enabled = true, width = 'md' }: StoreDataProps) {
  const list = useStoreDataOptions('categories', options, enabled);
  if (!enabled) return null;
  return (
    <FilterSelect
      value={value} onChange={onChange} options={list}
      clearLabel="ทุกหมวดหมู่" icon={<CategoryIcon className="w-4 h-4" />}
      searchPlaceholder="ค้นหาหมวดหมู่..." width={width}
    />
  );
}

/** คลัง — ร้านที่มีคลังเดียวจะไม่เห็นช่องนี้ (ไม่มีอะไรให้เลือก) */
export function FilterWarehouse({ value, onChange, options, enabled = true, width = 'md' }: StoreDataProps) {
  const list = useStoreDataOptions('warehouses', options, enabled);
  if (!enabled) return null;
  return (
    <FilterSelect
      value={value} onChange={onChange} options={list}
      clearLabel="ทุกคลัง" icon={<WarehouseIcon className="w-4 h-4" />}
      searchPlaceholder="ค้นหาคลัง..." width={width}
    />
  );
}

export function FilterSupplier({ value, onChange, options, enabled = true, width = 'md' }: StoreDataProps) {
  const list = useStoreDataOptions('suppliers', options, enabled);
  if (!enabled) return null;
  return (
    <FilterSelect
      value={value} onChange={onChange} options={list}
      clearLabel="ทุก Supplier" icon={<SupplierIcon className="w-4 h-4" />}
      searchPlaceholder="ค้นหา Supplier..." width={width}
    />
  );
}
