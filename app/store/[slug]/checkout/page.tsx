// Path: app/store/[slug]/checkout/page.tsx
// Checkout อยู่บน aoo เต็มหน้าเสมอ (ทั้งทาง standalone และทาง WordPress embed)
// — noindex เพราะเป็นหน้าธุรกรรม ไม่ใช่หน้าที่ต้องติดอันดับ
import type { Metadata } from 'next';
import { getStorefrontCompany } from '@/lib/storefront-server';
import CheckoutClient from './checkout-client';

export const metadata: Metadata = {
  title: 'ข้อมูลจัดส่ง',
  robots: { index: false, follow: false },
};

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  return (
    <CheckoutClient
      shop={slug}
      lineLogin={company.config.line_login && !!company.line_login_channel_id}
      lineChannelId={company.line_login_channel_id}
      zoneEnabled={company.features.delivery_zone}
      slotEnabled={company.features.delivery_slot}
      dateEnabled={company.features.delivery_date.enabled}
    />
  );
}
