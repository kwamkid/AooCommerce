// Path: app/onboarding/loading.tsx
// โครงหน้าระหว่างโหลด — onboarding เป็น wizard เต็มจอ ไม่มี sidebar ของแอป
// จึงไม่ใช้ AppSegmentLoading (จะ flash โครง sidebar ที่หน้าจริงไม่มี)
import { PageSkeleton } from '@/components/ui/Skeleton';

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <PageSkeleton variant="form" />
      </div>
    </div>
  );
}
