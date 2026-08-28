// Path: components/ui/Tooltip.tsx
// ป้ายคำอธิบายสั้น ๆ ของปุ่ม/ไอคอน — ใช้แทน title="" ของเบราว์เซอร์
// (title แต่งสไตล์ไม่ได้ · ขึ้นช้าเป็นวินาที · บนมือถือไม่ขึ้นเลย)
//
// ต่างจาก HelpHint ยังไง (มีทั้งคู่ อย่าสับสน):
//   Tooltip  = ป้ายสั้น ขึ้นตอน hover / โฟกัสด้วยคีย์บอร์ด / แตะค้างบนมือถือ
//              บอกว่า "ปุ่มไอคอนนี้คืออะไร"
//   HelpHint = ไอคอน ? กดเปิด อธิบายยาวได้หลายบรรทัด สำหรับ "วิธีทำ"
'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type FocusEvent as ReactFocusEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { shouldDropUp } from '@/lib/useDropUp';

const GAP = 8;             // ระยะห่างระหว่างป้ายกับ trigger
const EDGE = 8;            // กันชนขอบซ้าย/ขวาของจอ
const ARROW_INSET = 10;    // หางลูกศรต้องไม่เลื่อนไปเลยมุมกล่อง
const SHOW_DELAY = 350;    // เมาส์ค้างเท่านี้ถึงจะขึ้น — กันเมาส์ผ่านแล้วเด้ง
const LONG_PRESS = 400;    // มือถือ: แตะค้างเท่านี้ถึงจะขึ้น
const TOUCH_LINGER = 2500; // มือถือ: ขึ้นแล้วอยู่เท่านี้แล้วหายเอง (ไม่มี mouseleave ให้พึ่ง)
const FALLBACK_H = 32;     // ความสูงเดาไว้ก่อน เผื่อวัดของจริงยังไม่ได้

interface TooltipProps {
  children: ReactNode;
  /** ข้อความ — ขึ้นบรรทัดใหม่ด้วย `\n` · ค่าว่าง = ไม่แสดง tooltip เลย */
  text: string;
  /** ด้านที่อยากให้ขึ้น — ถ้าด้านนั้นชนขอบจอจะพลิกไปอีกด้านให้เอง */
  position?: 'top' | 'bottom';
  /**
   * กล่องครอบ trigger:
   *  - `'contents'` (default) = `display: contents` — **ไม่แทรกกล่องใด ๆ**
   *    layout เดิมของ call site จึงไม่ขยับ (ใช้ใน flex/grid/inline ได้หมด)
   *  - `'inline-flex'` = มีกล่องจริง — ใช้เมื่อ trigger เป็น **ปุ่มที่ disabled ได้**
   *    เพราะปุ่ม disabled ไม่ยิง pointer event เลย ต้องมีกล่องครอบถึงจะ hover ติด
   */
  box?: 'contents' | 'inline-flex';
  /** หน่วงก่อนขึ้นตอน hover (ms) */
  delay?: number;
}

interface Pos {
  top: number;
  left: number;
  /** true = ป้ายอยู่เหนือ trigger */
  up: boolean;
  /** ระยะที่หางลูกศรต้องขยับ เมื่อกล่องถูกดันหนีขอบจอ (px) */
  arrow: number;
}

/**
 * กล่องของ trigger เทียบ viewport
 * — `display: contents` ทำให้ตัว host ไม่มีกล่องของตัวเอง (rect เป็น 0 หมด)
 *   จึงต้องรวมกล่องของลูกแทน
 */
function anchorRect(host: HTMLElement | null): DOMRect | null {
  if (!host) return null;
  const own = host.getBoundingClientRect();
  if (own.width || own.height) return own;

  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
  for (const kid of Array.from(host.children)) {
    const k = kid.getBoundingClientRect();
    if (!k.width && !k.height) continue;
    left = Math.min(left, k.left);
    top = Math.min(top, k.top);
    right = Math.max(right, k.right);
    bottom = Math.max(bottom, k.bottom);
  }
  if (left === Infinity) return null;
  return new DOMRect(left, top, right - left, bottom - top);
}

