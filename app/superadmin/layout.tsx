import type { Metadata } from 'next';

// ชี้ให้หน้า /superadmin/* ใช้ manifest + ไอคอนของ "แอปผู้ดูแลระบบ" แทนของแอปร้าน
// (metadata ของ layout ซ้อนทับค่าจาก root layout เฉพาะเส้นทางนี้)
export const metadata: Metadata = {
  title: 'AooCommerce Admin',
  manifest: '/superadmin/manifest.webmanifest',
  icons: {
    icon: '/icons/admin-icon-192.png',
    apple: '/icons/admin-apple-touch-icon.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Aoo Admin',
  },
};

export const viewport = {
  themeColor: '#0f172a',
};

export default function SuperAdminRouteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
