// Path: app/marketplace/sync/loading.tsx
// โครงหน้าระหว่างโหลด — segment ใหม่ต้องมีเสมอ ไม่งั้น splash เต็มจอของ app/loading.tsx
// จะกระพริบทับ sidebar/header ตอนเปลี่ยนหน้า (ดู components/layout/AppSegmentLoading.tsx)
import AppSegmentLoading from '@/components/layout/AppSegmentLoading';

export default function Loading() {
  return <AppSegmentLoading variant="list" />;
}
