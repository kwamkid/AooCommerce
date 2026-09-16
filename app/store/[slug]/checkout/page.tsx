// Path: app/store/[slug]/checkout/page.tsx
// Checkout อยู่บน aoo เต็มหน้าเสมอ (ทั้งทาง standalone และทาง WordPress embed)
// — noindex เพราะเป็นหน้าธุรกรรม ไม่ใช่หน้าที่ต้องติดอันดับ
import type { Metadata } from 'next';
import Link from 'next/link';
import { storefrontHref } from '@/lib/storefront';
import { getStorefrontCompany, storeUtilityMetadata } from '@/lib/storefront-server';
import CheckoutClient from './checkout-client';

// ชื่อหน้า + **ชื่อร้าน** — ระบบเป็น multi-tenant ตั้งเป็นสตริงตายตัวแล้วทุกร้าน title ซ้ำกันหมด
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return storeUtilityMetadata(slug, 'ข้อมูลจัดส่ง');
}

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  // ?coupon= มาจากปุ่มในบรอดแคสต์/ข้อความการตลาด — ลูกค้ากดแล้วได้โค้ดติดมาเลย ไม่ต้องจำไปพิมพ์เอง
  searchParams: Promise<{ coupon?: string }>;
}) {
  const { slug } = await params;
  const { coupon } = await searchParams;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  // พักรับออร์เดอร์ = ไม่ต้องให้กรอกฟอร์มจนจบแล้วค่อยโดน API ปฏิเสธ — บอกตั้งแต่เข้าหน้า
  if (!company.config.accepting_orders) {
    return (
      <div className="sf-container">
        <div className="sf-hero">
          <h1>ร้านพักรับออร์เดอร์ชั่วคราว</h1>
          <p>ของในตะกร้ายังอยู่ครบ กลับมาสั่งต่อได้เมื่อร้านเปิดรับออร์เดอร์อีกครั้ง</p>
        </div>
        <Link href={storefrontHref(slug)} className="sf-cta">ดูสินค้าต่อ</Link>
      </div>
    );
  }

  return (
    <CheckoutClient
      shop={slug}
      initialCoupon={typeof coupon === 'string' ? coupon.trim().toUpperCase().replace(/\s+/g, '').slice(0, 40) : ''}
      giftCard={company.gift_card.enabled}
      giftCardFee={company.gift_card.fee}
      lineLogin={company.config.line_login && !!company.line_login_channel_id}
      lineChannelId={company.line_login_channel_id}
      zoneEnabled={company.features.delivery_zone}
      slotEnabled={company.features.delivery_slot.enabled}
      dateEnabled={company.features.delivery_date.enabled}
      // บังคับช่วงเวลา ⇒ ต้องมีวันด้วยเสมอ (เลือกช่วงโดยไม่มีวันไม่ได้)
      dateRequired={company.features.delivery_date.required || company.features.delivery_slot.required}
      slotRequired={company.features.delivery_slot.required}
    />
  );
}
