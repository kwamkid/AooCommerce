'use client';

import { Suspense, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import { ClipboardList, Loader2 } from 'lucide-react';
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
        <PageHeader
          backHref="/consignment/reports"
          icon={<ClipboardList />}
          title="คีย์ยอดตัวแทน"
        />

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
