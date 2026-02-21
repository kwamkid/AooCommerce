// Path: app/auth/callback/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Supabase client automatically picks up the session from the URL hash/params
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          console.error('Auth callback session error:', sessionError);
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
        router.replace('/onboarding');
      } catch (err) {
        console.error('Auth callback error:', err);
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
        setTimeout(() => router.replace('/login'), 2000);
      }
    };

    // Wait a moment for Supabase to process the URL hash
    const timer = setTimeout(handleCallback, 100);
    return () => clearTimeout(timer);
  }, [router]);

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
            <div className="w-16 h-16 border-4 border-[#F4511E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white">กำลังเข้าสู่ระบบ...</p>
          </>
        )}
      </div>
    </div>
  );
}
