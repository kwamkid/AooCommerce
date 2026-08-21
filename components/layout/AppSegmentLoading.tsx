// Path: components/layout/AppSegmentLoading.tsx
// โครงหน้าระหว่างเปลี่ยนหน้าในระบบ — ใช้ใน loading.tsx ของทุก segment
//
// ทำไมต้องมี: ถ้า segment ไหนไม่มี loading.tsx ของตัวเอง Next จะถอยไปใช้
// app/loading.tsx ซึ่งเป็น splash เต็มจอสีแบรนด์ — คือทั้ง sidebar ทั้ง header
// หายวับไปทั้งจอแล้วโผล่กลับมา ทุกครั้งที่กดเมนู · ผู้ใช้เห็นเป็น "โหลดหลายรอบ"
// (จอเข้ม → splash ส้ม → จอเข้ม) ทั้งที่กดแค่ครั้งเดียว
//
// ตัวนี้เก็บ chrome ไว้ เปลี่ยนแค่พื้นที่เนื้อหา = เห็น loading อันเดียวจบ
// splash เต็มจอเหลือไว้เฉพาะตอนเปิดเว็บครั้งแรก/ยังไม่รู้ว่าจะ render อะไร
'use client';

import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import { PageSkeleton } from '@/components/ui/Skeleton';

export default function AppSegmentLoading({
  variant = 'list',
}: { variant?: 'list' | 'form' | 'dashboard' | 'detail' }) {
  return (
    <Layout>
      <Container size="full">
        <PageSkeleton variant={variant} />
      </Container>
    </Layout>
  );
}
