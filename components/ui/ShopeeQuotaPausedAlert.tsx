'use client';

// Banner แจ้งช่วง circuit breaker Shopee ทำงาน (โควตา API รายวันหมด — ระบบพัก sync รอ reset)
// ใช้ซ้ำได้ทุกหน้า: อ่านสถานะจาก header summary (poll 5 นาทีอยู่แล้ว) — ไม่ยิง request เพิ่ม
// render เป็น null เองเมื่อ: feature marketplace ปิด / ไม่มีร้าน Shopee / breaker ไม่ทำงาน
// วางไว้ที่: หน้า /orders (คนงงว่าออเดอร์หายไปไหน) + แท็บเชื่อมต่อ Marketplace (คนกด Sync แล้วเจอ 429)

import Alert from '@/components/ui/Alert';
import { useFeatures } from '@/lib/features-context';
import { useHeaderSummary } from '@/lib/header-summary-context';

export default function ShopeeQuotaPausedAlert({ note }: { note?: string }) {
  const { features } = useFeatures();
  const { summary } = useHeaderSummary();

  if (!features.marketplace_sync) return null;
  const mh = summary?.marketplaceHealth;
  if (!mh?.quota_blocked) return null;

  const untilLabel = mh.quota_until
    ? `เวลา ${new Date(mh.quota_until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
    : 'หลังเที่ยงคืน (UTC+8)';

  return (
    <Alert tone="warning" title="ออเดอร์ Shopee ใหม่จะเข้าระบบช้าชั่วคราว — โควตา API วันนี้หมด">
      ออเดอร์<b>ไม่หาย</b> ถูกเก็บเข้าคิวไว้ครบ ระบบจะดึงเข้าให้อัตโนมัติ{untilLabel} —
      ระหว่างนี้จัดการออเดอร์ใน Shopee Seller Center ได้ตามปกติ{note ? ` · ${note}` : ''}
    </Alert>
  );
}
