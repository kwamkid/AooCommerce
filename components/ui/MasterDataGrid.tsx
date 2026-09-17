import Link from 'next/link';
import type { ReactNode } from 'react';

// กริดการ์ดของหน้า master data (แบรนด์ · หมวดหมู่ · ของอื่นที่มีรูป/ไอคอนประจำตัว)
//
// ⛔ ห้ามประกอบกริด/การ์ดเองในหน้า — หน้าตาอยู่ที่คลาส `.master-grid` / `.master-card`
//    ใน globals.css ที่เดียว · อยากได้ช่องใหม่ให้เพิ่ม prop ที่นี่
// คู่กับ <MasterDataCell> ที่เป็นช่องชื่อของ "หน้าแบบตาราง" — เลือกใช้อย่างใดอย่างหนึ่งต่อหน้า

interface GridProps {
  children: ReactNode;
}

export function MasterDataGrid({ children }: GridProps) {
  return <div className="master-grid">{children}</div>;
}

interface CardProps {
  /** ชื่อที่แสดง — ใช้เป็นตัวตั้งต้นของอักษรย่อเมื่อไม่มีทั้งรูปและไอคอน */
  title: string;
  /** โลโก้/รูปประจำตัว — ไม่มีก็ตกไปใช้ `icon` แล้วค่อยตกไปใช้อักษรย่อ */
  imageUrl?: string | null;
  /** ไอคอนประจำประเภท (หมวดหมู่ใช้โฟลเดอร์) — ใช้เมื่อไม่มีรูป */
  icon?: ReactNode;
  /** ทั้งชื่อกดไปหน้าอื่นได้ (ไม่ส่ง = ชื่อเฉย ๆ) */
  href?: string;
  subtitle?: ReactNode;
  /** ปุ่ม/เมนูมุมขวาบน — ส่ง <ActionMenu> มาตรง ๆ */
  actions?: ReactNode;
  /** เนื้อเพิ่มใต้หัวการ์ด เช่นรายการหมวดย่อย */
  children?: ReactNode;
  tone?: 'primary' | 'muted';
}

export function MasterDataGridCard({
  title,
  imageUrl,
  icon,
  href,
  subtitle,
  actions,
  children,
  tone = 'primary',
}: CardProps) {
  // รูปมาก่อนไอคอน แล้วค่อยอักษรย่อ — ร้านส่วนใหญ่ยังไม่ได้ใส่โลโก้ การ์ดจึงต้องดูดี
  // ตั้งแต่ยังไม่มีรูป ไม่ใช่กล่องว่าง ๆ เรียงกันทั้งหน้า
  const avatar = imageUrl
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={imageUrl} alt="" className="master-card-avatar-img" />
    : icon || title.trim().charAt(0).toUpperCase();

  return (
    <div className={href ? 'master-card master-card-interactive' : 'master-card'}>
      <div className="master-card-head">
        <span className={`master-card-avatar master-card-avatar-${tone}`}>{avatar}</span>
        <div className="master-card-heading">
          {href
            ? <Link href={href} className="master-card-title-link">{title}</Link>
            : <p className="master-card-title">{title}</p>}
          {subtitle && <p className="master-card-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children && <div className="master-card-body">{children}</div>}
    </div>
  );
}

export default MasterDataGrid;
