'use client';

import { useCallback, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuthGuard } from '@/lib/useAuthGuard';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import { LoadingCard } from '@/components/ui/StateCard';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { Activity } from 'lucide-react';
import { ExcelIcon, ProductIcon, ReverseIcon, StockIssueIcon, StockReceiveIcon, StockTransferIcon, WarehouseIcon } from '@/lib/icons';
import { WarehouseItem, TabKey } from './components/types';
import StockTab from './components/StockTab';
import MovementsTab from './components/MovementsTab';
import Tabs from '@/components/ui/Tabs';

/** ตัวกรองของแท็บสต็อก — ต้องถูกทิ้งเมื่อย้ายไปแท็บอื่น ไม่งั้นค้างใน URL แล้วกลับมาเจอผลกรองเดิม */
const STOCK_PARAMS = ['q', 'wh', 'dealer', 'cat', 'brand', 'sup', 'status', 'sort', 'dir', 'page', 'limit'];

/** ตัวกรองของแท็บความเคลื่อนไหว — ทิ้งเมื่อย้ายกลับไปแท็บสต็อกด้วยเหตุผลเดียวกัน */
const MOVEMENT_PARAMS = ['from', 'to', 'wh', 'dealer', 'type', 'ref', 'q', 'variation', 'label', 'page', 'limit'];

function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { features } = useFeatures();

  // `history` / `monitor` คือชื่อแท็บเดิมก่อนยุบรวม — ลิงก์เก่าที่ผู้ใช้บุ๊กมาร์กไว้ต้องยังเข้าได้
  const tabParam = searchParams.get('tab');
  const activeTab: TabKey =
    tabParam === 'movements' || tabParam === 'history' || tabParam === 'monitor' ? 'movements' : 'stock';

  const replaceParams = useCallback((mutate: (p: URLSearchParams) => void) => {
    const params = new URLSearchParams(searchParams.toString());
    mutate(params);
    const qs = params.toString();
    router.replace(`/inventory${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  const setActiveTab = useCallback((tab: TabKey) => {
    replaceParams(p => {
      if (tab === 'stock') p.delete('tab');
      else p.set('tab', tab);
      for (const key of (tab === 'stock' ? MOVEMENT_PARAMS : STOCK_PARAMS)) p.delete(key);
    });
  }, [replaceParams]);

  const viewHistory = useCallback((variationId: string, label: string) => {
    replaceParams(p => {
      for (const key of STOCK_PARAMS) p.delete(key);
      p.set('tab', 'movements');
      p.set('variation', variationId);
      if (label) p.set('label', label); else p.delete('label');
    });
  }, [replaceParams]);

  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  useFetchOnce(async () => {
    try {
      const res = await apiFetch('/api/warehouses?include_consignment=true');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch { /* silent */ }
  }, true);

  return (
    <Container size="full">
      <PageHeader
        icon={<ProductIcon />}
        title="สินค้าคงคลัง"
        subtitle="จัดการสต็อกสินค้าและดูประวัติการเคลื่อนไหว"
        actions={
          <>
            <Button
              variant="primary"
              icon={<StockReceiveIcon className="w-4 h-4" />}
              onClick={() => router.push('/inventory/receive')}
            >
              รับเข้า
            </Button>
            <Button
              variant="secondary"
              icon={<StockIssueIcon className="w-4 h-4" />}
              onClick={() => router.push('/inventory/issue')}
            >
              เบิกออก
            </Button>
            <Button
              variant="secondary"
              icon={<StockTransferIcon className="w-4 h-4" />}
              onClick={() => router.push('/inventory/transfer')}
            >
              โอนย้าย
            </Button>
            {/* คืนของให้ supplier — ของออกจากคลังเหมือนเบิกออก แต่มีคู่สัญญาและผลต่อยอดเงิน */}
            {features.supplier && (
              <Button
                variant="secondary"
                icon={<ReverseIcon className="w-4 h-4" />}
                onClick={() => router.push('/inventory/supplier-return')}
              >
                คืนของ Supplier
              </Button>
            )}
            <Button
              variant="secondary"
              icon={<ExcelIcon className="w-4 h-4" />}
              onClick={() => router.push('/inventory/bulk-stock-update')}
            >
              อัปเดตแบบชุด
            </Button>
          </>
        }
      />

      <Tabs
        className="mb-0"
        activeKey={activeTab}
        onSelect={k => setActiveTab(k as TabKey)}
        tabs={[
          { key: 'stock', label: 'สินค้าคงคลัง', icon: <WarehouseIcon className="w-4 h-4" /> },
          { key: 'movements', label: 'ความเคลื่อนไหว', icon: <Activity className="w-4 h-4" /> },
        ]}
      />

      {activeTab === 'stock' && (
        <StockTab warehouses={warehouses} onViewHistory={viewHistory} />
      )}
      {activeTab === 'movements' && (
        <MovementsTab warehouses={warehouses} />
      )}
    </Container>
  );
}

export default function InventoryPage() {
  // ด่านสิทธิ์ระดับหน้า — เมนูใน Sidebar ซ่อนให้แล้ว แต่ URL ตรงยังเข้าได้
  const { allowed, loading: permLoading } = useAuthGuard('inventory.view');

  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไป /dashboard

  // ทั้งหน้าอ่าน useSearchParams → ต้องอยู่ใต้ Suspense (กฎ CSR bailout ของ Next 16)
  return (
    <Layout>
      <Suspense fallback={<Container size="full"><LoadingCard /></Container>}>
        <InventoryPageContent />
      </Suspense>
    </Layout>
  );
}
