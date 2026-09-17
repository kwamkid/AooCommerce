'use client';

// โอนย้ายสินค้า — ฟอร์มจริงอยู่ที่ StockDocForm (ใช้ร่วมกับรับเข้า/เบิกออก)
import StockDocForm from '@/app/inventory/components/StockDocForm';
import { useAuthGuard } from '@/lib/useAuthGuard';
import Layout from '@/components/layout/Layout';
import { LoadingCard } from '@/components/ui/StateCard';

export default function StockTransferPage() {
  const { allowed, loading: permLoading } = useAuthGuard('inventory.manage');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไปหน้าอื่น

  return <StockDocForm mode="transfer" />;
}
