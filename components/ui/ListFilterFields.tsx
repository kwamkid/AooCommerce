'use client';

// ช่องกรองมาตรฐานของหน้า list — เสียบเป็น children ของ `<ListFilters>` ได้ทันที
//
// ทำไมต้องห่อ `FormSelect` อีกชั้น: ความกว้างกับไอคอนของช่องเดียวกันเคยต่างกันทุกหน้า
// (คลัง 48/44/40 · ผู้ทำรายการบางหน้ามีไอคอนบางหน้าไม่มี) พอวางเรียงกันเลยดูไม่เป็นชุด
// ที่นี่กำหนดครั้งเดียว — หน้าแค่บอกว่าจะใช้ช่องไหนกับค่าอะไร
//
// ⛔ ช่องที่ผูกกับข้อมูลของร้าน (คลัง · แบรนด์ · หมวดหมู่ · Supplier) จะย้ายมาที่นี่ใน
//    กลุ่ม ③ พร้อมความสามารถโหลดตัวเลือกเอง — ตอนนี้หน้ายังส่ง options มาเอง

import { type ReactNode } from 'react';
import DateRangePicker from '@/components/ui/DateRangePicker';
import FormSelect, { type FormSelectOption } from '@/components/ui/FormSelect';
import { getMonthOptions } from '@/lib/month-options';
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
