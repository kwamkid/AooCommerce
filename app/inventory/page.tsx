'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
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

export default function InventoryPage() {
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

  const tabClass = (tab: TabKey) =>
    `flex items-center gap-2 px-4 py-2.5 text-base font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-primary text-primary'
        : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
    }`;

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

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700">
          <button onClick={() => setActiveTab('stock')} className={tabClass('stock')}>
            <Warehouse className="w-4 h-4" /> สินค้าคงคลัง
          </button>
          <button onClick={() => setActiveTab('history')} className={tabClass('history')}>
            <ClipboardList className="w-4 h-4" /> ประวัติ
          </button>
          <button onClick={() => setActiveTab('monitor')} className={tabClass('monitor')}>
            <Activity className="w-4 h-4" /> Monitor
          </button>
        </div>

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
