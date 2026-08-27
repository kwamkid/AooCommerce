'use client';

import { useEffect, useRef } from 'react';

// กด back กลับมาจากหน้าภายนอก (เช่นหน้า OAuth ของ Shopee/TikTok/Lazada) —
// browser restore หน้าเดิมจาก bfcache พร้อม React state ทั้งหมด ทำให้ปุ่มที่ตั้ง
// loading ค้างไว้ก่อน redirect ค้างตลอดจนต้อง refresh เอง
// hook นี้เรียก reset ทุกครั้งที่หน้าโผล่กลับมา (pageshow) — ตอน mount ปกติ
// state ยังเป็นค่าเริ่มต้นอยู่แล้ว การ reset ซ้ำจึงไม่มีผลข้างเคียง
export function useBfcacheReset(reset: () => void) {
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    const handler = () => resetRef.current();
    window.addEventListener('pageshow', handler);
    return () => window.removeEventListener('pageshow', handler);
  }, []);
}
