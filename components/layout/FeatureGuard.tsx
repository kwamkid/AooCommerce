// ─────────────────────────────────────────────────────────────────────────────
// ด่านฟีเจอร์ของทุกหน้า — วางไว้ใน Layout ที่เดียว ครอบทุกหน้าอัตโนมัติ
//
// ทำไมต้องมี: เดิมปิดฟีเจอร์แล้ว**เมนูหายก็จริง แต่พิมพ์ URL ตรงยังเข้าหน้าได้**
// และหน้าที่แพ็กเกจไม่รองรับก็ยังเปิดดูได้เหมือนกัน
//
// ตัวนี้ตัดสินจาก 2 ชั้นตามลำดับ:
//   1. **แพ็กเกจ** ไม่รองรับ → ชวนอัปเกรด (เจ้าของร้านเปิดเองไม่ได้)
//   2. **สวิตช์** ยังไม่ได้เปิด → ชวนไปเปิดที่ตั้งค่า
//
// ⚠️ นี่คือชั้น UX เท่านั้น — ข้อมูลจริงต้องดักที่ API ด้วย
//    (`lib/package-gates-server.ts`) เพราะคนยิง API ตรงได้เสมอ
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Lock, ToggleLeft } from 'lucide-react';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { useFeatures } from '@/lib/features-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { featureForPath, isFeatureOn } from '@/lib/feature-routes';
import { featureLockReason } from '@/lib/package-features';

export default function FeatureGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { features, gates, fetched } = useFeatures();
  const { companyRoles, permissions } = useCompany();

  const route = featureForPath(pathname);

  // ยังไม่รู้ค่าจริง = ปล่อยผ่านไปก่อน ไม่งั้นทุกหน้าจะกระพริบเป็นหน้าปิดกั้นตอนโหลด
  if (!route || !fetched) return <>{children}</>;

  const lockedByPackage = featureLockReason(route.feature, gates);
  const switchedOff = !isFeatureOn(features, route.feature);

  if (!lockedByPackage && !switchedOff) return <>{children}</>;

  const canOpenSettings = can({ roles: companyRoles, permissions }, 'settings.access');

  return (
    <Container size="2xl">
      <Card className="card-p-lg text-center">
        <div className="flex flex-col items-center gap-3">
          <span className={`flex h-12 w-12 items-center justify-center rounded-full ${
            lockedByPackage
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-gray-100 text-gray-400 dark:bg-slate-700 dark:text-slate-400'
          }`}>
            {lockedByPackage ? <Lock className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
          </span>

          <h2 className="heading-3">{route.label}</h2>

          <p className="section-desc max-w-md">
            {lockedByPackage
              ? lockedByPackage
              : `ฟีเจอร์นี้ยังปิดอยู่ — เปิดที่ ตั้งค่า › Feature เสริม แล้วหน้านี้จะใช้งานได้ทันที`}
          </p>

          <div className="flex justify-center gap-3 mt-2">
            <Button variant="secondary" onClick={() => router.back()}>ย้อนกลับ</Button>
            {canOpenSettings && !lockedByPackage && (
              <Button variant="primary" onClick={() => router.push('/settings/features')}>
                ไปที่ Feature เสริม
              </Button>
            )}
          </div>
        </div>
      </Card>
    </Container>
  );
}
