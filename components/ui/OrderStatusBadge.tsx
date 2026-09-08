'use client';

import type { ComponentProps } from 'react';
import StatusBadge from './StatusBadge';

/**
 * ทางลัดของคู่ที่ใช้บ่อยที่สุด — badge สถานะออเดอร์ + สถานะชำระเงิน
 * ตัวจริงคือ <StatusBadge domain=… /> ทั้งคู่ (ดู components/ui/StatusBadge.tsx)
 *
 *   <OrderStatusBadge status={o.order_status} />              // พนักงาน
 *   <OrderStatusBadge status={o.order_status} dealer />       // ตัวแทน/ห้าง
 *   <OrderStatusBadge status={o.order_status} audience="customer" />  // หน้าที่ลูกค้าเปิด
 */
type Base = Omit<ComponentProps<typeof StatusBadge>, 'domain' | 'status'>;

interface OrderProps extends Base {
  status: string | null | undefined;
  /** ออเดอร์ตัวแทน/ห้าง (w_cash, w_credit) — ใช้คำต่างกันบางขั้น */
  dealer?: boolean;
  /** หน้าที่ลูกค้าเปิดเอง (บิลออนไลน์/หน้าร้าน) — คนละชุดคำกับฝั่งพนักงาน */
  audience?: 'staff' | 'customer';
  /** ยกเลิกเพราะบิลหมดอายุ — คนละเรื่องกับร้านกดยกเลิกเอง (แดง ไม่ใช่เทา) */
  expired?: boolean;
}

export function OrderStatusBadge({ status, dealer, audience = 'staff', expired, ...rest }: OrderProps) {
  const domain = audience === 'customer' ? 'customerOrder' : dealer ? 'orderDealer' : 'order';
  // บิลหมดอายุไม่ใช่ค่าใน DB — เป็น cancelled ที่ cancellation_reason='expired'
  const key = expired && status === 'cancelled' ? 'expired' : status;
  return <StatusBadge domain={domain} status={key} {...rest} />;
}

interface PaymentProps extends Base {
  status: string | null | undefined;
  audience?: 'staff' | 'customer';
}

export function PaymentStatusBadge({ status, audience = 'staff', ...rest }: PaymentProps) {
  return <StatusBadge domain={audience === 'customer' ? 'customerPayment' : 'payment'} status={status} {...rest} />;
}
