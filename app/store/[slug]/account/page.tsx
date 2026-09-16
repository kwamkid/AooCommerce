// Path: app/store/[slug]/account/page.tsx
// บัญชีลูกค้าของร้าน — เข้าสู่ระบบด้วย Google หรือ LINE เพื่อเก็บประวัติสั่งซื้อ
// และรับแจ้งเตือนสถานะออเดอร์
//
// ปุ่ม LINE จะโผล่เฉพาะร้านที่ตั้งค่า LINE OA ไว้แล้ว — ร้านที่ไม่มี OA
// ให้ login LINE ไปก็ส่งแจ้งเตือนไม่ได้ กลายเป็นปุ่มที่ให้ความคาดหวังผิด
import type { Metadata } from 'next';
import { getStorefrontCompany, storeUtilityMetadata } from '@/lib/storefront-server';
import AccountClient from './account-client';

// ชื่อหน้า + **ชื่อร้าน** — ระบบเป็น multi-tenant ตั้งเป็นสตริงตายตัวแล้วทุกร้าน title ซ้ำกันหมด
export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  return storeUtilityMetadata(slug, 'บัญชีของฉัน');
}

export default async function StorefrontAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return null;   // layout แสดงหน้า 'ไม่พบร้านนี้' ให้แล้ว

  return (
    <AccountClient
      shop={slug}
      shopName={company.config.display_name || company.name}
      lineLogin={company.config.line_login && !!company.line_login_channel_id}
    lineChannelId={company.line_login_channel_id}
    lineOa={company.line_oa}
    />
  );
}
