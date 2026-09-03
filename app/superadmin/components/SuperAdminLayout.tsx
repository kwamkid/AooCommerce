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
    //
    // h-dvh ไม่ใช่ h-screen — บนมือถือ h-screen (100vh) นับรวมแถบเบราว์เซอร์ที่ซ่อน/โผล่
    // ทำให้ท้ายหน้าโดนตัดหายในแอปที่ติดตั้งแล้ว
    <div className="dark flex h-dvh bg-slate-950 overflow-hidden text-base">
      <SuperAdminSidebar />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Header
            แอปนี้ตั้ง status bar เป็น black-translucent (layout.tsx) = เนื้อหาไหลไปอยู่
            ใต้นาฬิกา/แบตเตอรี่ → พื้นหลัง header ต้องกินขึ้นไปถึงขอบจอ แต่ **เนื้อหา
            ต้องเริ่มใต้ safe area** ไม่งั้นหัวข้อทับนาฬิกาและปุ่มเมนูกดไม่โดน
            (เจอจริง 4 ก.ย. 2026 — ดู fix-bug.md) */}
        <header className="bg-slate-900 border-b border-slate-700/50 px-safe-4 lg:px-safe-6 pt-safe-3 pb-3 lg:pt-safe-4 lg:pb-4">
          {/* เว้นที่ให้ปุ่มเมนูที่ลอยอยู่มุมซ้ายบน (มือถือ) — ปุ่มอยู่นอก flow จึงต้องกันที่เอง */}
          <div className="flex items-center justify-between gap-3 pl-11 lg:pl-0">
            <div className="min-w-0">
              <h1 className="text-xl lg:text-2xl font-bold text-white truncate">{title}</h1>
              {subtitle && <p className="text-sm text-slate-400 mt-0.5 truncate">{subtitle}</p>}
            </div>
            {/* บนมือถือไม่ต้องย้ำว่าเป็น superadmin — sidebar บอกอยู่แล้ว
                และแถวเดียวใส่ทั้งหัวข้อ+สวิตช์+ป้าย มันแน่นจนอ่านไม่ออก
                (สวิตช์แจ้งเตือนย้ายไปอยู่ใน sidebar ที่มีที่พอให้กดจริง) */}
            <span className="hidden lg:inline-block flex-shrink-0 px-3 py-1 bg-violet-500/20 text-violet-400 text-xs font-semibold rounded-full border border-violet-500/30">
              SUPER ADMIN
            </span>
          </div>
        </header>
        {/* pb เผื่อแถบ home indicator ของจอขอบโค้ง — ไม่งั้นการ์ดใบสุดท้ายโดนบัง */}
        <main className="flex-1 overflow-y-auto px-safe-4 lg:px-safe-6 pt-4 lg:pt-6 pb-safe-6">
          {children}
        </main>
      </div>
    </div>
  );
}
