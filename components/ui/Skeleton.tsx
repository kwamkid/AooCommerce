'use client';

/**
 * Skeleton — placeholder ที่มีรูปร่างเหมือนของจริง (แบบ aoosocial)
 *
 * ใช้แทน spinner ทุกครั้งที่ "รู้อยู่แล้วว่าผลลัพธ์หน้าตาประมาณไหน" —
 * ผู้ใช้รู้สึกว่าเร็วกว่า และหน้าไม่กระตุกตอนข้อมูลมาถึง (layout ไม่เด้ง)
 *
 *   <PageSkeleton variant="list" />   ← ทั้งหน้า list (header + filter + ตาราง)
 *   <SkeletonTable rows={8} />        ← เฉพาะตาราง
 *   <Skeleton className="w-32 h-4" /> ← แท่งเดี่ยว
 *
 * ทุกตัว pulse อยู่แล้ว ไม่ต้องใส่ animate-pulse ซ้ำ
 */

const BAR = 'bg-gray-200 dark:bg-slate-700 rounded';

/** แท่ง placeholder เดี่ยว — คุมขนาดผ่าน className (w-*, h-*) หรือ style */
export function Skeleton({
  className = '',
  circle = false,
  style,
}: { className?: string; circle?: boolean; style?: React.CSSProperties }) {
  return <div className={`${BAR} ${circle ? '!rounded-full' : ''} ${className}`} style={style} />;
}

/** ข้อความหลายบรรทัด — บรรทัดสุดท้ายสั้นกว่าเพื่อให้ดูเป็นย่อหน้าจริง */
export function SkeletonText({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? 'w-2/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** การ์ดเปล่า + ข้อความข้างใน */
export function SkeletonCard({ lines = 3, className = '' }: { lines?: number; className?: string }) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 space-y-4 ${className}`}>
      <Skeleton className="h-4 w-1/3" />
      <SkeletonText lines={lines} />
    </div>
  );
}

/** แถว KPI (Stat) ด้านบน dashboard */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 space-y-3">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** ตาราง list page — หัวตาราง + แถว (desktop) / การ์ด (mobile) */
export function SkeletonTable({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="hidden md:flex items-center gap-4 px-5 py-3 bg-gray-50 dark:bg-slate-900/40 border-b border-gray-200 dark:border-slate-700">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3 ${i === 0 ? 'w-40' : 'flex-1'}`} />
        ))}
      </div>
      {/* Desktop rows */}
      <div className="hidden md:block divide-y divide-gray-100 dark:divide-slate-700">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-5 py-4">
            <div className="w-40 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            {Array.from({ length: cols - 1 }).map((_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700">
        {Array.from({ length: Math.min(rows, 6) }).map((_, r) => (
          <div key={r} className="p-4 flex items-start gap-3">
            <Skeleton className="w-12 h-12 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** รายการแถวแนวนอน (settings lists, chat contacts) */
export function SkeletonList({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm px-3 py-2.5 flex items-center gap-3">
          {avatar && <Skeleton className="w-9 h-9 flex-shrink-0" circle />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="w-10 h-5" />
        </div>
      ))}
    </div>
  );
}

/** ฟอร์ม detail/edit — label + input เรียงกัน */
export function SkeletonForm({ fields = 5 }: { fields?: number }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-6 space-y-5">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-2">
        <Skeleton className="h-10 w-24" />
        <Skeleton className="h-10 w-28" />
      </div>
    </div>
  );
}

/**
 * โครงทั้งหน้า — ใส่ไว้ใน `if (loading) return ...` ได้เลย
 * (ครอบด้วย <Layout><Container> เองที่หน้าเรียกใช้)
 */
export function PageSkeleton({
  variant = 'list',
  rows = 8,
}: { variant?: 'list' | 'form' | 'dashboard' | 'detail'; rows?: number }) {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-10 w-28" />
      </div>

      {variant === 'list' && (
        <>
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3 flex gap-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-40 hidden sm:block" />
          </div>
          <SkeletonTable rows={rows} />
        </>
      )}

      {variant === 'dashboard' && (
        <>
          <SkeletonStats />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SkeletonCard lines={5} />
            <SkeletonCard lines={5} />
          </div>
        </>
      )}

      {variant === 'form' && <SkeletonForm />}

      {variant === 'detail' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <SkeletonCard lines={4} />
            <SkeletonTable rows={4} cols={4} />
          </div>
          <div className="space-y-4">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </div>
        </div>
      )}
    </div>
  );
}
