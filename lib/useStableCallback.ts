'use client';

import { useRef, useCallback } from 'react';

/**
 * คืนฟังก์ชันที่ **identity คงที่ตลอดอายุ component** แต่เรียกโค้ดล่าสุดเสมอ
 * (เก็บ fn ล่าสุดไว้ใน ref แล้ว useCallback ด้วย deps ว่าง)
 *
 * ใช้เมื่อต้องส่ง callback เข้า component ที่ `memo()` — ถ้าส่ง arrow function
 * ตรง ๆ หรือ `useCallback` ที่ deps เปลี่ยนบ่อย prop จะเป็นค่าใหม่ทุก render
 * ของหน้าแม่ → memo ไร้ผลทันที · ตัวนี้ทำให้ไม่ต้องไล่ deps ของฟังก์ชันใหญ่
 * ที่อ่าน state หลายตัว
 *
 * const onSave = useStableCallback((id: string) => { ...อ่าน state ล่าสุดได้ตามปกติ... });
 * <HeavyMemoPanel onSave={onSave} />
 *
 * ⚠️ **ห้ามเรียกระหว่าง render** — ใช้ใน event handler / effect เท่านั้น
 * (ระหว่าง render ของรอบแรก ref ยังชี้ closure เก่าอยู่ ตามข้อจำกัดเดียวกับ
 * useEffectEvent ของ React)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useStableCallback<T extends (...args: any[]) => any>(fn: T): T {
  const fnRef = useRef(fn);
  // เขียนตอน render ตั้งใจ — ต้องได้ closure ล่าสุดแม้ handler ถูกเรียกก่อน effect ได้ flush
  // (แบบเดียวกับ lib/useDebounce.ts) · ref นี้ไม่มีผลต่อสิ่งที่ render ออกมาเลย
  // eslint-disable-next-line react-hooks/refs
  fnRef.current = fn;

  // cast อยู่ข้างนอก useCallback — ใส่ `as T` คร่อม arrow function ทำให้ eslint
  // (react-hooks/use-memo) มองไม่ออกว่าเป็น inline function แล้วตีเป็น error
  const stable = useCallback((...args: Parameters<T>) => fnRef.current(...args), []);
  return stable as T;
}
