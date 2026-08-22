'use client';

// Banner แจ้งช่วง circuit breaker marketplace ทำงาน (quota/rate limit หมด — ระบบพัก sync รอ reset)
// รองรับทุก platform (Shopee/TikTok/Lazada) — หนึ่ง Alert ต่อ platform ที่โดน
// อ่านสถานะจาก header summary (poll 5 นาทีอยู่แล้ว) — ไม่ยิง request เพิ่ม
// render เป็น null เองเมื่อ: feature marketplace ปิด / บริษัทไม่มีร้าน platform นั้น / breaker ไม่ทำงาน
// วางไว้ที่: หน้า /orders (คนงงว่าออเดอร์หายไปไหน) + แท็บเชื่อมต่อ Marketplace (คนกด Sync แล้วเจอ 429)

import Alert from '@/components/ui/Alert';
import { useFeatures } from '@/lib/features-context';
import { useHeaderSummary } from '@/lib/header-summary-context';

const PLATFORM_LABELS: Record<string, string> = {
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  lazada: 'Lazada',
};

const SELLER_CENTER: Record<string, string> = {
  shopee: 'Shopee Seller Center',
  tiktok: 'TikTok Seller Center',
  lazada: 'Lazada Seller Center',
};

export default function MarketplaceQuotaPausedAlert({ note }: { note?: string }) {
  const { features } = useFeatures();
  const { summary } = useHeaderSummary();

  if (!features.marketplace_sync) return null;
  const paused = summary?.marketplaceHealth.quota_paused || [];
  if (paused.length === 0) return null;

  return (
    <>
      {paused.map(q => {
        const label = PLATFORM_LABELS[q.platform] || q.platform;
        const untilLabel = q.until
          ? `เวลา ${new Date(q.until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
          : 'อีกสักครู่';
        return (
          <Alert key={q.platform} tone="warning" title={`ออเดอร์ ${label} ใหม่จะเข้าระบบช้าชั่วคราว — โควตา API หมด`}>
            ออเดอร์<b>ไม่หาย</b> ถูกเก็บเข้าคิวไว้ครบ ระบบจะดึงเข้าให้อัตโนมัติ{untilLabel} —
            ระหว่างนี้จัดการออเดอร์ใน {SELLER_CENTER[q.platform] || label} ได้ตามปกติ{note ? ` · ${note}` : ''}
          </Alert>
        );
      })}
    </>
  );
}
