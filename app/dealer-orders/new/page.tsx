'use client';

import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';

export default function NewDealerOrderPage() {
  const { allowed, loading: permLoading } = useAuthGuard('order.manage');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout>
      <Container size="full" gap="sm">
        <PageHeader title="สร้างคำสั่งซื้อตัวแทนขายขาด" backHref="/dealer-orders" />
        <DealerOrderForm
          mode="wholesale"
          customerTypeFilter="wholesale_dealer"
          customerLabel="ตัวแทน"
          showWarehousePicker
          backUrl="/dealer-orders"
        />
      </Container>
    </Layout>
  );
}
