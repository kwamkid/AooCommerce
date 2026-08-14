// Path: app/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { AlertCircle, Loader2 } from 'lucide-react';
import { AuthSplitShell, GoogleLogo } from '@/components/auth/AuthHero';
import { FullPageLoading } from '@/components/ui/Loading';

// Google-only login — email/password ถูกถอดออกแล้ว (2026-08-14)
export default function LoginPage() {
  const { signInWithGoogle, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Check if already logged in — let auth context handle redirect
  useEffect(() => {
    if (user) {
      // Auth context will redirect to /onboarding
    } else {
      setCheckingAuth(false);
    }
  }, [user]);

  const handleGoogleLogin = async () => {
    setError('');
    setIsLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      setError(error);
      setIsLoading(false);
    }
    // สำเร็จ → browser จะ redirect ไป Google
  };

  if (checkingAuth) {
    return <FullPageLoading label="กำลังตรวจสอบ..." />;
  }

  return (
    <AuthSplitShell>
          <p className="text-primary text-sm font-semibold mb-2">
            ยินดีต้อนรับกลับมา
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">เข้าสู่ระบบ</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            ใช้บัญชี Google ในการเข้าสู่ระบบเท่านั้น
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-gray-700 dark:text-white font-semibold rounded-lg border border-gray-300 dark:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleLogo />}
            {isLoading ? 'กำลังเปิด Google...' : 'เข้าสู่ระบบด้วย Google'}
          </button>

          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-6">
            สำหรับพนักงานที่ได้รับอนุญาตเท่านั้น
          </p>

          <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
            ยังไม่มีบัญชี?{' '}
            <Link href="/register" className="text-primary hover:text-primary/80 font-medium transition-colors">
              สมัครสมาชิก
            </Link>
          </p>
    </AuthSplitShell>
  );
}
