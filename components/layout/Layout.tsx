// Path: components/layout/Layout.tsx
'use client';

import { ReactNode, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCompany } from '@/lib/company-context';
import Sidebar from './Sidebar';
import Header from './Header';
import InstallAppBanner from '@/components/InstallAppBanner';
import PullToRefresh from '@/components/PullToRefresh';

interface LayoutProps {
  children: ReactNode;
  title?: string;
  noPadding?: boolean;
  breadcrumbs?: {
    label: string;
    href?: string;
  }[];
}

export default function Layout({ children, title, breadcrumbs, noPadding }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentCompany, loading } = useCompany();
  // กล่องที่เลื่อนจริงของหน้า — ท่ารูดลงเพื่อรีเฟรชต้องฟัง touch จากตัวนี้
  const mainRef = useRef<HTMLElement>(null);

  // Redirect to onboarding wizard if the active company hasn't completed it.
  // Layout-level guard (rather than middleware) because session lives in localStorage,
  // not cookies — middleware can't see it. Skip when loading or already on /onboarding.
  useEffect(() => {
    if (loading) return;
    if (!currentCompany) return;
    if (pathname?.startsWith('/onboarding')) return;
    if (currentCompany.onboarding_completed_at) return;
    router.replace('/onboarding/setup');
  }, [loading, currentCompany, pathname, router]);

  return (
    <div className="flex h-dvh bg-gray-50 dark:bg-slate-950 overflow-hidden print:block print:h-auto print:bg-white print:overflow-visible">
      {/* Sidebar — hidden on print */}
      <div className="print:hidden h-full">
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden print:block print:overflow-visible">
        {/* Header — hidden on print */}
        <div className="print:hidden">
          <Header />
        </div>

        {/* แถบชวนติดตั้งแอป — ตัวมันเองตัดสินว่าจะโผล่ไหม (มือถือ + ยังไม่ติดตั้ง + ยังไม่ปิดแถบ) */}
        <div className="print:hidden">
          <InstallAppBanner />
        </div>

        {/* Page Content */}
        {/* ⚠️ ห้ามใส่ `pb-safe` ที่นี่ — เคยใส่แล้วหน้าที่สูงเต็มจอ (เช่นหน้าแชท) เกิด
            **แถบว่างค้างท้ายจอ** เพราะกล่องลูกสูงเต็มพื้นที่อยู่แล้วแต่ถูกดันขึ้นมาอีกชั้น
            การเผื่อแถบ home indicator ต้องทำที่ "ตัวที่ติดขอบล่างจริง ๆ" (แถบพิมพ์ข้อความ
            ในหน้าแชท / ท้ายเนื้อหาของหน้าที่เลื่อนได้) ไม่ใช่ที่ตัวครอบทั้งหมด */}
        <main ref={mainRef} className="relative flex-1 min-w-0 overflow-y-auto overflow-x-hidden print:overflow-visible">
          {/* รูดลงเพื่อรีเฟรช (เฉพาะแอปที่ติดตั้งแล้ว) — วางเป็นลูกตัวแรกเพราะตัวชี้วาง
              แบบ absolute อิงกับ main และต้องอยู่เหนือเนื้อหาตอนลาก */}
          <div className="print:hidden">
            <PullToRefresh scrollRef={mainRef} />
          </div>
          {/* Page Header — hidden on print */}
          {(title || breadcrumbs) && (
            <div className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-4 lg:px-6 py-4 print:hidden">
              {/* Breadcrumbs */}
              {breadcrumbs && breadcrumbs.length > 0 && (
                <nav className="flex items-center space-x-2 text-sm text-gray-600 dark:text-slate-400 mb-2">
                  {breadcrumbs.map((item, index) => (
                    <div key={index} className="flex items-center">
                      {index > 0 && (
                        <span className="mx-2 text-gray-400">/</span>
                      )}
                      {item.href ? (
                        <a
                          href={item.href}
                          className="hover:text-primary transition-colors"
                        >
                          {item.label}
                        </a>
                      ) : (
                        <span className="text-gray-900 dark:text-white font-medium">
                          {item.label}
                        </span>
                      )}
                    </div>
                  ))}
                </nav>
              )}

              {/* Page Title */}
              {title && (
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {title}
                </h1>
              )}
            </div>
          )}

          {/* Page Body */}
          {/* หน้าที่ส่ง noPadding (หน้าแชท) ต้องการกล่องที่สูงเท่า main พอดี — คิดจาก 100dvh
              ลบหัวเว็บเองจะพลาด 1px (เส้นขอบล่างของหัวเว็บ) แล้ว main เลื่อน/เด้งได้ */}
          <div className={noPadding ? 'h-full print:h-auto print:p-0' : 'p-4 lg:p-6 pb-24 lg:pb-6 print:p-0'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { Sidebar, Header };