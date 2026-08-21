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
'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface Props {
  children: React.ReactNode;
  /** ชิดขวาแทนชิดซ้าย — ใช้เมื่อไอคอนอยู่ริมขวาของจอ */
  align?: 'left' | 'right';
}

export default function HelpHint({ children, align = 'left' }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-flex align-middle ml-1.5">
      <button
        type="button"
        aria-label="คำอธิบายเพิ่มเติม"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center justify-center rounded-full transition-colors ${
          open ? 'text-primary' : 'text-gray-400 hover:text-primary'
        }`}
      >
        <HelpCircle className="w-4 h-4" strokeWidth={2} />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className={`absolute top-[calc(100%+6px)] z-40 w-max max-w-[min(280px,70vw)] rounded-lg bg-gray-900 px-3 py-2 text-[13px] font-normal leading-relaxed text-gray-50 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
