// Static metadata for the PIN-gated consignment portal. Data is deliberately
// NOT server-rendered here — the portal has its own PIN auth, and SSR-ing
// data would put it in the HTML before the PIN check.
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'พอร์ทัลตัวแทนฝากขาย',
  description: 'เข้าสู่ระบบเพื่อดูรายงานฝากขาย สต็อก และใบวางบิลของคุณ',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'พอร์ทัลตัวแทนฝากขาย',
    description: 'เข้าสู่ระบบเพื่อดูรายงานฝากขาย สต็อก และใบวางบิลของคุณ',
    type: 'website',
  },
};

export default function ConsignmentPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
