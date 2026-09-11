// Path: components/ui/HelpHint.tsx
// ไอคอน ? ข้างชื่อช่อง — กดแล้วขึ้นคำอธิบาย ใช้ได้ทั้งหลังบ้านและหน้าร้าน
//
// ต่างจาก Tooltip ยังไง (มีทั้งคู่ อย่าสับสน):
//   Tooltip  = ป้ายสั้น ๆ ตอน hover เช่นบอกชื่อปุ่มไอคอนในตาราง — บรรทัดเดียว
//              ไม่ตัดคำ และแตะบนมือถือไม่ติด
//   HelpHint = คำอธิบายยาวได้หลายบรรทัด กดเปิด/ปิด ใช้ได้บนมือถือ
//              สำหรับ "วิธีทำ" ที่ไม่ควรกินที่เป็นบรรทัดถาวรใต้ช่องกรอก
//
// กดเปิด ไม่ใช่ hover เพราะลูกค้าหน้าร้านส่วนใหญ่อยู่บนมือถือซึ่งไม่มี hover
//
// `portal` — อยู่ในกล่องที่ตัดของล้น (แถวของ DataTable ครอบด้วย overflow-x-auto ซึ่งตัดขอบล่างด้วย)
// กล่องคำอธิบายแบบปกติจะโดนตัดครึ่ง จึงวาดลอยเหนือทั้งหน้าแทน · กดไอคอน/กดในกล่องต้องไม่ทะลุไปกด
// ของที่ครอบอยู่ (แถวตารางที่กดแล้วเปิดหน้า) — event จาก portal ยังวิ่งขึ้นหา parent ใน React
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';
import { shouldDropUp } from '@/lib/useDropUp';

interface Props {
  children: React.ReactNode;
  /** ชิดขวาแทนชิดซ้าย — ใช้เมื่อไอคอนอยู่ริมขวาของจอ */
  align?: 'left' | 'right';
  /** วาดคำอธิบายลอยเหนือทั้งหน้า — ใช้ในตาราง/กล่องที่ตัดของล้น · พลิกขึ้นเองเมื่อข้างล่างไม่พอ */
  portal?: boolean;
}

/** ความสูงโดยประมาณของกล่องคำอธิบาย — ใช้ตัดสินว่าจะพลิกขึ้นไหม (ตอนกดยังไม่ได้วาด จึงวัดจริงไม่ได้) */
const EST_HEIGHT = 160;
const GAP = 6;

type Pos = { top?: number; bottom?: number; left?: number; right?: number };

const BOX = 'w-max max-w-[min(280px,70vw)] rounded-lg bg-gray-900 px-3 py-2 text-[13px] font-normal leading-relaxed text-gray-50 shadow-lg';

export default function HelpHint({ children, align = 'left', portal = false }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    // กล่องแบบ portal ยึดตำแหน่งบนจอไว้ — เลื่อนหรือย่อจอแล้วจะลอยผิดที่ ปิดไปเลย
    const onMove = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    if (portal) {
      window.addEventListener('scroll', onMove, true);
      window.addEventListener('resize', onMove);
    }
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      if (portal) {
        window.removeEventListener('scroll', onMove, true);
        window.removeEventListener('resize', onMove);
      }
    };
  }, [open, portal]);

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    if (portal && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const up = shouldDropUp(r, EST_HEIGHT, { margin: 8, requireMoreSpaceAbove: true });
      setPos({
        ...(up ? { bottom: window.innerHeight - r.top + GAP } : { top: r.bottom + GAP }),
        ...(align === 'right'
          ? { right: Math.max(8, window.innerWidth - r.right) }
          : { left: Math.max(8, r.left) }),
      });
    }
    setOpen(true);
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label="คำอธิบายเพิ่มเติม"
        aria-expanded={open}
        aria-controls={id}
        onClick={toggle}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${
          open ? 'text-primary' : 'text-gray-400 hover:text-primary'
        }`}
      >
        <HelpCircle className="w-4 h-4" strokeWidth={2} />
      </button>
      {open && !portal && (
        <span
          id={id}
          role="note"
          onClick={stop}
          className={`absolute top-[calc(100%+6px)] z-40 ${BOX} ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {children}
        </span>
      )}
      {open && portal && pos && createPortal(
        <span ref={popRef} id={id} role="note" onClick={stop} style={pos} className={`fixed z-[999] text-left ${BOX}`}>
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}
