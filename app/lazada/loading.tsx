// Path: app/lazada/loading.tsx
// โครงหน้าระหว่างโหลด — กัน splash เต็มจอของ app/loading.tsx ไม่ให้กระพริบทับ
// sidebar/header ตอนเปลี่ยนหน้า (ดู components/layout/AppSegmentLoading.tsx)
import AppSegmentLoading from '@/components/layout/AppSegmentLoading';

export default function Loading() {
  return <AppSegmentLoading variant="form" />;
}
