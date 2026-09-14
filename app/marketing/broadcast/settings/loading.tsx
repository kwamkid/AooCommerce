// Path: app/marketing/broadcast/settings/loading.tsx
// segment ใหม่ต้องมี loading.tsx ของตัวเองเสมอ ไม่งั้นตกไปใช้ app/loading.tsx ซึ่งเป็น
// splash เต็มจอ — จะกระพริบทับ sidebar ทุกครั้งที่กดเมนู
// หน้านี้เป็นฟอร์มตั้งค่า (ไม่ใช่ตาราง) จึงใช้โครง form ไม่ใช่ list เหมือนเพื่อนบ้านใน /marketing
import AppSegmentLoading from '@/components/layout/AppSegmentLoading';

export default function Loading() {
  return <AppSegmentLoading variant="form" />;
}
