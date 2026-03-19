'use client';

import Layout from '@/components/layout/Layout';
import WholesaleOrderForm from '@/components/wholesale/WholesaleOrderForm';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

export default function NewDealerOrderPage() {
  return (
    <Layout>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dealer-orders" className="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สร้างคำสั่งซื้อตัวแทนขายขาด</h1>
      </div>
      <WholesaleOrderForm
        customerTypeFilter="wholesale_dealer"
        title="คำสั่งซื้อตัวแทนขายขาด"
        backUrl="/dealer-orders"
      />
    </Layout>
  );
}
