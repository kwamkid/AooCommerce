'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export function useSuperAdminGuard() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !session) {
      router.replace('/login');
      return;
    }

    const checkAccess = async () => {
      try {
        const res = await apiFetch('/api/superadmin/stats');
        if (res.ok) {
          setIsSuperAdmin(true);
        } else {
          router.replace('/dashboard');
        }
      } catch {
        router.replace('/dashboard');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [user, session, authLoading, router]);

  return { isSuperAdmin, loading };
}
