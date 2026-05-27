'use client';

import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';

export default function NewDealerOrderPage() {
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
