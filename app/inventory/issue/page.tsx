'use client';

// เบิกออกสินค้า — ฟอร์มจริงอยู่ที่ StockDocForm (ใช้ร่วมกับรับเข้า/โอนย้าย)
import StockDocForm from '@/app/inventory/components/StockDocForm';

export default function StockIssuePage() {
  return <StockDocForm mode="issue" />;
}
