'use client';

import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import { DeptStoreIcon } from '@/lib/icons';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';

export default function NewDepartmentOrderPage() {
  const { allowed, loading: permLoading } = useAuthGuard('order.manage');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return (
    <Layout>
      <div className="space-y-4">
        <PageHeader
          backHref="/department-orders"
          icon={<DeptStoreIcon />}
          title="สร้างใบส่งห้าง"
        />

        <DealerOrderForm
          mode="department"
          customerTypeFilter="department_store"
          customerLabel="ห้างสรรพสินค้า"
          submitLabel="สร้างใบส่งห้าง"
          summaryTitle="สรุปใบส่งห้าง"
          showWarehousePicker
          backUrl="/department-orders"
        />
      </div>
    </Layout>
  );
}