/** element ที่ควรผูก aria-describedby (= ตัวปุ่มจริง ไม่ใช่ span ครอบ) */
const anchorEl = (host: HTMLElement | null): HTMLElement | null =>
  (host?.firstElementChild as HTMLElement | null) ?? host;

/** โฟกัสมาจากคีย์บอร์ดไหม — คลิกเมาส์ก็ทำให้ปุ่มโฟกัสได้ แต่ไม่ควรเด้ง tooltip */
function isKeyboardFocus(el: EventTarget | null): boolean {
  const node = el as HTMLElement | null;
  if (!node?.matches) return false;
  try {
    return node.matches(':focus-visible');
  } catch {
    return true; // เบราว์เซอร์เก่าที่ไม่รู้จัก :focus-visible — ให้ขึ้นไว้ก่อนดีกว่าไม่ขึ้น
  }
}

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function Tooltip({
  children,
  text,
  position = 'top',
  box = 'contents',
  delay = SHOW_DELAY,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);
  /** แตะค้างจนป้ายขึ้นแล้ว → กลืน click ที่ตามมา ไม่ให้ปุ่มทำงานโดยไม่ตั้งใจ */
  const swallowClick = useRef(false);
  const tipId = useId();
  const wantTop = position === 'top';

  const clearTimers = useCallback(() => {
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  const hide = useCallback(() => {
    clearTimers();
    setVisible(false);
    setPos(null);
  }, [clearTimers]);

  useEffect(() => clearTimers, [clearTimers]);

  const place = useCallback(() => {
    const rect = anchorRect(hostRef.current);
    if (!rect) return;

    const tip = tipRef.current;
    const th = tip?.offsetHeight || FALLBACK_H;
    const tw = tip?.offsetWidth || 0;
    const need = th + GAP;

    // พลิกด้านด้วยเกณฑ์กลางของระบบ (lib/useDropUp) — ห้ามเขียนสูตรขอบจอเอง
    // ฝั่ง 'top' ถามคำถามกลับด้าน ("ข้างบนไม่พอไหม") จึงส่ง rect ที่กลับแกน Y ให้
    const flipped = wantTop
      ? shouldDropUp(
          { top: window.innerHeight - rect.bottom, bottom: window.innerHeight - rect.top },
          need,
          { requireMoreSpaceAbove: true },
        )
      : shouldDropUp(rect, need, { requireMoreSpaceAbove: true });
    const up = wantTop ? !flipped : flipped;

    // จัดกึ่งกลาง trigger แล้วหนีขอบซ้าย/ขวา — หางลูกศรขยับตามให้ยังชี้ที่ปุ่ม
    const center = rect.left + rect.width / 2;
    const half = tw / 2;
    const min = EDGE + half;
    const max = window.innerWidth - EDGE - half;
    const left = max < min ? window.innerWidth / 2 : Math.min(Math.max(center, min), max);
    const limit = Math.max(0, half - ARROW_INSET);
    const arrow = Math.min(limit, Math.max(-limit, center - left));
    const top = up ? rect.top - GAP : rect.bottom + GAP;

    setPos(prev =>
      prev && prev.top === top && prev.left === left && prev.up === up && prev.arrow === arrow
        ? prev
        : { top, left, up, arrow },
    );
  }, [wantTop]);

  // วัดหลัง commit เดียวกับที่ป้ายถูก render → ได้ขนาดจริงก่อน paint (ไม่เห็นแวบ)
  useIsoLayoutEffect(() => {
    if (!visible) return;
    place();
  }, [visible, place, text]);

  // เลื่อนจอ/ย่อขยายจอแล้วป้ายจะลอยค้างผิดที่ — ยุบทิ้งไปเลย
  useEffect(() => {
    if (!visible) return;
    const onMove = () => hide();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [visible, hide]);

  // ผูกคำอธิบายเข้ากับตัวปุ่มจริง เพื่อให้ screen reader อ่านตอนโฟกัสถึง
  useEffect(() => {
    const el = anchorEl(hostRef.current);
    if (!el) return;
    if (!visible) { el.removeAttribute('aria-describedby'); return; }
    el.setAttribute('aria-describedby', tipId);
    return () => el.removeAttribute('aria-describedby');
  }, [visible, tipId]);

  if (!text) return <>{children}</>;

  const onPointerEnter = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === 'touch') return; // มือถือใช้แตะค้างแทน
    clearTimers();
    showTimer.current = window.setTimeout(() => setVisible(true), delay);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    swallowClick.current = false;
    clearTimers();
    if (e.pointerType !== 'touch') {
      hide(); // คลิกแล้วยุบ ไม่บังปุ่มที่เพิ่งกด
      return;
    }
    showTimer.current = window.setTimeout(() => {
      showTimer.current = null;
      swallowClick.current = true;
      setVisible(true);
      hideTimer.current = window.setTimeout(() => {
        swallowClick.current = false; // เผื่อ click ไม่เคยมา (นิ้วเลื่อนออก) ธงจะได้ไม่ค้าง
        hide();
      }, TOUCH_LINGER);
    }, LONG_PRESS);
  };

  /** ปล่อยนิ้วก่อนครบเวลา = แตะปกติ → ยกเลิกป้าย ปล่อยให้ปุ่มทำงานตามเดิม */
  const onTouchEnd = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType !== 'touch') return;
    if (showTimer.current) { clearTimeout(showTimer.current); showTimer.current = null; }
  };

  return (
    <span
      ref={hostRef}
      style={box === 'contents' ? { display: 'contents' } : undefined}
      className={box === 'inline-flex' ? 'inline-flex' : undefined}
      onPointerEnter={onPointerEnter}
      onPointerLeave={hide}
      onPointerDown={onPointerDown}
      onPointerUp={onTouchEnd}
      // ระบบยึดท่าทางไปกลางคัน (เช่นเริ่มสกอลล์ / iOS เด้ง callout) — ถ้าป้ายขึ้นแล้วจากแตะค้าง
      // ปล่อยให้ตัวจับเวลาเป็นคนเก็บ ไม่งั้นบางเบราว์เซอร์จะปิดป้ายทันทีจนแตะค้างใช้ไม่ได้เลย
      onPointerCancel={() => { if (!swallowClick.current) hide(); }}
      onFocus={(e: ReactFocusEvent<HTMLSpanElement>) => {
        if (isKeyboardFocus(e.target)) setVisible(true); // คีย์บอร์ดไม่ต้องหน่วง
      }}
      onBlur={hide}
      onClickCapture={(e: ReactMouseEvent<HTMLSpanElement>) => {
        if (!swallowClick.current) return;
        swallowClick.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
      {visible && createPortal(
        <div
          ref={tipRef}
          id={tipId}
          role="tooltip"
          className="fixed pointer-events-none"
          style={pos
            ? {
                top: pos.top,
                left: pos.left,
                transform: `translate(-50%, ${pos.up ? '-100%' : '0'})`,
                zIndex: 10000,
              }
            : { top: 0, left: 0, visibility: 'hidden', zIndex: 10000 }}
        >
          <div className="relative bg-gray-900 dark:bg-slate-700 text-white text-sm rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
            {text.includes('\n') ? text.split('\n').map((line, i) => <div key={i}>{line}</div>) : text}
            <div
              className={`absolute -translate-x-1/2 w-2 h-2 bg-gray-900 dark:bg-slate-700 rotate-45 ${
                (pos ? pos.up : wantTop) ? '-bottom-1' : '-top-1'
              }`}
              style={{ left: `calc(50% + ${pos?.arrow ?? 0}px)` }}
            />
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
