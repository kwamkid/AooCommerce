// Path: components/layout/Layout.tsx
'use client';

import { ReactNode, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useCompany } from '@/lib/company-context';
import Sidebar from './Sidebar';
import Header from './Header';

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

        {/* Page Content */}
        {/* pb-safe = เผื่อแถบ home indicator ของจอขอบโค้ง (root layout ตั้ง viewportFit: cover
            หน้าเว็บจึงกินถึงขอบจอจริง) — ไม่งั้นแถวล่างสุดของตารางโดนบังตลอด */}
        <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-safe print:overflow-visible">
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
          <div className={noPadding ? 'print:p-0' : 'p-4 lg:p-6 pb-24 lg:pb-6 print:p-0'}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

export { Sidebar, Header };