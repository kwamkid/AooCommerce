// Path: components/ui/Popover.tsx
//
// กล่องลอยเล็ก ๆ ยึดกับปุ่ม (popover) — เหมือน ActionMenu แต่ข้างในใส่อะไรก็ได้ (ช่องกรอก · ปุ่ม)
// ใช้เมื่อ "กดปุ่มแล้วอยากได้กล่องเล็กข้าง ๆ ไม่ใช่ Modal เต็มจอ" เช่น กล่องคิดราคาลดเหลือ
//
//   ActionMenu = รายการเมนูกดเลือก 1 อย่าง · HelpHint = คำอธิบาย (กล่องดำ อ่านอย่างเดียว)
//   Popover    = เนื้อหาโต้ตอบได้ ผู้เรียกคุม open/onClose เอง
//
// วาดแบบ portal (`position: fixed` · z-9999) จึงวางในแถวตาราง/กล่องที่ตัดของล้นได้ · พลิกขึ้นเอง
// เมื่อข้างล่างไม่พอ (useDropUp) · ตามตำแหน่งเมื่อเลื่อนหน้า (ไม่ปิด — ผู้ใช้อาจพิมพ์ค้างอยู่) ·
// ปิดเมื่อกดนอกกล่อง / Esc · click ในกล่องไม่ทะลุไปหา parent (แถวตารางที่กดแล้วเปิดหน้า)
'use client';

import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDropUp } from '@/lib/useDropUp';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** ref ของปุ่มที่เปิด — ใช้ยึดตำแหน่ง และกดปุ่มเองไม่นับเป็น "กดนอกกล่อง" */
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  /** ขอบกล่องเทียบกับปุ่ม — `end` (ค่าเริ่มต้น) ขอบขวาตรงกัน · `start` ขอบซ้ายตรงกัน · พลิกเองถ้าล้นจอ */
  align?: 'start' | 'end';
  /** ความกว้างกล่อง (px) — ต้องรู้ตัวเลขเพื่อกันล้นขอบจอ */
  width?: number;
  /** ความสูงโดยประมาณ (px) ใช้ตัดสินพลิกขึ้นก่อนวัดของจริงได้ */
  estimatedHeight?: number;
  ariaLabel?: string;
}

const GAP = 6;
const EDGE = 8;

export default function Popover({
  open,
  onClose,
  anchorRef,
  children,
  align = 'end',
  width = 288,
  estimatedHeight = 220,
  ariaLabel,
}: PopoverProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const { dropUp, rect } = useDropUp(anchorRef, {
    open,
    estimatedHeight,
    dropdownRef: boxRef,
    margin: EDGE,
    requireMoreSpaceAbove: true,
    layout: true,
    recalcOnScroll: true,
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boxRef.current?.contains(t) || anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !rect || typeof document === 'undefined') return null;

  // ชิดขวาแล้วล้นซ้ายจอ → ชิดซ้ายแทน (และกลับกัน)
  let side = align;
  if (side === 'end' && rect.right - width < EDGE) side = 'start';
  if (side === 'start' && rect.left + width > window.innerWidth - EDGE) side = 'end';
  const left = side === 'start' ? Math.max(EDGE, rect.left) : Math.min(window.innerWidth - EDGE, rect.right);

  return createPortal(
    <div
      ref={boxRef}
      role="dialog"
      aria-label={ariaLabel}
      onClick={e => e.stopPropagation()}
      className="fixed bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg"
      style={{
        top: dropUp ? rect.top - GAP : rect.bottom + GAP,
        left,
        width,
        transform: `translate(${side === 'start' ? '0' : '-100%'}, ${dropUp ? '-100%' : '0'})`,
        zIndex: 9999,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
