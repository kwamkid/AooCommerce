import { FullPageLoading } from '@/components/ui/Loading';

// Route-level loading — Next.js mount ตัวนี้ระหว่างรอ segment ใหม่ render
// (หน้าไหนอยากได้ skeleton แทน splash ให้สร้าง loading.tsx ของตัวเองแล้วใช้ PageSkeleton)
export default function RootLoading() {
  return <FullPageLoading label="กำลังโหลด AooCommerce..." />;
}
