'use client';

// Banner แจ้งช่วง circuit breaker marketplace ทำงาน (quota/rate limit หมด — ระบบพัก sync รอ reset)
// รองรับทุก platform (Shopee/TikTok/Lazada) — หนึ่ง Alert ต่อ platform+scope ที่โดน
// อ่านสถานะจาก header summary (poll 5 นาทีอยู่แล้ว) — ไม่ยิง request เพิ่ม
// render เป็น null เองเมื่อ: feature marketplace ปิด / บริษัทไม่มีร้าน platform นั้น / breaker ไม่ทำงาน
// วางไว้ที่: หน้า /orders (คนงงว่าออเดอร์หายไปไหน) + แท็บเชื่อมต่อ Marketplace (คนกด Sync แล้วเจอ 429)
//
// breaker แยกตาม scope แล้ว (2026-08-29) — ข้อความจึงต้องบอกให้ตรงว่าพักเฉพาะส่วนไหน
// แชทพักแล้วขึ้นว่า "ออเดอร์เข้าช้า" = ส่งคนไปไล่หาปัญหาผิดที่

import Alert from '@/components/ui/Alert';
import { useFeatures } from '@/lib/features-context';
import { useHeaderSummary } from '@/lib/header-summary-context';
import {
  QUOTA_PLATFORM_LABELS,
  QUOTA_SELLER_CENTER_LABELS,
  QUOTA_SCOPE_LABELS,
  QUOTA_SCOPE_IMPACT,
  type QuotaTarget,
} from '@/lib/marketplace/platforms';

export default function MarketplaceQuotaPausedAlert({ note }: { note?: string }) {
  const { features } = useFeatures();
  const { summary } = useHeaderSummary();

  if (!features.marketplace_sync) return null;
  const paused = summary?.marketplaceHealth.quota_paused || [];
  if (paused.length === 0) return null;

  return (
    <>
      {paused.map(q => {
        const label = QUOTA_PLATFORM_LABELS[q.platform] || q.platform;
        const scope = (q.scope || 'all') as QuotaTarget;
        const { impact, reassure } = QUOTA_SCOPE_IMPACT[scope] || QUOTA_SCOPE_IMPACT.all;
        const untilLabel = q.until
          ? `เวลา ${new Date(q.until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.`
          : 'อีกสักครู่';
        const scopeSuffix = scope === 'all' ? '' : ` (${QUOTA_SCOPE_LABELS[scope]})`;
        return (
          <Alert
            key={`${q.platform}:${scope}`}
            tone="warning"
            title={`${label}${scopeSuffix} — โควตา API หมดชั่วคราว ${impact}`}
          >
            {reassure}ให้{untilLabel} — ระหว่างนี้จัดการใน{' '}
            {QUOTA_SELLER_CENTER_LABELS[q.platform] || label} ได้ตามปกติ{note ? ` · ${note}` : ''}
          </Alert>
        );
      })}
    </>
  );
}
