import { useEffect, useRef } from 'react';

/** กลับมาที่แท็บซ้อนกันหลาย event (focus + visibilitychange) — ดึงครั้งเดียวพอ */
const RETURN_DEDUP_MS = 5000;

/**
 * ดึงข้อมูลใหม่เงียบ ๆ ให้หน้าที่ตัวเลขขยับเองหลังเปิดค้างไว้ (ผลบรอดแคสต์ · สถานะกำลังส่ง)
 *
 * - กลับมาที่แท็บ/หน้าต่าง (`visibilitychange` · `focus`) → ดึงใหม่ทันที
 * - `pollMs` = ดึงซ้ำทุก N ms **เฉพาะตอนแท็บเปิดอยู่** (แท็บที่ซ่อนไม่ยิงเปล่า ๆ) · null = ไม่ poll
 *
 * `refresh` ไม่ต้อง memo — hook เรียกตัวล่าสุดเสมอ interval จึงไม่ถูกตั้งใหม่ทุก render
 * (ตั้งใหม่เฉพาะเมื่อ `enabled`/`pollMs` เปลี่ยน เช่นส่งจบแล้วเปลี่ยนจาก 4 วิเป็น 30 วิ)
 */
export function useLiveRefresh(
  refresh: () => void,
  { enabled = true, pollMs = null }: { enabled?: boolean; pollMs?: number | null } = {},
): void {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    // เพิ่งโหลดมาเอง (หรือเพิ่งเปลี่ยนจังหวะ poll) — focus ที่ตามมาทันทีไม่ต้องดึงซ้ำ
    let last = Date.now();
    const run = () => {
      if (document.visibilityState !== 'visible') return;
      last = Date.now();
      refreshRef.current();
    };
    const onReturn = () => {
      if (Date.now() - last >= RETURN_DEDUP_MS) run();
    };
    document.addEventListener('visibilitychange', onReturn);
    window.addEventListener('focus', onReturn);
    const timer = pollMs ? setInterval(run, pollMs) : null;
    return () => {
      document.removeEventListener('visibilitychange', onReturn);
      window.removeEventListener('focus', onReturn);
      if (timer) clearInterval(timer);
    };
  }, [enabled, pollMs]);
}
