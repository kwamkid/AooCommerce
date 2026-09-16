// Path: app/store/[slug]/cart/page.tsx
// ตะกร้า — client ล้วน (อยู่ใน localStorage) จึง noindex เสมอ
import type { Metadata } from 'next';
import { getStorefrontCompany, storeUtilityMetadata } from '@/lib/storefront-server';
import CartClient from './cart-client';

// ชื่อหน้า + **ชื่อร้าน** — ระบบเป็น multi-tenant ตั้งเป็นสตริงตายตัวแล้วทุกร้าน title ซ้ำกันหมด
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return storeUtilityMetadata(slug, 'ตะกร้าสินค้า');
}

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว
  return <CartClient shop={slug} />;
}
