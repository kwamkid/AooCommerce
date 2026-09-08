'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
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

export default function InventoryPage() {
  // ด่านสิทธิ์ระดับหน้า — เมนูใน Sidebar ซ่อนให้แล้ว แต่ URL ตรงยังเข้าได้
  const { allowed, loading: permLoading } = useAuthGuard('inventory.view');
  const router = useRouter();
  const [activeTab, setActiveTabState] = useState<TabKey>('stock');

  // Read hash on mount (client-only to avoid hydration mismatch)
  useEffect(() => {
    const hash = window.location.hash.replace('#', '') as TabKey;
    if (hash === 'history' || hash === 'monitor') setActiveTabState(hash);
  }, []);

  const setActiveTab = (tab: TabKey) => {
    setActiveTabState(tab);
    window.location.hash = tab === 'stock' ? '' : tab;
  };
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [historyVariationId, setHistoryVariationId] = useState('');
  const [historyProductLabel, setHistoryProductLabel] = useState('');

  useFetchOnce(async () => {
    try {
      const res = await apiFetch('/api/warehouses?include_consignment=true');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch { /* silent */ }
  }, true);

  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไป /dashboard

  return (
    <Layout>
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
                title="รับเข้า"
              >
                <span className="hidden md:inline">รับเข้า</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowUpFromLine className="w-4 h-4" />}
                onClick={() => router.push('/inventory/issue')}
                title="เบิกออก"
              >
                <span className="hidden md:inline">เบิกออก</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowLeftRight className="w-4 h-4" />}
                onClick={() => router.push('/inventory/transfer')}
                title="โอนย้าย"
              >
                <span className="hidden md:inline">โอนย้าย</span>
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileSpreadsheet className="w-4 h-4" />}
                onClick={() => router.push('/inventory/bulk-stock-update')}
                title="อัพเดท Stock แบบ Bulk"
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

        {/* Tab Content */}
        {activeTab === 'stock' && (
          <Suspense fallback={<LoadingCard />}>
            <StockTab
              warehouses={warehouses}
              onViewHistory={(variationId, productLabel) => {
                setHistoryVariationId(variationId);
                setHistoryProductLabel(productLabel);
                setActiveTab('history');
              }}
            />
          </Suspense>
        )}
        {activeTab === 'history' && (
          <HistoryTab
            warehouses={warehouses}
            filterVariationId={historyVariationId}
            filterProductLabel={historyProductLabel}
            onFilterCleared={() => { setHistoryVariationId(''); setHistoryProductLabel(''); }}
          />
        )}
        {activeTab === 'monitor' && (
          <MonitorTab warehouses={warehouses} />
        )}
      </Container>
    </Layout>
  );
}
