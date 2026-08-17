// Path: app/store/[slug]/cart/page.tsx
// ตะกร้า — client ล้วน (อยู่ใน localStorage) จึง noindex เสมอ
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStorefrontCompany } from '@/lib/storefront-server';
import CartClient from './cart-client';

export const metadata: Metadata = {
  title: 'ตะกร้าสินค้า',
  robots: { index: false, follow: false },
};

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) notFound();
  return <CartClient shop={slug} />;
}
