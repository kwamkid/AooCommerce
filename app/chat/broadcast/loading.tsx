// Path: app/chat/broadcast/loading.tsx
// /chat มี loading.tsx เป็น variant "detail" (ทำมาเพื่อหน้าแชท) — หน้าบรอดแคสต์เป็น
// หน้ารายการ จึงต้องมีของตัวเอง ไม่งั้นโครงที่กระพริบระหว่างโหลดจะผิดรูปหน้า
import AppSegmentLoading from '@/components/layout/AppSegmentLoading';

export default function Loading() {
  return <AppSegmentLoading variant="list" />;
}
