// Path: app/supplier-portal/layout.tsx
// Minimal layout for supplier portal — no sidebar, no admin auth.
// Static metadata only: data is deliberately NOT server-rendered because the
// portal has its own access-code auth — SSR-ing data would put it in the
// HTML before the code check.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Supplier Portal — เช็คสต็อกและยอดขาย',
  description: 'เข้าสู่ระบบเพื่อดูสต็อกคงเหลือ ยอดขาย ใบสั่งซื้อ และรายงานของคุณ',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Supplier Portal — เช็คสต็อกและยอดขาย',
    description: 'เข้าสู่ระบบเพื่อดูสต็อกคงเหลือ ยอดขาย ใบสั่งซื้อ และรายงานของคุณ',
    type: 'website',
  },
};

export default function SupplierPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
