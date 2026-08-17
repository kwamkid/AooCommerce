// Path: app/store/[slug]/order/[id]/page.tsx
// หน้าคำสั่งซื้อ + ชำระเงิน — อยู่ใน storefront shell เพื่อให้จบในร้านเดียวกัน
// (เดิมเด้งไป /bills/[id] ซึ่งเป็นคนละดีไซน์ ลูกค้ารู้สึกหลุดออกจากร้าน)
//
// ข้อมูลมาจาก GET handler ของ /api/bills เรียก in-process — single source of
// truth เดียวกับหน้าบิลเดิม ไม่ต้องมี API ซ้ำ
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextRequest } from 'next/server';
import { GET as billsGET } from '@/app/api/bills/route';
import { getStorefrontCompany } from '@/lib/storefront-server';
import OrderClient, { type StoreOrder } from './order-client';

export const metadata: Metadata = {
  title: 'คำสั่งซื้อ',
  robots: { index: false, follow: false },
};

async function fetchOrder(id: string): Promise<StoreOrder | null> {
  try {
    const res = await billsGET(
      new NextRequest(`http://localhost/api/bills?id=${encodeURIComponent(id)}`),
    );
    if (!res.ok) return null;
    const data = await res.json();
    return (data.bill as StoreOrder) || null;
  } catch {
    return null;
  }
}

export default async function StorefrontOrderPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const { slug, id } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) notFound();

  const order = await fetchOrder(id);
  // ⚠️ ต้องเช็คว่าออเดอร์เป็นของร้านนี้จริง ไม่งั้นเอา id ของร้านอื่นมาเปิด
  // ใต้ slug ไหนก็ได้ — ข้อมูลข้ามบริษัทรั่ว
  if (!order || order.company_id !== company.id) notFound();

  return <OrderClient shop={slug} initialOrder={order} />;
}
