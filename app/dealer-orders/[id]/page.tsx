'use client';

import { useParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function DealerOrderDetailPage() {
  const params = useParams();
  const orderId = params.id as string;

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/dealer-orders" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">คำสั่งซื้อตัวแทนขายขาด</h1>
        </div>
        <DealerOrderForm
          mode="wholesale"
          customerTypeFilter="wholesale_dealer"
          customerLabel="ตัวแทน"
          showWarehousePicker
          backUrl="/dealer-orders"
          orderId={orderId}
        />
      </div>
    </Layout>
  );
}
