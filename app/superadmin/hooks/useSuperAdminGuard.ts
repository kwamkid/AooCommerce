'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter, usePathname } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';

export function useSuperAdminGuard() {
  const { user, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    if (!user || !session) {
      // ต้องพก ?redirect กลับมาด้วยเสมอ — ไม่งั้นล็อกอินเสร็จจะไปโผล่ "เลือกบริษัท"
      // (ค่า default ของหน้า login) ทั้งที่ตั้งใจจะเข้าหน้าผู้ดูแลระบบ
      // เห็นชัดสุดในแอปที่ติดตั้ง: เปิดแอปแอดมิน แล้วโดนถามให้เลือกบริษัท
      router.replace(`/login?redirect=${encodeURIComponent(pathname || '/superadmin')}`);
      return;
    }

    const checkAccess = async () => {
      try {
        // probe ตัวเบา (JWT verify + 1 query) — เดิมใช้ /stats ทั้งชุด (5 query)
        // เป็นเครื่องเช็คสิทธิ์ ทำทุกหน้า superadmin ติด skeleton รอโดยไม่จำเป็น
        const res = await apiFetch('/api/superadmin/me');
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
  }, [user, session, authLoading, router, pathname]);

  return { isSuperAdmin, loading };
}
