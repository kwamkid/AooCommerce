// Path: app/department-store/customers/page.tsx — ลูกค้าห้าง (อยู่ในกลุ่มเมนู "ห้างสรรพสินค้า")
import CustomerListPage from '@/components/customers/CustomerListPage';

export default function Page() {
  return <CustomerListPage scope="department" />;
}
