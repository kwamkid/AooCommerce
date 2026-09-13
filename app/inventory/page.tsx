'use client';

import { useCallback, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuthGuard } from '@/lib/useAuthGuard';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import { LoadingCard } from '@/components/ui/StateCard';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import {
  Package2, Warehouse, ClipboardList, Activity,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, FileSpreadsheet,
} from 'lucide-react';
import { WarehouseItem, TabKey } from './components/types';
import StockTab from './components/StockTab';
import HistoryTab from './components/HistoryTab';
import MonitorTab from './components/MonitorTab';
import Tabs from '@/components/ui/Tabs';

/** ตัวกรองของแท็บสต็อก — ต้องถูกทิ้งเมื่อย้ายไปแท็บอื่น ไม่งั้นค้างใน URL แล้วกลับมาเจอผลกรองเดิม */
const STOCK_PARAMS = ['q', 'wh', 'dealer', 'cat', 'brand', 'sup', 'status', 'sort', 'dir', 'page', 'limit'];

function InventoryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams.get('tab');
  const activeTab: TabKey = tabParam === 'history' || tabParam === 'monitor' ? tabParam : 'stock';

  // ตัวกรองประวัติ (มาจากปุ่ม "ประวัติการเคลื่อนไหว" ในแท็บสต็อก) อยู่ใน URL ด้วย
  const historyVariationId = searchParams.get('variation') || '';
  const historyProductLabel = searchParams.get('label') || '';

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
      if (tab !== 'history') { p.delete('variation'); p.delete('label'); }
      if (tab !== 'stock') for (const key of STOCK_PARAMS) p.delete(key);
    });
  }, [replaceParams]);

  const viewHistory = useCallback((variationId: string, label: string) => {
    replaceParams(p => {
      for (const key of STOCK_PARAMS) p.delete(key);
      p.set('tab', 'history');
      p.set('variation', variationId);
      if (label) p.set('label', label); else p.delete('label');
    });
  }, [replaceParams]);

  const clearHistoryFilter = useCallback(() => {
    replaceParams(p => { p.delete('variation'); p.delete('label'); });
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
        icon={<Package2 />}
        title="สินค้าคงคลัง"
        subtitle="จัดการสต็อกสินค้าและดูประวัติการเคลื่อนไหว"
        actions={
          <>
            <Button
              variant="primary"
              size="sm"
              icon={<ArrowDownToLine className="w-4 h-4" />}
              onClick={() => router.push('/inventory/receive')}
            >
              <span className="hidden md:inline">รับเข้า</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowUpFromLine className="w-4 h-4" />}
              onClick={() => router.push('/inventory/issue')}
            >
              <span className="hidden md:inline">เบิกออก</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ArrowLeftRight className="w-4 h-4" />}
              onClick={() => router.push('/inventory/transfer')}
            >
              <span className="hidden md:inline">โอนย้าย</span>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<FileSpreadsheet className="w-4 h-4" />}
              onClick={() => router.push('/inventory/bulk-stock-update')}
            >
              <span className="hidden md:inline">Bulk</span>
            </Button>
          </>
        }
      />

      <Tabs
        className="mb-0"
        activeKey={activeTab}
        onSelect={k => setActiveTab(k as TabKey)}
        tabs={[
          { key: 'stock', label: 'สินค้าคงคลัง', icon: <Warehouse className="w-4 h-4" /> },
          { key: 'history', label: 'ประวัติ', icon: <ClipboardList className="w-4 h-4" /> },
          { key: 'monitor', label: 'Monitor', icon: <Activity className="w-4 h-4" /> },
        ]}
      />

      {activeTab === 'stock' && (
        <StockTab warehouses={warehouses} onViewHistory={viewHistory} />
      )}
      {activeTab === 'history' && (
        <HistoryTab
          warehouses={warehouses}
          filterVariationId={historyVariationId}
          filterProductLabel={historyProductLabel}
          onFilterCleared={clearHistoryFilter}
        />
      )}
      {activeTab === 'monitor' && (
        <MonitorTab warehouses={warehouses} />
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
