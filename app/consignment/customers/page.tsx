// Path: app/consignment/customers/page.tsx — ลูกค้าตัวแทน (อยู่ในกลุ่มเมนู "ตัวแทนจำหน่าย")
// เดิมต้องวนไปหาที่เมนูลูกค้าแล้วกดแท็บเอง — คนใช้หาไม่เจอ
import CustomerListPage from '@/components/customers/CustomerListPage';

export default function Page() {
  return <CustomerListPage scope="dealer" />;
}
