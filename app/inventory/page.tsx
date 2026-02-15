'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import {
  Package2, Warehouse, ClipboardList,
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight,
} from 'lucide-react';
import { WarehouseItem, TabKey } from './components/types';
import StockTab from './components/StockTab';
import HistoryTab from './components/HistoryTab';

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('stock');
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [historyVariationId, setHistoryVariationId] = useState('');
  const [historyProductLabel, setHistoryProductLabel] = useState('');

  useEffect(() => {
    const fetchWarehouses = async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        if (res.ok) {
          const data = await res.json();
          setWarehouses(data.warehouses || []);
        }
      } catch { /* silent */ }
    };
    fetchWarehouses();
  }, []);

  const tabClass = (tab: TabKey) =>
    `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
      activeTab === tab
        ? 'border-[#F4511E] text-[#F4511E]'
        : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
    }`;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <Package2 className="w-8 h-8 text-[#F4511E]" />
              สินค้าคงคลัง
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการสต็อกสินค้าและดูประวัติการเคลื่อนไหว</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/inventory/receive" className="flex items-center gap-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg text-sm font-medium transition-colors">
              <ArrowDownToLine className="w-4 h-4" /> รับเข้า
            </Link>
            <Link href="/inventory/issue" className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors">
              <ArrowUpFromLine className="w-4 h-4" /> เบิกออก
            </Link>
            <Link href="/inventory/transfer" className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors">
              <ArrowLeftRight className="w-4 h-4" /> โอนย้าย
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-slate-700">
          <button onClick={() => setActiveTab('stock')} className={tabClass('stock')}>
            <Warehouse className="w-4 h-4" /> สินค้าคงคลัง
          </button>
          <button onClick={() => setActiveTab('history')} className={tabClass('history')}>
            <ClipboardList className="w-4 h-4" /> ประวัติ
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'stock' && (
          <StockTab
            warehouses={warehouses}
            onViewHistory={(variationId, productLabel) => {
              setHistoryVariationId(variationId);
              setHistoryProductLabel(productLabel);
              setActiveTab('history');
            }}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            warehouses={warehouses}
            filterVariationId={historyVariationId}
            filterProductLabel={historyProductLabel}
            onFilterCleared={() => { setHistoryVariationId(''); setHistoryProductLabel(''); }}
          />
        )}
      </div>
    </Layout>
  );
}
