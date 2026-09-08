'use client';

import type { ReactNode } from 'react';

interface BulkActionBarProps {
  /** จำนวนที่เลือกอยู่ — 0 = ไม่แสดงแถบ */
  count: number;
  /** ล้างการเลือกทั้งหมด */
  onClear: () => void;
  /** ปุ่มของหน้านั้น ๆ (ใส่จำนวนต่อท้ายเองได้ผ่าน `count`) */
  children: ReactNode;
}

/**
 * แถบลอยด้านล่างจอตอนเลือกหลายรายการ — "clear all" ซ้าย · ปุ่มของหน้าขวา
 *
 * ใช้กับทุกหน้าที่มี checkbox เลือกหลายบิล (แท็บที่ต้องจัดส่ง · กำลังจัดส่ง · จัดของ&ส่ง)
 * เดิมโครงนี้ถูก copy ไว้ในแต่ละแท็บ — แก้ระยะ/สี/z-index ทีต้องไล่แก้ทุกที่
 *
 * ⚠️ `z-40` ต่ำกว่า Modal/ActionMenu โดยตั้งใจ — แถบนี้ต้องไม่บังโมดัลที่เปิดทับ
 * · เป็นแถบ "ลอย" (เว้นขอบรอบ + มุมมน) ไม่ใช่แถบเต็มความกว้างติดขอบจอ
 * · ปุ่มข้างในควรใช้ `<Button>` ให้หมดเพื่อให้ความสูงเท่ากัน — `btn-focus-action` เตี้ยกว่า 6px
 */
export default function BulkActionBar({ count, onClear, children }: BulkActionBarProps) {
  if (count <= 0) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-40 pb-safe">
      <div className="max-w-screen-xl mx-auto flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg px-4 py-3">
        <button
          onClick={onClear}
          className="text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors flex-shrink-0"
        >
          clear all
        </button>
        <div className="flex items-center gap-2 flex-wrap justify-end">{children}</div>
      </div>
    </div>
  );
}
