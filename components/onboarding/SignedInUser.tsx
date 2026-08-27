'use client';

import { useAuth } from '@/lib/auth-context';
import { LogOut } from 'lucide-react';

/**
 * ชิปบอกตัวตนบนหน้า onboarding — รูป/ชื่อ/อีเมลของคนที่ login + ปุ่มออกจากระบบ
 *
 * เกิดจากเคสจริง: พนักงานถูกเชิญด้วยอีเมลหนึ่งแต่กด Google login ด้วยอีกอีเมล
 * แล้วหน้า onboarding ไม่บอกเลยว่ากำลังใช้บัญชีไหน — ทุกหน้าในโซน onboarding
 * (เลือกบริษัท + wizard สร้างบริษัท) ต้องแสดงชิปนี้เสมอ
 */
export default function SignedInUser() {
  const { user, userProfile, signOut } = useAuth();
  if (!user) return null;

  const email = userProfile?.email || user.email || '';
  const name = userProfile?.name || email.split('@')[0];
  const avatar = userProfile?.avatar;
  const initial = (name.trim().charAt(0) || 'U').toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={name} className="w-9 h-9 rounded-full object-cover border border-gray-200 dark:border-slate-600 flex-shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
            {initial}
          </div>
        )}
        <div className="min-w-0 text-right sm:text-left">
          <div className="text-sm font-medium text-gray-900 dark:text-white truncate">{name}</div>
          <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{email}</div>
        </div>
      </div>
      <button
        onClick={signOut}
        title="ออกจากระบบ"
        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex-shrink-0"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
}
