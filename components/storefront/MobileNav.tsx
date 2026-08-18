// เมนูแฮมเบอร์เกอร์สำหรับหัวร้านแบบ "โลโก้ซ้าย" บนจอแคบ
//
// แบบโลโก้ซ้ายวางเมนูต่อท้ายโลโก้ในบรรทัดเดียว พอจอแคบก็ไม่มีที่พอ
// ของเดิมซ่อนทิ้งเฉย ๆ (display:none) ลูกค้าบนมือถือจึงเข้าหมวดสินค้า
// ไม่ได้เลย — ลิงก์หายไปทั้งชุดโดยไม่มีอะไรมาแทน
//
// ปุ่มนี้ถูกซ่อนด้วย CSS บนจอกว้าง จึง render ตลอดได้โดยไม่ต้องเดาขนาดจอ
// ฝั่ง server (เดาผิดแล้ว hydration ไม่ตรง)
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';

export interface NavLink {
  href: string;
  label: string;
}

export default function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="sf-icon-btn sf-burger"
        aria-label={open ? 'ปิดเมนู' : 'เปิดเมนู'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? <X strokeWidth={1.8} /> : <Menu strokeWidth={1.8} />}
      </button>

      {open && (
        <nav className="sf-burger-panel" aria-label="หมวดสินค้า">
          {links.map(l => (
            <Link key={l.href} href={l.href} className="sf-burger-link" onClick={() => setOpen(false)}>
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
