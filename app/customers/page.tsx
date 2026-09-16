// Path: app/customers/page.tsx — ลูกค้าทุกกลุ่ม
// เนื้อหาทั้งหมดอยู่ที่ components/customers/CustomerListPage.tsx (ใช้ร่วมกับหน้าตัวแทน/ห้าง)
import CustomerListPage from '@/components/customers/CustomerListPage';

export default function Page() {
  return <CustomerListPage scope="all" />;
}
