'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthGuard } from '@/lib/useAuthGuard';
import Layout from '@/components/layout/Layout';
import { LoadingCard } from '@/components/ui/StateCard';

// Redirect old detail page to new edit/view page
export default function ReplenishmentDetailRedirect() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  useEffect(() => {
    if (id) {
      router.replace(`/replenishments/new?id=${id}&view=1`);
    }
  }, [id, router]);

  const { allowed, loading: permLoading } = useAuthGuard('order.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return null;
}
