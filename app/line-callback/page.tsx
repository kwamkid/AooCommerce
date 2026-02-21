// Path: app/line-callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Suspense } from 'react';

function LineCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const errorParam = searchParams.get('error');

      if (errorParam) {
        setError('การเข้าสู่ระบบด้วย LINE ถูกยกเลิก');
        setTimeout(() => router.replace('/login'), 2000);
        return;
      }

      if (!code) {
        setError('ไม่พบรหัสยืนยันจาก LINE');
        setTimeout(() => router.replace('/login'), 2000);
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/line-callback`;

        const response = await fetch('/api/auth/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE');
          setTimeout(() => router.replace('/login'), 3000);
          return;
        }

        // Set session in Supabase client
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });

        // Clear invite token cookie
        document.cookie = 'invite_token=; path=/; max-age=0';

        // Redirect to onboarding
        router.replace('/onboarding');
      } catch {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE');
        setTimeout(() => router.replace('/login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
      <div className="text-center">
        {error ? (
          <>
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <p className="text-red-400 mb-2">{error}</p>
            <p className="text-gray-500 text-sm">กำลังนำคุณกลับไป...</p>
          </>
        ) : (
          <>
            <div className="w-16 h-16 border-4 border-[#00B900] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white">กำลังเข้าสู่ระบบด้วย LINE...</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function LineCallbackPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-[#1A1A2E]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#00B900] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">กำลังเข้าสู่ระบบด้วย LINE...</p>
        </div>
      </div>
    }>
      <LineCallbackContent />
    </Suspense>
  );
}
