'use client';

import type { HTMLAttributes, ReactNode } from 'react';
import { getBadgeColor, getPaymentBadgeColor } from '@/lib/status-tab-colors';

/**
 * Badge แสดง "สถานะ" — โครงจาก `.badge` (globals.css) + สีจาก
 * `getBadgeColor()` ใน [lib/status-tab-colors.ts](../../lib/status-tab-colors.ts)
 *
 * แยกจาก `Badge` เพราะสีสถานะไม่ใช่ 8 tone ของ Badge — พาเลตสถานะมี
 * violet/cyan/สี hex เฉพาะ และถูกคุมที่ status-tab-colors ที่เดียวทั้งระบบ
 * (กฎใน CLAUDE.md: ห้ามกำหนดสี status เอง)
 *
 * ใช้แทน pattern เดิมที่ก่อนนี้ copy กันทุกหน้า:
 *   <span className={`... rounded-full ... ${cfg.bg} ${cfg.color}`}>...</span>
 */
interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** status key เช่น 'completed', 'ready_to_ship' — alias resolve ให้ใน getBadgeColor */
  status: string;
  /** ใช้พาเลตสถานะการเงิน (getPaymentBadgeColor) แทนพาเลตสถานะงาน */
  payment?: boolean;
  /**
   * Override สี — สำหรับหน้าเก่าที่มีพาเลตเฉพาะของตัวเองอยู่ก่อนแล้วเท่านั้น
   * (เช่น CSR/DSR reports) เพื่อไม่ให้ sweep เปลี่ยนสีที่ผู้ใช้เห็น
   * ⛔ หน้าใหม่ห้ามใช้ — ให้ตั้ง status key ให้ตรงแล้วรับสีจาก getBadgeColor
   */
  colors?: { color: string; bg: string } | string;
  size?: 'sm' | 'md';
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function StatusBadge({
  status,
  payment = false,
  size = 'sm',
  icon,
  className = '',
  colors,
  children,
  ...rest
}: StatusBadgeProps) {
  const c = colors ?? (payment ? getPaymentBadgeColor(status) : getBadgeColor(status));
  const colorCls = typeof c === 'string' ? c : `${c.bg} ${c.color}`;
  return (
    <span className={`badge badge-${size} badge-pill ${colorCls} ${className}`} {...rest}>
      {icon}
      {children}
    </span>
  );
}
