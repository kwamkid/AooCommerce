'use client';

// รับเข้าสินค้า — ฟอร์มจริงอยู่ที่ StockDocForm (ใช้ร่วมกับเบิกออก/โอนย้าย)
import StockDocForm from '@/app/inventory/components/StockDocForm';

export default function StockReceivePage() {
  return <StockDocForm mode="receive" />;
}
