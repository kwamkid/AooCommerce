'use client';

import { use } from 'react';
import Layout from '@/components/layout/Layout';
import PromotionForm from '../../components/PromotionForm';

export default function EditPromotionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Layout>
      <PromotionForm promotionId={id} />
    </Layout>
  );
}
