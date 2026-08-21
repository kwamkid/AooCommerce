'use client';

import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import { Building2 } from 'lucide-react';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';

export default function NewDepartmentOrderPage() {
  return (
    <Layout>
      <div className="space-y-4">
        <PageHeader
          backHref="/department-orders"
          icon={<Building2 />}
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
