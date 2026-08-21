// Path: components/storefront/HelpHint.tsx
// ไอคอน "?" ข้างชื่อช่อง — กดแล้วค่อยขึ้นคำอธิบาย
//
// ทำไม: คำแนะนำที่วางเป็นบรรทัดใต้ทุกช่องทำให้ฟอร์มยาวขึ้นเท่าตัวและอ่านยาก
// ทั้งที่คนส่วนใหญ่ไม่ได้ต้องการอ่าน — เก็บไว้ในไอคอน คนที่สงสัยค่อยกดดู
//
// ใช้กดเปิด/ปิด ไม่ใช่ hover เพราะบนมือถือไม่มี hover (ลูกค้าส่วนใหญ่อยู่บนมือถือ)
'use client';

import { useEffect, useId, useRef, useState } from 'react';

export default function HelpHint({ children }: { children: React.ReactNode }) {
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
    <span className="sf-help" ref={wrapRef}>
      <button
        type="button"
        className="sf-help-btn"
        aria-label="คำอธิบายเพิ่มเติม"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
      >
        ?
      </button>
      {open && <span className="sf-help-bubble" id={id} role="note">{children}</span>}
    </span>
  );
}
