// Path: app/auth/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { takeAuthReturnPath } from '@/lib/auth/return-path';
import { useRouter } from 'next/navigation';
import { FullPageLoading } from '@/components/ui/Loading';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // PKCE: the SDK exchanges the ?code= param for a session
        // asynchronously after load — poll briefly instead of failing on
        // the first empty read.
        let session = null;
        for (let attempt = 0; attempt < 10; attempt++) {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            session = data.session;
            break;
          }
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (!session) {
          console.error('Auth callback: no session after PKCE exchange');
          setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
          setTimeout(() => router.replace('/login'), 2000);
          return;
        }

        // Handle invite token
        const inviteToken = document.cookie
          .split('; ')
          .find(row => row.startsWith('invite_token='))
          ?.split('=')[1];

        if (inviteToken) {
          // Call API to accept invitation
          try {
            await fetch('/api/auth/accept-invite', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
              },
              body: JSON.stringify({ inviteToken }),
            });
          } catch (e) {
            console.error('Accept invite error:', e);
          }
          // Clear invite token cookie
          document.cookie = 'invite_token=; path=/; max-age=0';
        }

        // Redirect to onboarding
        router.replace(takeAuthReturnPath() || '/onboarding');
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
        setTimeout(() => router.replace('/login'), 2000);
      }
    };

    handleCallback();
  }, [router]);

  // ระหว่างรอ = splash แบรนด์เดียวกับทั้งระบบ · ผิดพลาดค่อยแสดงข้อความบนพื้นแบรนด์เดียวกัน
  if (!error) return <FullPageLoading label="กำลังเข้าสู่ระบบ..." />;

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
