'use client';

// ตัวกรอง + แบ่งหน้าของหน้า list ทุกหน้า — เก็บทุกค่าไว้ใน URL
//
// ทำไมต้องอยู่ใน URL: refresh แล้วยังอยู่ที่เดิม · กดย้อนกลับได้ · ส่งลิงก์ที่กรองไว้แล้วให้
// คนอื่นเปิดต่อได้ · เปิดหลายแท็บพร้อมกันคนละตัวกรองได้ — 24 หน้าที่ยังเก็บใน `useState`
// ล้วนทำสามอย่างนี้ไม่ได้เลย
//
// ⛔ ห้ามเขียน `setParams` ของตัวเองในหน้าอีก — ตรรกะ "ลบค่าที่เท่ากับค่าเริ่มต้นออกจาก URL
//    แล้วเด้งกลับหน้า 1" เคยถูกก๊อปไป 10 กว่าที่ และเพี้ยนกันคนละแบบ
//
// ยกมาจาก `app/inventory/components/useDocListParams.ts` (ที่ทำไว้ดีอยู่แล้ว) แล้วถอด
// ความรู้เรื่องคลัง/ผู้ทำรายการออก ให้หน้าประกาศช่องของตัวเองแทน

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getDateRangePreset, type DateRangePreset } from '@/lib/date-range-presets';

export const LIST_DEFAULT_LIMIT = 20;

/** ชนิดของช่อง — บอกให้ hook รู้ว่าต้องปฏิบัติกับค่านั้นยังไง */
export type ListFilterFieldType = 'text' | 'select' | 'date';

export interface ListFilterField {
  type: ListFilterFieldType;
  /** ค่าที่ถือว่า "ยังไม่ได้กรอง" — ตรงกับค่านี้จะไม่ถูกเขียนลง URL (เช่น status = 'all') */
  default?: string;
}

export interface ListFilterOptions {
  /** ช่องทั้งหมดของหน้านี้ — key = ชื่อ query param ที่จะใช้ใน URL */
  fields: Record<string, ListFilterField>;
  /**
   * ช่วงวันที่เริ่มต้นเมื่อ URL ไม่ได้ระบุ — ใส่เมื่อหน้ามีช่อง `from`/`to`
   *
   * รับได้ 2 แบบ: ชื่อช่วงจากทะเบียนกลาง (`'today'` · `'this_week'` · `'this_month'` …
   * ชุดเดียวกับปุ่มลัดใน `DateRangePicker`) หรือจำนวนวันย้อนหลังรวมวันนี้ (`30`)
   *
   * ค่าเริ่มต้น **ไม่เขียนลง URL** จนกว่าผู้ใช้จะเลือกเอง — ลิงก์ที่ไม่มี `?from=` จึงแปลว่า
   * "ช่วงมาตรฐานของหน้านี้" ไม่ใช่ช่วงที่ค้างจากวันที่กดลิงก์
   * ไม่ใส่ = ไม่มีช่วงเริ่มต้น (ดูทั้งหมด)
   */
  defaultRange?: DateRangePreset | number;
  defaultLimit?: number;
}

export interface ListFilterDateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface ListFilterParams {
  /** ค่าปัจจุบันของทุกช่อง (ช่องที่ไม่มีใน URL = ค่า default หรือสตริงว่าง) */
  values: Record<string, string>;
  page: number;
  limit: number;
  /** ช่วงวันที่พร้อมส่งให้ `DateRangePicker` — เติมค่าเริ่มต้นให้แล้ว */
  dateRange: ListFilterDateRange;
  /** ค่าที่ต้องส่งไปกับ fetch จริง (ต่างจาก `values.from/to` ตรงที่เติมค่าเริ่มต้นให้) */
  effectiveFrom: string;
  effectiveTo: string;
  /** มีตัวกรองที่ผู้ใช้ตั้งเองอยู่ไหม — ใช้ตัดสินว่าจะโชว์ปุ่ม "ล้างตัวกรอง" */
  hasActiveFilters: boolean;
  /** ใส่ใน deps ของ fetch — เปลี่ยนเมื่อมีอะไรที่กระทบผลลัพธ์เปลี่ยนเท่านั้น */
  depsKey: string;
  set: (patch: Record<string, string | number | null>) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  clearAll: () => void;
}

