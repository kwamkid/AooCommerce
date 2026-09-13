'use client';

// โอนย้ายสินค้า — ฟอร์มจริงอยู่ที่ StockDocForm (ใช้ร่วมกับรับเข้า/เบิกออก)
import StockDocForm from '@/app/inventory/components/StockDocForm';

export default function StockTransferPage() {
  return <StockDocForm mode="transfer" />;
}
