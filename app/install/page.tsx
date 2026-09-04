import type { Metadata } from 'next';
import InstallClient from './install-client';

export const metadata: Metadata = {
  title: 'ติดตั้งแอป AooCommerce',
  description:
    'วิธีติดตั้ง AooCommerce เป็นแอปบน iPhone, Android และคอมพิวเตอร์ เพื่อรับแจ้งเตือนแชทและออเดอร์ทันที',
  // ลิงก์ภายในสำหรับส่งให้พนักงาน ไม่ใช่หน้าโปรโมท — ไม่ต้องให้ค้นเจอใน Google
  robots: { index: false, follow: false },
};

export default function InstallPage() {
  return <InstallClient />;
}
