'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { Banknote, ShoppingBag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import StatusBadge from './StatusBadge';
import { orderStatusLabel, paymentStatusLabel } from '@/lib/order-status';

/**
 * Badge สถานะของ "ออเดอร์" — สองใบที่อยู่คู่กันเสมอทั้งระบบ
 * (สถานะงาน = ที่ต้องจัดส่ง/กำลังส่ง … · สถานะเงิน = รอชำระ/ชำระแล้ว …)
 *
 * ประกอบจากของกลาง 3 ชิ้น — แก้ที่ต้นทางแล้วเปลี่ยนพร้อมกันทั้งระบบ:
 *   คำเรียก → [lib/order-status.ts](../../lib/order-status.ts)
 *   สี      → [lib/status-tab-colors.ts](../../lib/status-tab-colors.ts)
 *             (ชุดเดียวกับ StatusTabs — แท็บกับ badge จึงสีตรงกันเสมอ
 *              ⛔ ห้ามย้ายสีไป globals.css จะกลายเป็นสองแหล่งแล้วดริฟต์)
 *   ไอคอน   → ไฟล์นี้ (ตารางข้างล่าง) · ทรง/ขนาดไอคอน → `.badge-lead-icon` ใน globals.css
 *
 * ⛔ ห้ามประกาศ map คำเรียก/สีของสถานะออเดอร์ในหน้าใดอีก — เคยมี 20 จุด
 *    แล้วเพี้ยนกันจริง (detail เขียว green / list เขียว emerald · completed
 *    เป็น "ส่งแล้ว" ที่ CRM แต่ "สำเร็จ" ที่อื่น) ดู fix-bug.md 2026-09-08
 */

// ─────────────────────────────────────────────────────────────
// ไอคอนประจำตระกูล — เปลี่ยนไอคอนทั้งระบบแก้แค่สองบรรทัดนี้
// ตระกูลไอคอนคือสิ่งที่บอกว่า "ใบไหนพูดเรื่องอะไร" ตอนสองใบวางติดกัน
// (สี+ข้อความบอกสถานะอยู่แล้ว จึงไม่ต้องเปลี่ยนไอคอนตามสถานะ)
// ─────────────────────────────────────────────────────────────
const ORDER_ICON: LucideIcon = ShoppingBag;
const PAYMENT_ICON: LucideIcon = Banknote;

/** อยากให้บางสถานะใช้ไอคอนต่างจากตระกูล เติมที่นี่ (ว่าง = ใช้ไอคอนตระกูลทุกสถานะ) */
const ORDER_ICON_BY_STATUS: Record<string, LucideIcon> = {};
const PAYMENT_ICON_BY_STATUS: Record<string, LucideIcon> = {};

interface StatusBadgeBaseProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  status: string;
  size?: 'sm' | 'md';
  /** ซ่อนไอคอน — สำหรับที่แคบจริง ๆ เท่านั้น (คอลัมน์ตารางที่บีบสุด) */
  hideIcon?: boolean;
  /** ต่อท้ายข้อความ เช่น chevron ของ badge ที่กดเปลี่ยนสถานะได้ */
  trailing?: ReactNode;
  className?: string;
}

function leadIcon(Icon: LucideIcon | undefined, hide: boolean | undefined) {
  if (hide || !Icon) return undefined;
  return <Icon className="badge-lead-icon" aria-hidden />;
}

interface OrderStatusBadgeProps extends StatusBadgeBaseProps {
  /** ออเดอร์ตัวแทน/ห้าง (w_cash, w_credit) — ใช้คำต่างกันบางขั้น */
  dealer?: boolean;
  /** ยกเลิกเพราะบิลหมดอายุ — คนละเรื่องกับร้านกดยกเลิกเอง */
  expired?: boolean;
}

export function OrderStatusBadge({
  status, dealer, expired, size = 'sm', hideIcon, trailing, className = '', ...rest
}: OrderStatusBadgeProps) {
  // บิลหมดอายุใช้ key 'expired' (alias → overdue = แดง) ไม่ใช่ 'cancelled' (เทา)
  // — "ลูกค้าไม่จ่ายจนบิลตาย" กับ "ร้านกดยกเลิกเอง" ต้องแยกออกจากกันด้วยตา
  const colorKey = expired && status === 'cancelled' ? 'expired' : status;
  return (
    <StatusBadge
      status={colorKey}
      size={size}
      icon={leadIcon(ORDER_ICON_BY_STATUS[status] || ORDER_ICON, hideIcon)}
      className={className}
      {...rest}
    >
      {orderStatusLabel(status, { dealer, expired })}
      {trailing}
    </StatusBadge>
  );
}

export function PaymentStatusBadge({
  status, size = 'sm', hideIcon, trailing, className = '', ...rest
}: StatusBadgeBaseProps) {
  return (
    <StatusBadge
      status={status}
      payment
      size={size}
      icon={leadIcon(PAYMENT_ICON_BY_STATUS[status] || PAYMENT_ICON, hideIcon)}
      className={className}
      {...rest}
    >
      {paymentStatusLabel(status)}
      {trailing}
    </StatusBadge>
  );
}
