// Skeleton โครงเต็มของ superadmin shell — วาด layout จริง (sidebar + header + เนื้อหา)
// ในโทนดำของ superadmin เอง ใช้ 2 ที่:
//   1. app/superadmin/loading.tsx (เปลี่ยนหน้าใน segment)
//   2. SuperAdminLayout ระหว่างเช็คสิทธิ์ super admin
// ห้ามใช้ LoadingCard/AppSegmentLoading ที่นี่ — พวกนั้นเป็นธีมสว่างของแอปหลัก
// จะกลายเป็นกล่องขาวลอยกลางจอดำ (เคยพลาดแล้ว 2026-08-22)

const bar = 'bg-slate-800 rounded animate-pulse';

export default function SuperAdminSkeleton() {
  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* Sidebar — โครงเดียวกับ SuperAdminSidebar (w-64 bg-slate-900) */}
      <aside className="hidden lg:block w-64 bg-slate-900 border-r border-violet-500/20 p-4 space-y-6 flex-shrink-0">
        <div className={`${bar} h-10 w-10 rounded-lg`} />
        <div className={`${bar} h-14 w-full rounded-xl`} />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${bar} h-9 w-full rounded-lg`} style={{ opacity: 1 - i * 0.1 }} />
          ))}
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header bar */}
        <header className="bg-slate-900 border-b border-slate-700/50 px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2 pl-10 lg:pl-0">
              <div className={`${bar} h-6 w-44`} />
              <div className={`${bar} h-3 w-64`} />
            </div>
            <div className={`${bar} h-6 w-28 rounded-full`} />
          </div>
        </header>

        {/* Content — แถว stat cards + บล็อกตาราง */}
        <main className="flex-1 overflow-hidden p-4 lg:p-6 space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-3">
                <div className={`${bar} h-3 w-2/3`} />
                <div className={`${bar} h-7 w-1/2`} />
              </div>
            ))}
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 space-y-3">
            <div className={`${bar} h-4 w-52 mb-4`} />
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`${bar} h-4 w-full`} style={{ opacity: 1 - i * 0.09 }} />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
