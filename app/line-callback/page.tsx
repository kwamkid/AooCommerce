// Path: app/line-callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { takeAuthReturnPath } from '@/lib/auth/return-path';
import { useRouter, useSearchParams } from 'next/navigation';
import { FullPageLoading } from '@/components/ui/Loading';
import { adoptSession } from '@/lib/auth/session-manager';
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

        let shop: string | null = null;
        try { shop = sessionStorage.getItem('sf_line_shop'); } catch { /* ignore */ }

        // คำเชิญเดินทางมากับ state (ทางหลัก) — cookie เป็นทางสำรองสำหรับลิงก์เก่า
        const stateParam = searchParams.get('state') || '';
        const inviteFromState = stateParam.includes('.invite-')
          ? stateParam.split('.invite-')[1]
          : '';
        const inviteFromCookie = document.cookie
          .split('; ')
          .find(row => row.startsWith('invite_token='))
          ?.split('=')[1];
        const inviteToken = inviteFromState || inviteFromCookie || undefined;

        const response = await fetch('/api/auth/line', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri, shop, inviteToken }),
        });
        try { sessionStorage.removeItem('sf_line_shop'); } catch { /* ignore */ }

        const data = await response.json();

        if (!response.ok) {
          setError(data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE');
          setTimeout(() => router.replace('/login'), 3000);
          return;
        }

        // Install the server-minted session into the Supabase client
        const { error: sessionError } = await adoptSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionError) {
          setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE');
          setTimeout(() => router.replace('/login'), 3000);
          return;
        }

        // Clear invite token cookie
        document.cookie = 'invite_token=; path=/; max-age=0';

        // รับคำเชิญสำเร็จ = เป็นสมาชิกบริษัทแล้ว เข้าหน้าหลักได้เลย ไม่ต้องผ่าน onboarding
        if (data.joined_company_id) {
          try { localStorage.setItem('aoo-current-company-id', data.joined_company_id); } catch { /* ignore */ }
          window.location.href = '/dashboard';
          return;
        }

        // Redirect to onboarding
        router.replace(takeAuthReturnPath() || '/onboarding');
      } catch {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย LINE');
        setTimeout(() => router.replace('/login'), 3000);
      }
    };

    handleCallback();
  }, [searchParams, router]);

  // ระหว่างรอ = splash แบรนด์เดียวกับทั้งระบบ · ผิดพลาดค่อยแสดงข้อความบนพื้นแบรนด์เดียวกัน
  if (!error) return <FullPageLoading label="กำลังเข้าสู่ระบบด้วย LINE..." />;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-[#F4511E] to-[#B23A0E] p-6">
      <div className="text-center">
        <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-white mb-2">{error}</p>
        <p className="text-white/70 text-sm">กำลังนำคุณกลับไป...</p>
      </div>
    </div>
  );
}

export default function LineCallbackPage() {
  return (
    <Suspense fallback={<FullPageLoading label="กำลังเข้าสู่ระบบด้วย LINE..." />}>
      <LineCallbackContent />
    </Suspense>
  );
}
