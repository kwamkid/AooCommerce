'use client';

import { useEffect, useRef, useCallback } from 'react';

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
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return useCallback((...args: A) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delayMs);
  }, [delayMs]);
}
