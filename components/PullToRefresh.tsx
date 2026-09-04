'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import { RefreshCw } from 'lucide-react';
import { isStandalone } from '@/lib/pwa-install';

/** ลากลงมาเกินนี้แล้วปล่อย = รีเฟรช (px) */
const TRIGGER_PX = 80;
/** ระยะที่วงกลมเลื่อนลงมาสูงสุด (px) — ให้พอเห็นว่ามีอะไรโผล่มา แต่ไม่บังเนื้อหา */
const INDICATOR_TRAVEL_PX = 40;

/** ค่าคงที่ — ตอบว่า "เปิดจากแอปที่ติดตั้งแล้วไหม" ครั้งเดียวต่อการเปิดหน้า ไม่มีอะไรให้ subscribe */
const subscribeNever = () => () => {};
const notStandaloneOnServer = () => false;

interface PullToRefreshProps {
  /** กล่องที่เลื่อนจริงของหน้า (`<main>` ใน Layout) — ต้องเป็นตัวที่มี `relative` ด้วย */
  scrollRef: RefObject<HTMLElement | null>;
}

/**
 * รูดลงเพื่อรีเฟรช — **เฉพาะตอนเปิดจากแอปที่ติดตั้งแล้ว**
 *
 * ในแอปที่ติดตั้งบน iPhone ไม่มีแถบเบราว์เซอร์ และ iOS ไม่มีท่ารูดรีเฟรชให้ (เราปิด
 * overscroll ไปแล้วใน globals.css ด้วย) คนที่ชินจาก Safari จึงรูดแล้วไม่มีอะไรเกิดขึ้น
 * — ส่วนในเบราว์เซอร์ปกติ "ห้ามเปิด" เพราะเขามีท่าของตัวเองอยู่แล้ว จะกลายเป็นรีเฟรชซ้อนสอง
 */
export default function PullToRefresh({ scrollRef }: PullToRefreshProps) {
  // ตัดสินหลัง hydrate — isStandalone() อ่าน window ซึ่งไม่มีตอน SSR
  // (useSyncExternalStore = ได้ค่าฝั่ง server เป็น false โดยไม่ต้อง setState ใน effect)
  const enabled = useSyncExternalStore(subscribeNever, isStandalone, notStandaloneOnServer);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    const el = scrollRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let curDx = 0;
    let curDy = 0;
    let engaged = false;
    let raf = 0;

    /**
     * เริ่มลากจากตรงนี้แล้วนับเป็น "รูดรีเฟรช" ได้ไหม
     *
     * ต้องไล่ดู **ทุกกล่องที่เลื่อนได้เอง** ตั้งแต่จุดที่นิ้วแตะขึ้นมาถึง main —
     * เช่นรายการข้อความในหน้าแชทที่เลื่อนของตัวเอง ถ้าเขาเลื่อนขึ้นไปอ่านของเก่าอยู่
     * แล้วลากต่อ ต้องไม่กลายเป็นรีเฟรชทั้งแอปทิ้งที่อ่านค้างไว้
     */
    const canPullFrom = (target: EventTarget | null): boolean => {
      let node: Element | null = target instanceof Element ? target : null;
      // ในช่องกรอกข้อความ การลากคือการเลือกข้อความ ไม่ใช่ท่ารีเฟรช
      if (node?.closest('input, textarea, [contenteditable]')) return false;
      while (node) {
        if (node.hasAttribute('data-ptr-ignore')) return false;
        const overflowY = getComputedStyle(node).overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollTop > 0) return false;
        if (node === el) break;
        node = node.parentElement;
      }
      return true;
    };

    const reset = () => {
      engaged = false;
      curDx = 0;
      curDy = 0;
      setDragging(false);
      setProgress(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      curDx = 0;
      curDy = 0;
      engaged = canPullFrom(e.target);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!engaged || refreshingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      curDx = t.clientX - startX;
      curDy = t.clientY - startY;
      if (raf) return; // ยิง state ไม่เกินเฟรมละครั้ง
      raf = requestAnimationFrame(() => {
        raf = 0;
        setDragging(true);
        // ลากขึ้น หรือค่อนไปทางแนวนอน (ปัดซ้าย/ขวา) = ไม่ใช่ท่ารีเฟรช
        setProgress(curDy <= 0 || Math.abs(curDx) > curDy ? 0 : Math.min(curDy / TRIGGER_PX, 1.25));
      });
    };

    const onTouchEnd = () => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      const shouldRefresh = engaged && curDy >= TRIGGER_PX && Math.abs(curDx) <= curDy;
      if (!shouldRefresh) {
        reset();
        return;
      }
      engaged = false;
      setDragging(false);
      refreshingRef.current = true;
      setRefreshing(true);
      // โหลดใหม่ทั้งหน้า — "รีเฟรช" ในความหมายของผู้ใช้คือได้ของใหม่ทั้งจอ และหน้าส่วนใหญ่
      // เป็น client component ที่ fetch ข้อมูลเอง `router.refresh()` จึงไม่ได้ดึงข้อมูลใหม่ให้
      window.location.reload();
    };

    // passive: true ทุกตัว — เราไม่เคย preventDefault (ไม่ไปขวางการเลื่อนของเบราว์เซอร์)
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [enabled, scrollRef]);

  // ยังไม่ลาก = ไม่มี DOM เลย จะได้ไม่ไปแย่งพื้นที่/บังอะไรของหน้า
  if (!enabled || (progress <= 0 && !refreshing)) return null;

  return (
    <div
      aria-hidden
      className="absolute left-1/2 top-2 z-20 -translate-x-1/2 pointer-events-none"
      style={{
        opacity: refreshing ? 1 : Math.min(progress, 1),
        transform: `translate(-50%, ${(refreshing ? 1 : progress) * INDICATOR_TRAVEL_PX}px) rotate(${
          refreshing ? 0 : progress * 180
        }deg)`,
        // ระหว่างลากต้องติดนิ้ว (ไม่มี transition) ปล่อยแล้วค่อยไหลกลับ
        transition: dragging ? 'none' : 'transform .2s, opacity .2s',
      }}
    >
      <div className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 shadow-md border border-gray-200 dark:border-slate-700 flex items-center justify-center text-primary">
        <RefreshCw className={`w-5 h-5${refreshing ? ' animate-spin' : ''}`} />
      </div>
    </div>
  );
}
