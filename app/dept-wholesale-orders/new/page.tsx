'use client';

import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';

export default function NewDeptWholesaleOrderPage() {
  const { allowed, loading: permLoading } = useAuthGuard('order.manage');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout>
      <div className="space-y-4">
        <PageHeader backHref="/dept-wholesale-orders" title="สร้างคำสั่งซื้อห้างขายขาด" />
        <DealerOrderForm
          mode="wholesale"
          customerTypeFilter="wholesale_department"
          customerLabel="ห้าง"
          showWarehousePicker
          backUrl="/dept-wholesale-orders"
        />
      </div>
    </Layout>
  );
}
