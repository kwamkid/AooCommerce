'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import {
  ShoppingBag, Banknote, FileText, Package, ClipboardList, ReceiptText,
  Undo2, Tag, Percent, Megaphone, ArrowLeftRight, Boxes, ShoppingCart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { statusMeta, type StatusDomain } from '@/lib/status-labels';

/**
 * Badge แสดง "สถานะ" — ตัวเดียวของทั้งระบบ
 *
 *   <StatusBadge domain="statement" status={st.status} />   →  📄 ชำระแล้ว
 *
 * ส่งแค่ domain + status แล้วได้ **คำเรียก + สี + ไอคอน** ครบ · ของทั้งสามอย่าง
 * อยู่คนละบ้านเพื่อให้แก้ทีเดียวเปลี่ยนทั้งระบบ:
 *   คำเรียก + สีของสถานะ → [lib/status-labels.ts](../../lib/status-labels.ts)
 *   ค่าสีจริง            → ตัวแปร `--st-*` + คลาส `.badge-st-*` ใน globals.css
 *   ไอคอน                → ตารางข้างล่างในไฟล์นี้
 *
 * ⛔ ห้ามประกาศ map คำเรียก/สีสถานะในหน้าใด ๆ — เคยมี 20+ จุดแล้วเพี้ยนกันจริง
 *    (ดู fix-bug.md 2026-09-08) · สถานะใหม่ให้เพิ่มในทะเบียน ไม่ใช่ส่ง `colors` มาทับ
 */

// ─────────────────────────────────────────────────────────────────────
// ไอคอนประจำตระกูล — หนึ่งตัวต่อโดเมน
// ไอคอนตอบว่า "ป้ายนี้พูดเรื่องอะไร" (งาน/เงิน/เอกสาร) ส่วนสถานะบอกด้วยสี+คำอยู่แล้ว
// จึงไม่เปลี่ยนไอคอนตามสถานะ — เปลี่ยนไอคอนของโดเมนไหนก็แก้บรรทัดเดียวที่นี่
// ─────────────────────────────────────────────────────────────────────
const DOMAIN_ICON: Record<StatusDomain, LucideIcon> = {
  order:                 ShoppingBag,
  orderDealer:           ShoppingBag,
  customerOrder:         ShoppingBag,
  payment:               Banknote,
  customerPayment:       Banknote,
  statement:             FileText,
  replenishment:         Package,
  deptOrder:             Package,
  report:                ClipboardList,
  creditNote:            ReceiptText,
  creditNoteType:        Tag,
  returnNote:            Undo2,
  promotion:             Percent,
  transfer:              ArrowLeftRight,
  stockDoc:              Boxes,
  purchaseOrder:         ShoppingCart,
  purchaseOrderSupplier: ShoppingCart,
  broadcast:             Megaphone,
  posOrder:              ShoppingBag,
  supplierReport:        ClipboardList,
  supplierType:          Tag,
};

/** อยากให้บางสถานะใช้ไอคอนต่างจากตระกูล เติมที่นี่ (ว่าง = ใช้ไอคอนตระกูลทุกสถานะ) */
const STATUS_ICON: Partial<Record<StatusDomain, Record<string, LucideIcon>>> = {};

interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** โดเมนของสถานะ — ดู STATUS_DOMAINS ใน lib/status-labels.ts */
  domain: StatusDomain;
  status: string | null | undefined;
  size?: 'sm' | 'md';
  /** ซ่อนไอคอน — สำหรับที่แคบจริง ๆ เท่านั้น */
  hideIcon?: boolean;
  /** ต่อท้ายข้อความ เช่น chevron ของป้ายที่กดเปลี่ยนสถานะได้ */
  trailing?: ReactNode;
  className?: string;
}

export default function StatusBadge({
  domain, status, size = 'sm', hideIcon, trailing, className = '', ...rest
}: StatusBadgeProps) {
  const meta = statusMeta(domain, status);
  const Icon = STATUS_ICON[domain]?.[status || ''] || DOMAIN_ICON[domain];
  return (
    <span className={`badge badge-${size} badge-pill badge-st-${meta.color} ${className}`} {...rest}>
      {!hideIcon && <Icon className="badge-lead-icon" aria-hidden />}
      {meta.label}
      {trailing}
    </span>
  );
}

/**
 * ป้ายที่ **ไม่ใช่สถานะในทะเบียน** — ชิปข้อมูลประกอบบนแถวเดียวกัน
 * (กำหนดส่ง · ชื่อขนส่ง · จำนวนกล่อง · สถานะดิบจากฝั่ง marketplace)
 * ใช้ทรงเดียวกันเพื่อไม่ให้แถวเป็นขั้นบันได แต่สีส่งเองได้เพราะไม่ได้อยู่ในวงจรสถานะของเรา
 * ⚠️ ถ้าสิ่งที่จะใส่คือ "สถานะของข้อมูลเรา" ให้ไปเพิ่มในทะเบียนแล้วใช้ <StatusBadge> แทน
 */
export function InfoChip({
  colors, icon, size = 'sm', className = '', children, ...rest
}: Omit<HTMLAttributes<HTMLSpanElement>, 'children'> & {
  colors: string;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge-${size} badge-pill ${colors} ${className}`} {...rest}>
      {icon}
      {children}
    </span>
  );
}
