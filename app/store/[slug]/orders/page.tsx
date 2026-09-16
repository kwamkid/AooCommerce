// Path: app/store/[slug]/orders/page.tsx
// "คำสั่งซื้อของฉัน" — รายการมาจาก localStorage ของเครื่องนี้ (ไม่มีระบบ login
// ลูกค้า) จึงเป็น client ล้วนและ noindex เสมอ
import type { Metadata } from 'next';
import { getStorefrontCompany, storeUtilityMetadata } from '@/lib/storefront-server';
import OrdersClient from './orders-client';

// ชื่อหน้า + **ชื่อร้าน** — ระบบเป็น multi-tenant ตั้งเป็นสตริงตายตัวแล้วทุกร้าน title ซ้ำกันหมด
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return storeUtilityMetadata(slug, 'คำสั่งซื้อของฉัน');
}

export default async function StorefrontOrdersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว
  return <OrdersClient shop={slug} />;
}