/** `Date` หรือสตริง → `YYYY-MM-DD` (ค่าว่าง = สตริงว่าง) */
export function toDateParam(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** วันที่ของวันนี้ + N วัน (N ติดลบ = ย้อนหลัง) */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateParam(d);
}

export function useListFilterParams(
  basePath: string,
  options: ListFilterOptions,
): ListFilterParams {
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultLimit = options.defaultLimit ?? LIST_DEFAULT_LIMIT;
  // เก็บรูปร่างช่องเป็นสตริงเพื่อให้ useMemo ไม่พังเพราะ object literal เปลี่ยน identity ทุก render
  const fieldsKey = useMemo(
    () => Object.entries(options.fields).map(([k, f]) => `${k}:${f.type}:${f.default ?? ''}`).join(','),
    [options.fields],
  );
  const fields = useMemo(() => {
    const out: Record<string, ListFilterField> = {};
    for (const part of fieldsKey.split(',').filter(Boolean)) {
      const [key, type, def] = part.split(':');
      out[key] = { type: type as ListFilterFieldType, default: def || undefined };
    }
    return out;
  }, [fieldsKey]);

  const values = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [key, field] of Object.entries(fields)) {
      out[key] = searchParams.get(key) || field.default || '';
    }
    return out;
  }, [fields, searchParams]);

  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = parseInt(searchParams.get('limit') || String(defaultLimit), 10) || defaultLimit;

  // ช่วงวันที่เริ่มต้น — แสดงในปฏิทินแต่ไม่เขียนลง URL จนกว่าผู้ใช้จะเลือกเอง
  const urlFrom = searchParams.get('from') || '';
  const urlTo = searchParams.get('to') || '';
  const hasUrlDates = !!(urlFrom || urlTo);
  const defaultRange = useMemo(() => {
    const preset = options.defaultRange;
    if (!preset) return { from: '', to: '' };
    if (typeof preset === 'number') {
      return { from: dayOffset(-(preset - 1)), to: dayOffset(0) };
    }
    const { from, to } = getDateRangePreset(preset);
    return { from: toDateParam(from), to: toDateParam(to) };
  }, [options.defaultRange]);
  const effectiveFrom = hasUrlDates ? urlFrom : defaultRange.from;
  const effectiveTo = hasUrlDates ? urlTo : defaultRange.to;

  const set = useCallback((patch: Record<string, string | number | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, raw] of Object.entries(patch)) {
      const value = raw === null ? '' : String(raw);
      const field = fields[key];
      // ค่าที่เท่ากับค่าเริ่มต้นไม่ต้องอยู่ใน URL — ลิงก์จะได้สั้นและอ่านออกว่ากรองอะไรอยู่จริง
      const isDefault =
        value === ''
        || (field?.default !== undefined && value === field.default)
        || (key === 'page' && value === '1')
        || (key === 'limit' && value === String(defaultLimit));
      if (isDefault) params.delete(key);
      else params.set(key, value);
    }
    // เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 เสมอ (ยกเว้นตอนสั่งเปลี่ยนหน้าเอง)
    if (!('page' in patch)) params.delete('page');
    const qs = params.toString();
    router.replace(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router, basePath, fields, defaultLimit]);

  const setPage = useCallback((next: number) => set({ page: next }), [set]);
  const setLimit = useCallback((next: number) => set({ limit: next, page: 1 }), [set]);

  const clearAll = useCallback(() => {
    const patch: Record<string, string | null> = {};
    for (const key of Object.keys(fields)) patch[key] = null;
    set(patch);
  }, [fields, set]);

  /** ช่องที่ผู้ใช้ตั้งเอง — ไม่นับช่องที่ยังเป็นค่าเริ่มต้น */
  const hasActiveFilters = useMemo(
    () => Object.entries(fields).some(([key, field]) => {
      const current = searchParams.get(key);
      return !!current && current !== (field.default || '');
    }),
    [fields, searchParams],
  );

  const depsKey = [
    page, limit,
    ...Object.keys(fields).sort().map(key => values[key]),
    effectiveFrom, effectiveTo,
  ].join('|');

  return {
    values, page, limit,
    dateRange: { startDate: effectiveFrom || null, endDate: effectiveTo || null },
    effectiveFrom, effectiveTo,
    hasActiveFilters, depsKey,
    set, setPage, setLimit, clearAll,
  };
}
