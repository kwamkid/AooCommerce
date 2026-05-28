'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Package, Users, ShoppingCart, ArrowRight } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/lib/auth-context';
import { clearWizardState } from '@/components/onboarding/wizard-storage';

export default function OnboardingCompletePage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();

  // /api/onboarding/finalize on the payment step already creates the company +
  // marks onboarding_completed_at. We just refresh the profile/companies cache
  // so Layout sees the new company (AuthProvider caches /api/auth/me for 30 min
  // in sessionStorage) and clear the wizard-step sessionStorage so a future
  // "create another company" starts clean.
  useEffect(() => {
    refreshProfile().catch(() => {});
    clearWizardState();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 mx-auto flex items-center justify-center mb-4">
          <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">เสร็จสิ้น!</h1>
        <p className="text-gray-600 dark:text-slate-400 mb-6">ตั้งค่าระบบเรียบร้อยแล้ว เริ่มขายได้เลย</p>

        <div className="text-left bg-gray-50 dark:bg-slate-700/40 rounded-xl p-4 mb-6 space-y-2">
          <div className="text-sm font-semibold text-gray-700 dark:text-slate-300">ขั้นต่อไป</div>
          <button
            onClick={() => router.push('/products/new')}
            className="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
              <Package className="w-4 h-4 text-primary" />
              เพิ่มสินค้า
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => router.push('/customers/new')}
            className="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
              <Users className="w-4 h-4 text-primary" />
              เพิ่มลูกค้า
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </button>
          <button
            onClick={() => router.push('/orders/new')}
            className="w-full flex items-center justify-between text-left px-3 py-2.5 rounded-lg hover:bg-white dark:hover:bg-slate-700 transition-colors"
          >
            <span className="flex items-center gap-2.5 text-gray-700 dark:text-slate-300">
              <ShoppingCart className="w-4 h-4 text-primary" />
              สร้างออเดอร์แรก
            </span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <Button variant="primary" fullWidth size="lg" onClick={() => router.push('/dashboard')}>
          ไปยังแดชบอร์ด
        </Button>
      </div>
    </div>
  );
}
