'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';

export default function DealerOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  const { allowed, loading: permLoading } = useAuthGuard('order.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout>
      <Container size="full" gap="sm">
        <PageHeader title="คำสั่งซื้อตัวแทนขายขาด" backHref="/dealer-orders" />
        <DealerOrderForm
          mode="wholesale"
          customerTypeFilter="wholesale_dealer"
          customerLabel="ตัวแทน"
          showWarehousePicker
          backUrl="/dealer-orders"
          orderId={orderId}
        />
      </Container>
    </Layout>
  );
}
