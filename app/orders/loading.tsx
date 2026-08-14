'use client';

import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import { PageSkeleton } from '@/components/ui/Skeleton';

// Route-level skeleton — Next.js แสดงตัวนี้ระหว่างโหลด segment
// (แทน splash เต็มจอ เพราะเรารู้อยู่แล้วว่าหน้านี้หน้าตาประมาณไหน)
export default function Loading() {
  return (
    <Layout>
      <Container size="full">
        <PageSkeleton variant="list" />
      </Container>
    </Layout>
  );
}
