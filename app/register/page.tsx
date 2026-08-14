// Path: app/register/page.tsx
'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { AlertCircle, Loader2, UserPlus } from 'lucide-react';
import { AuthSplitShell, GoogleLogo } from '@/components/auth/AuthHero';

// Google-only register — email/password ถูกถอดออกแล้ว (2026-08-14)
// รองรับ ?invite_token= สำหรับคำเชิญเข้าบริษัท (ส่งต่อให้ signInWithGoogle)
function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signInWithGoogle, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [checkingAuth, setCheckingAuth] = useState(true);

  const inviteToken = searchParams.get('invite_token') || undefined;

  // Check if already logged in
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) {
        router.push('/dashboard');
      } else {
        setCheckingAuth(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [user, router]);

  const handleGoogleRegister = async () => {
    setError('');
    setIsLoading(true);
    const { error } = await signInWithGoogle(inviteToken);
    if (error) {
      setError(error);
      setIsLoading(false);
    }
    // สำเร็จ → browser จะ redirect ไป Google
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-dvh bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500 dark:text-slate-400">กำลังตรวจสอบ...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthSplitShell>
          <p className="text-primary text-sm font-semibold mb-2">
            เริ่มต้นใช้งาน
          </p>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">สมัครสมาชิก</h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-6">
            สมัครและเข้าสู่ระบบด้วยบัญชี Google เท่านั้น
          </p>

          {inviteToken && (
            <div className="mb-4 p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-start gap-3">
              <UserPlus className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-sm text-primary">
                คุณได้รับคำเชิญเข้าร่วมบริษัท — สมัครด้วย Google เพื่อตอบรับคำเชิญ
              </p>
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
            </div>
          )}

          <button
            onClick={handleGoogleRegister}
            disabled={isLoading}
            className="w-full py-3 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-gray-700 dark:text-white font-semibold rounded-lg border border-gray-300 dark:border-slate-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleLogo />}
            {isLoading ? 'กำลังเปิด Google...' : 'สมัครด้วย Google'}
          </button>

          <p className="text-center text-xs text-gray-400 dark:text-slate-500 mt-6">
            การสมัครถือว่ายอมรับเงื่อนไขการใช้งานของระบบ
          </p>

          <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
              เข้าสู่ระบบ
            </Link>
          </p>
    </AuthSplitShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-dvh bg-gray-50 dark:bg-slate-900">
          <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
