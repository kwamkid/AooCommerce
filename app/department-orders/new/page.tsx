'use client';

import Layout from '@/components/layout/Layout';
import { ArrowLeft, Building2 } from 'lucide-react';
import Link from 'next/link';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';

export default function NewDepartmentOrderPage() {
  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/department-orders" className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สร้างใบส่งห้าง</h1>
          </div>
        </div>

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
