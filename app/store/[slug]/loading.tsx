// Path: app/store/[slug]/loading.tsx
// หน้าร้านมีแบรนด์ของร้านเอง — ห้ามตกไปใช้ splash สีส้มของ aoo ใน app/loading.tsx
// (ลูกค้าของร้านไม่รู้จัก aoo และไม่ควรต้องเห็น)
//
// ใช้โครงเดียวกับ fallback ของ <Suspense> ในหน้ารายการ เพื่อให้ "ตอนเข้าหน้าร้าน
// ครั้งแรก" กับ "ตอนกรอง/ค้นหาในหน้าเดิม" เห็นภาพเดียวกัน
import CatalogSkeleton from '@/components/storefront/CatalogSkeleton';

export default function Loading() {
  return (
    <div className="sf-container">
      <CatalogSkeleton />
    </div>
  );
}
