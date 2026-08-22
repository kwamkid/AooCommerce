// Path: app/superadmin/loading.tsx
// โครงหน้าระหว่างโหลด — กัน splash เต็มจอของ app/loading.tsx ไม่ให้กระพริบทับ
// ใช้ skeleton โทนดำของ superadmin เอง (ไม่ใช่ AppSegmentLoading ที่เป็นธีมสว่างของแอปหลัก)
import SuperAdminSkeleton from './components/SuperAdminSkeleton';

export default function Loading() {
  return <SuperAdminSkeleton />;
}
