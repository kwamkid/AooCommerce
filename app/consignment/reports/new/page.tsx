'use client';

import { Suspense, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { ArrowLeft, ClipboardList, Loader2 } from 'lucide-react';
import Link from 'next/link';
import DealerOrderForm from '@/components/dealer/DealerOrderForm';

function NewReportPageContent() {
  const router = useRouter();

  // Draft created → redirect to detail page for review + confirm
  const handleSubmitSuccess = useCallback(async (data: { report_id?: string }) => {
    if (data.report_id) {
      router.push(`/consignment/reports/${data.report_id}`);
    }
  }, [router]);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/consignment/reports" className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">คีย์ยอดตัวแทน</h1>
          </div>
        </div>

        <DealerOrderForm
          mode="consignment"
          customerTypeFilter="consignment_dealer"
          customerLabel="ตัวแทน"
          submitLabel="บันทึกร่าง"
          summaryTitle="สรุปยอดขาย"
          backUrl="/consignment/reports"
          onSubmitSuccess={handleSubmitSuccess}
        />
      </div>
    </Layout>
  );
}

export default function NewConsignmentReportPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </Layout>
    }>
      <NewReportPageContent />
    </Suspense>
  );
}
