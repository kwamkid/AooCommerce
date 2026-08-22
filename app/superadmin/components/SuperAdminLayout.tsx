'use client';

import { ReactNode } from 'react';
import SuperAdminSidebar from './SuperAdminSidebar';
import { useSuperAdminGuard } from '../hooks/useSuperAdminGuard';
import { LoadingCard } from '@/components/ui/StateCard';

interface SuperAdminLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function SuperAdminLayout({ children, title, subtitle }: SuperAdminLayoutProps) {
  const { isSuperAdmin, loading } = useSuperAdminGuard();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-950">
        <div className="w-full max-w-md px-4">
          <LoadingCard />
        </div>
      </div>
    );
  }

  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-base">
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
