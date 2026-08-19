// Path: app/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { FullPageLoading } from '@/components/ui/Loading';

export default function HomePage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      // ถ้า login แล้วไป dashboard
      // ถ้ายังไม่ login ไป login page
      if (user) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [user, loading, router]);

  return (
    <FullPageLoading />
  );
}