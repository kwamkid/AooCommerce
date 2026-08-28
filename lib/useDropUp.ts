'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  type RefObject,
} from 'react';

/**
 * ตรรกะกลาง "dropdown ควรพลิกขึ้นบนไหม" — เดิมเขียนซ้ำอยู่ 3 ที่คนละแบบ
 * (FormSelect, MonthYearPicker, ThaiAddressInput) จนเกณฑ์เริ่มเพี้ยนกันเอง
 *
 * ใช้ได้ 2 ระดับ:
 *  - `shouldDropUp()` — ฟังก์ชันบริสุทธิ์ สำหรับที่ที่มี effect วัดตำแหน่งของตัวเองอยู่แล้ว
 *  - `useDropUp()`    — hook เต็ม (วัด rect + ความสูงจริงของ dropdown + recalc ตอน resize)
 */

export interface DropUpCriteria {
  /**
   * ระยะเผื่อขอบล่างจอ (px) — ถือว่า "ไม่พอ" เมื่อที่ว่างข้างล่าง < ความสูง + margin
   * ThaiAddressInput ใช้ 8 · FormSelect/MonthYearPicker ใช้ 0 (ค่า default)
   */
  margin?: number;
  /**
   * true = พลิกขึ้นเฉพาะเมื่อ **ข้างบนเหลือที่มากกว่าข้างล่าง**
   * (กันเคส trigger อยู่ใกล้ขอบบนจอ พลิกขึ้นแล้วยิ่งทะลุออกด้านบน)
   * false = ข้างล่างไม่พอก็พลิกขึ้นเลย
   */
  requireMoreSpaceAbove?: boolean;
}

/** เกณฑ์ตัดสินล้วน ๆ — rect = ตำแหน่งของ trigger เทียบ viewport */
export function shouldDropUp(
  rect: Pick<DOMRect, 'top' | 'bottom'>,
  dropdownHeight: number,
  { margin = 0, requireMoreSpaceAbove = false }: DropUpCriteria = {},
): boolean {
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow >= dropdownHeight + margin) return false;
  return requireMoreSpaceAbove ? rect.top > spaceBelow : true;
}

export interface UseDropUpOptions extends DropUpCriteria {
  /** dropdown เปิดอยู่หรือไม่ — ปิดอยู่ = ไม่วัด ไม่ผูก listener */
  open: boolean;
  /** ความสูงโดยประมาณ (px) ใช้เมื่อยังวัดของจริงไม่ได้ */
  estimatedHeight: number;
  /**
   * ref ของกล่อง dropdown — ถ้า render แล้ววัด `offsetHeight` ได้ จะใช้ค่าจริง
   * แทน `estimatedHeight` (ของจริงดีกว่าเดา — รายการสั้นจะได้ไม่พลิกโดยไม่จำเป็น)
   */
  dropdownRef?: RefObject<HTMLElement | null>;
  /** คำนวณใหม่ตอน window resize (default: true) */
  recalcOnResize?: boolean;
  /**
   * true = วัดด้วย `useLayoutEffect` (ได้ตำแหน่งก่อน paint → ไม่เห็น dropdown
   * แวบอยู่ข้างล่างหนึ่งเฟรมก่อนพลิกขึ้น) · default false = `useEffect` แบบเดิม
   * **ต้องเป็นค่าคงที่ต่อ call site** (เลือก hook ตามค่านี้ตอน render)
   */
  layout?: boolean;
  /** ค่าที่เปลี่ยนแล้วต้องวัดใหม่ เช่น จำนวนรายการใน dropdown */
  deps?: readonly unknown[];
}

export interface DropUpState {
  /** true = ควรวางไว้ด้านบนของ trigger */
  dropUp: boolean;
  /** rect ของ trigger ตอนวัดล่าสุด (null = ปิดอยู่/ยังไม่ได้วัด) */
  rect: DOMRect | null;
  /** ความสูงที่ใช้ตัดสิน (ของจริงถ้าวัดได้ ไม่งั้น = estimatedHeight) */
  height: number;
}

const sameRect = (a: DOMRect | null, b: DOMRect | null) =>
  a === b ||
  (!!a && !!b &&
    a.top === b.top && a.bottom === b.bottom &&
    a.left === b.left && a.width === b.width);

/**
 * วัดตำแหน่ง trigger + ความสูง dropdown แล้วบอกว่าควรพลิกขึ้นไหม
 *
 * คืน `rect` + `height` มาด้วย เพื่อให้ผู้เรียกที่วาง dropdown แบบ portal (fixed)
 * คำนวณ top/left ต่อได้จากผลการวัดชุดเดียวกัน — ไม่ต้องวัดซ้ำคนละรอบจนค่าเพี้ยน
 */
export function useDropUp(
  triggerRef: RefObject<HTMLElement | null>,
  {
    open,
    estimatedHeight,
    dropdownRef,
    margin,
    requireMoreSpaceAbove,
    recalcOnResize = true,
    layout = false,
    deps = [],
  }: UseDropUpOptions,
): DropUpState {
  const [state, setState] = useState<DropUpState>({
    dropUp: false,
    rect: null,
    height: estimatedHeight,
  });

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const measured = dropdownRef?.current?.offsetHeight;
    const height = measured || estimatedHeight;
    const dropUp = shouldDropUp(rect, height, { margin, requireMoreSpaceAbove });
    setState(prev =>
      prev.dropUp === dropUp && prev.height === height && sameRect(prev.rect, rect)
        ? prev
        : { dropUp, rect, height },
    );
  }, [triggerRef, dropdownRef, estimatedHeight, margin, requireMoreSpaceAbove]);

  const run = () => {
    if (!open) {
      setState(prev =>
        prev.rect === null && !prev.dropUp ? prev : { dropUp: false, rect: null, height: estimatedHeight },
      );
      return;
    }
    measure();
    if (!recalcOnResize) return;
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  };

  // `layout` คงที่ต่อ call site (และ typeof window คงที่ต่อ environment) →
  // ลำดับ hook ไม่มีทางสลับ = pattern useIsomorphicLayoutEffect ปกติ
  const useEffectImpl =
    layout && typeof window !== 'undefined' ? useLayoutEffect : useEffect;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffectImpl(run, [open, measure, recalcOnResize, estimatedHeight, ...deps]);

  return state;
}
