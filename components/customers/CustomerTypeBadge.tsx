// ป้ายประเภทลูกค้า — ใช้ทุกที่ที่ต้องแสดงว่าลูกค้ารายนี้เป็นแบบไหน
// คำกับสีมาจาก `lib/customer-types.ts` ที่เดียว ห้ามพิมพ์ชื่อประเภทเองในหน้า
'use client';

import Badge from '@/components/ui/Badge';
import { customerTypeConfig } from '@/lib/customer-types';

export default function CustomerTypeBadge({ type }: { type: string | null | undefined }) {
  const { label, tone } = customerTypeConfig(type);
  return <Badge tone={tone} size="sm">{label}</Badge>;
}
