'use client';

// กระดิ่งบน header ของ shell superadmin — คู่แฝดของกระดิ่งใน components/layout/Header.tsx
// ของแอปร้าน แต่เนื้อในเป็น "เรื่องระดับระบบที่ตัวเฝ้าเห็นว่าพังอยู่ตอนนี้" (collectWatchdogIssues
// ชุดเดียวกับหน้า API Monitor และ push แจ้งเตือน — จึงไม่มีทางพูดคนละเรื่อง)
// ท้าย dropdown = สวิตช์แจ้งเตือนของเครื่องนี้ สาย 'superadmin' + ปุ่มทดสอบ
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, ShieldCheck } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import PushNotificationToggle from '@/components/ui/PushNotificationToggle';
import type { WatchdogIssue } from '@/lib/marketplace/watchdog';

// ตัวเฝ้าเดินทุก 15 นาที — กระดิ่งถามบ่อยกว่านั้นก็ได้แค่คำตอบเดิม
const REFRESH_MS = 5 * 60_000;

/** คืน null เมื่อดึงไม่ได้ (ต่างจาก [] = ดึงได้และไม่มีเรื่องค้าง) */
async function fetchIssues(): Promise<WatchdogIssue[] | null> {
  try {
    // issues_only = ไม่ลาก aggregate 14 วันของหน้า API Monitor มาด้วย
    const res = await apiFetch('/api/superadmin/api-monitor?issues_only=1');
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.issues) ? data.issues : [];
  } catch {
    return null;
  }
}

export default function SuperAdminNotificationBell() {
  const [open, setOpen] = useState(false);
  const [issues, setIssues] = useState<WatchdogIssue[]>([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // setState อยู่ใน .then เท่านั้น (ไม่ synchronous ใน effect) — ตามกติกา react-hooks/set-state-in-effect
  const load = useCallback(
    () =>
      fetchIssues().then((list) => {
        if (!list) return; // เครือข่ายล้ม — คงค่าเดิมไว้ รอบหน้าค่อยลองใหม่
        setIssues(list);
        setLoaded(true);
      }),
    []
  );

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  // ปิดเมื่อคลิกนอกกล่อง
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, [open]);

  const critical = issues.filter(i => i.severity === 'critical').length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(v => !v);
          if (!open) load(); // เปิดดู = อยากรู้ของสด
        }}
        aria-label="การแจ้งเตือน"
        className="relative p-2 rounded-lg text-slate-400 hover:text-violet-400 hover:bg-white/10 active:bg-white/15 transition-colors"
      >
        <Bell className="w-5 h-5" />
        {issues.length > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 text-white text-[10px] font-bold rounded-full flex items-center justify-center ${
              critical > 0 ? 'bg-red-500' : 'bg-amber-500'
            }`}
          >
            {issues.length > 99 ? '99+' : issues.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-slate-700">
            <h3 className="font-semibold text-white">การแจ้งเตือน</h3>
            <p className="text-sm text-slate-400">
              {!loaded
                ? 'กำลังตรวจ...'
                : issues.length === 0
                  ? 'ไม่มีเรื่องค้าง'
                  : `${issues.length} เรื่องที่ยังพังอยู่${critical > 0 ? ` · วิกฤต ${critical}` : ''}`}
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loaded && issues.length === 0 ? (
              <p className="px-4 py-6 text-sm text-emerald-400/90 flex items-center justify-center gap-2">
                <ShieldCheck className="w-4 h-4" /> ทุกร้านซิงค์ตามปกติ
              </p>
            ) : (
              issues.map(issue => (
                <a
                  key={issue.code}
                  href={issue.url}
                  onClick={() => setOpen(false)}
                  className={`block px-4 py-3 border-b border-slate-700/60 border-l-2 hover:bg-slate-700/50 transition-colors ${
                    issue.severity === 'critical' ? 'border-l-red-500' : 'border-l-amber-400'
                  }`}
                >
                  <p className="text-sm font-medium text-white">{issue.title}</p>
                  <p className="text-sm text-slate-400 mt-0.5 line-clamp-2">{issue.detail}</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {issue.companyName || 'ทั้งระบบ'} · <span className="text-violet-400">{issue.actionLabel} →</span>
                  </p>
                </a>
              ))
            )}
          </div>

          {/* สวิตช์แจ้งเตือนของ "เครื่องนี้" สายผู้ดูแลระบบ (คนละ subscription กับแอปร้าน)
              + ส่งทดสอบ + ทดสอบเลขบนไอคอน — component เดียวกับกระดิ่งของแอปร้าน */}
          <PushNotificationToggle audience="superadmin" />
        </div>
      )}
    </div>
  );
}
