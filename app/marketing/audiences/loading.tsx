// Path: app/marketing/audiences/loading.tsx
// segment ใหม่ต้องมี loading.tsx ของตัวเองเสมอ ไม่งั้นตกไปใช้ app/loading.tsx ซึ่งเป็น
// splash เต็มจอ — จะกระพริบทับ sidebar ทุกครั้งที่กดเมนู
import AppSegmentLoading from '@/components/layout/AppSegmentLoading';

export default function Loading() {
  return <AppSegmentLoading variant="list" />;
}
