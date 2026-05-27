'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';

export default function DealerOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

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
