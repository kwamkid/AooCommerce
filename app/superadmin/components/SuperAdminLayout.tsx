'use client';

import { ReactNode } from 'react';
import SuperAdminSidebar from './SuperAdminSidebar';
import { useSuperAdminGuard } from '../hooks/useSuperAdminGuard';
import SuperAdminSkeleton from './SuperAdminSkeleton';

interface SuperAdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function SuperAdminLayout({ children, title, subtitle }: SuperAdminLayoutProps) {
  const { isSuperAdmin, loading } = useSuperAdminGuard();

  if (loading) {
    // skeleton เต็มโครง shell (sidebar+header+เนื้อหา) — ไม่ใช่การ์ดลอยกลางจอ
    return <SuperAdminSkeleton />;
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    // `dark` บังคับ dark: variants ของ shared components (LoadingCard/FormInput/Button)
    // เพราะ shell นี้ทาสี slate เข้มตายตัว ไม่ได้ผูกกับ theme ของแอปหลัก
    <div className="dark flex h-screen bg-slate-950 overflow-hidden text-base">
      <SuperAdminSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-slate-900 border-b border-slate-700/50 px-4 lg:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="pl-10 lg:pl-0">
              <h1 className="text-xl lg:text-2xl font-bold text-white">{title}</h1>
              {subtitle && <p className="text-sm text-slate-400 mt-0.5">{subtitle}</p>}
            </div>
            <span className="px-3 py-1 bg-violet-500/20 text-violet-400 text-xs font-semibold rounded-full border border-violet-500/30">
              SUPER ADMIN
            </span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
