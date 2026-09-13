'use client';

import { useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * ตัวกรอง + แบ่งหน้าของหน้าเอกสารคลัง (รับเข้า · เบิกออก · โอนย้าย · ใบสั่งซื้อ)
 * เก็บทุกค่าไว้ใน URL (refresh / กดย้อนกลับแล้วยังอยู่ที่เดิม) และคืน `depsKey`
 * ให้หน้าใช้กันยิง fetch ซ้ำ — กติกาเดียวกับ StockTab / MovementsTab
 */

export const DOC_LIST_DEFAULT_LIMIT = 20;

/** ช่วงวันที่เริ่มต้นเมื่อ URL ไม่ได้ระบุ = 30 วันล่าสุด (ไม่เขียนลง URL) */
export const DOC_LIST_DEFAULT_DAYS = 30;

export interface DocListDateRange {
  startDate: string | null;
  endDate: string | null;
}

export interface DocListParamsOptions {
  /** แท็บสถานะเริ่มต้น (ไม่ส่ง = `all`) — ค่าที่เท่ากับค่านี้จะไม่ถูกเขียนลง URL */
  defaultStatus?: string;
  /** คีย์เพิ่มเติมของหน้านั้น เช่น `sup` (ซัพพลายเออร์ของใบสั่งซื้อ) */
  extraKeys?: string[];
}

export interface DocListParams {
  search: string;
  warehouseId: string;
  status: string;
  userId: string;
  /** ค่าของ `extraKeys` — คีย์ที่ไม่มีใน URL จะเป็นสตริงว่าง */
  extra: Record<string, string>;
  page: number;
  limit: number;
  /** ค่าที่ส่งให้ DateRangePicker (เติมค่าเริ่มต้น 30 วันให้แล้ว) */
  dateRange: DocListDateRange;
  /** ค่าที่ต้องส่งไปกับ fetch จริง */
  effectiveFrom: string;
  effectiveTo: string;
  hasActiveFilters: boolean;
  depsKey: string;
  setParams: (patch: Record<string, string | null>) => void;
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

export function useDocListParams(
  basePath: string,
  opts: DocListParamsOptions = {},
): DocListParams {
  const router = useRouter();
  const searchParams = useSearchParams();

  const defaultStatus = opts.defaultStatus || 'all';
  // เก็บเป็นสตริงเพื่อให้ useMemo ไม่พังเพราะ array literal เปลี่ยน identity ทุก render
  const extraKeysKey = (opts.extraKeys || []).join(',');

  const search = searchParams.get('q') || '';
  const warehouseId = searchParams.get('wh') || '';
  const status = searchParams.get('status') || defaultStatus;
  const userId = searchParams.get('by') || '';
  const urlFrom = searchParams.get('from') || '';
  const urlTo = searchParams.get('to') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = parseInt(searchParams.get('limit') || String(DOC_LIST_DEFAULT_LIMIT), 10)
    || DOC_LIST_DEFAULT_LIMIT;

  const extraKeys = useMemo(
    () => (extraKeysKey ? extraKeysKey.split(',') : []),
    [extraKeysKey],
  );

  const extra = useMemo(() => {
    const out: Record<string, string> = {};
    for (const key of extraKeys) out[key] = searchParams.get(key) || '';
    return out;
  }, [extraKeys, searchParams]);

  // ช่วงวันที่เริ่มต้น — แสดงในปฏิทินแต่ไม่เขียนลง URL จนกว่าผู้ใช้จะเลือกเอง
  const defaultRange = useMemo(
    () => ({ from: dayOffset(-(DOC_LIST_DEFAULT_DAYS - 1)), to: dayOffset(0) }),
    [],
  );
  const hasUrlDates = !!(urlFrom || urlTo);
  const effectiveFrom = hasUrlDates ? urlFrom : defaultRange.from;
  const effectiveTo = hasUrlDates ? urlTo : defaultRange.to;

  const setParams = useCallback((patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      const isDefault =
        value === null
        || value === ''
        || (key === 'status' && value === defaultStatus)
        || (key === 'page' && value === '1')
        || (key === 'limit' && value === String(DOC_LIST_DEFAULT_LIMIT));
      if (isDefault) params.delete(key);
      else params.set(key, value);
    }
    // เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 เสมอ (ยกเว้นตอนสั่งเปลี่ยนหน้าเอง)
    if (!('page' in patch)) params.delete('page');
    const qs = params.toString();
    router.replace(`${basePath}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router, basePath, defaultStatus]);

  const extraActive = extraKeys.some(key => !!extra[key]);
  const hasActiveFilters = !!(search || warehouseId || userId || hasUrlDates || extraActive);

  const clearAll = useCallback(() => {
    const patch: Record<string, string | null> = {
      q: null, wh: null, by: null, from: null, to: null,
    };
    for (const key of extraKeys) patch[key] = null;
    setParams(patch);
  }, [extraKeys, setParams]);

  const extraValues = extraKeys.map(key => extra[key]).join('|');
  const depsKey = [
    page, limit, status, search, warehouseId, userId, effectiveFrom, effectiveTo, extraValues,
  ].join('|');

  return {
    search,
    warehouseId,
    status,
    userId,
    extra,
    page,
    limit,
    dateRange: { startDate: effectiveFrom || null, endDate: effectiveTo || null },
    effectiveFrom,
    effectiveTo,
    hasActiveFilters,
    depsKey,
    setParams,
    clearAll,
  };
}
