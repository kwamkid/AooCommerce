'use client';

import Layout from '@/components/layout/Layout';
import PromotionForm from '../components/PromotionForm';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';

export default function NewPromotionPage() {
  const { allowed, loading: permLoading } = useAuthGuard('product.manage');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout>
      <PromotionForm />
    </Layout>
  );
}
