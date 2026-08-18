// Path: app/store/[slug]/orders/page.tsx
// "คำสั่งซื้อของฉัน" — รายการมาจาก localStorage ของเครื่องนี้ (ไม่มีระบบ login
// ลูกค้า) จึงเป็น client ล้วนและ noindex เสมอ
import type { Metadata } from 'next';
import { getStorefrontCompany } from '@/lib/storefront-server';
import OrdersClient from './orders-client';

export const metadata: Metadata = {
  title: 'คำสั่งซื้อของฉัน',
  robots: { index: false, follow: false },
};

export default async function StorefrontOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว
  return <OrdersClient shop={slug} />;
}
