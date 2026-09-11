// Path: app/marketing/audiences/new/page.tsx
//
// สร้างกลุ่มเป้าหมาย — หน้าบาง ๆ ที่ห่อ `AudienceForm` ไว้เท่านั้น
// (ตัวฟอร์มใช้ร่วมกับหน้าแก้ไข จึงไม่มีอะไรเป็นของหน้านี้นอกจากหัวเรื่อง)
'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import AudienceForm from '../components/AudienceForm';

/**
 * มาจากแม่แบบ (?template=) — แยกเป็น component ของตัวเองเพราะ `useSearchParams`
 * ต้องอยู่ใต้ Suspense (ไม่งั้น Next บังคับให้ทั้งหน้าเรนเดอร์แบบ dynamic)
 */
function CreateForm() {
  const templateKey = useSearchParams().get('template');
  return <AudienceForm mode="create" templateKey={templateKey} />;
}

export default function NewAudiencePage() {
  const { allowed, loading } = useAuthGuard('marketing.audiences', { noRedirect: true });

  if (loading) {
    return <Layout><Container size="full"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) {
    return <Layout><Container size="full"><NoPermissionCard /></Container></Layout>;
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          backHref="/marketing/audiences"
          title="สร้างกลุ่มเป้าหมาย"
          subtitle="เลือกกลุ่มเป้าหมายกับแหล่งที่มา แล้วระบบ sync ไป Meta ให้ทันทีที่สร้าง"
        />
        <Suspense fallback={<LoadingCard />}>
          <CreateForm />
        </Suspense>
      </Container>
    </Layout>
  );
}
