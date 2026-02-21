'use client';

import { useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import OrderForm from '@/components/orders/OrderForm';
import { ArrowLeft } from 'lucide-react';

export default function NewOrderPage() {
  const router = useRouter();
  const warehouseRef = useRef<HTMLDivElement>(null);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">สร้างคำสั่งซื้อใหม่</h1>
          </div>
          <div ref={warehouseRef} />
        </div>

        {/* Order Form */}
        <OrderForm warehousePortalRef={warehouseRef} />
      </div>
    </Layout>
  );
}
