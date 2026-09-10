'use client';

import { useEffect, useMemo, useRef } from 'react';

/** ฟังก์ชันที่ได้จาก `useDebouncedCallback` — เรียกตรง ๆ = รอ delay · `.now()` = ยิงทันที · `.cancel()` = ทิ้งรอบที่รอ */
export interface DebouncedFn<A extends unknown[]> {
  (...args: A): void;
  /**
   * เรียกทันทีและยกเลิกรอบที่รออยู่ — ใช้กับค่าที่ไม่ได้เปลี่ยนรัว ๆ (เลือกบัญชี · เลือกกลุ่ม)
   * ไม่ต้องให้ผู้ใช้รอ delay และรอบเก่าที่ค้างจะไม่ยิงตามมาทับผลใหม่
   */
  now: (...args: A) => void;
  /** ทิ้งรอบที่รออยู่ (ไม่ยิง) */
  cancel: () => void;
}

/**
 * Debounced callback with automatic cleanup on unmount — ใช้กับ search input
 * ทุกหน้า list แทนการเขียน setTimeout/clearTimeout เอง (เดิม copy กัน 17 ไฟล์
 * ด้วย delay 300/400/500ms ปนกัน และไม่มีตัวไหน clear timer ตอน unmount)
 *
 * const debouncedSearch = useDebouncedCallback((q: string) => setParams({ q }));
 * <SearchInput onChange={v => { setSearchInput(v); debouncedSearch(v); }} />
 */
export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => void,
  delayMs = 400,
): DebouncedFn<A> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  // จำฟังก์ชันล่าสุดหลัง commit (เขียน ref ระหว่าง render ไม่ได้) — timer/`now()` ถูกเรียกหลังจากนั้นเสมอ
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return useMemo(() => {
    const cancel = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
    };
    const debounced = ((...args: A) => {
      cancel();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        fnRef.current(...args);
      }, delayMs);
    }) as DebouncedFn<A>;
    debounced.now = (...args: A) => {
      cancel();
      fnRef.current(...args);
    };
    debounced.cancel = cancel;
    return debounced;
  }, [delayMs]);
}
