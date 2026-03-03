// Path: app/pos/orders/page.tsx
'use client';

import { useState, useCallback, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import Layout from '@/components/layout/Layout';
import { formatPrice } from '@/lib/utils/format';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import { Loader2, Search, Receipt as ReceiptIcon, Store } from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import Pagination from '@/app/components/Pagination';
import PosOrderCard, { PosOrder, PAYMENT_LABELS } from '../components/PosOrderCard';
import ReceiptComponent from '../components/Receipt';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_active?: boolean;
}

interface Summary {
  total_sales: number;
  total_discount: number;
  completed_count: number;
  void_count: number;
  payment_breakdown: Record<string, { count: number; amount: number }>;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function PosOrdersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { loading: authLoading, userProfile } = useAuth();
  const { confirmDialog, confirm } = useConfirmDialog();

  // URL-based state
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const recordsPerPage = parseInt(searchParams.get('limit') || '20', 10);
  const searchTerm = searchParams.get('q') || '';
  const warehouseFilter = searchParams.get('warehouse') || '';
  const dateFrom = searchParams.get('from') || todayStr();
  const dateTo = searchParams.get('to') || todayStr();

  // Local state
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalRecords, setTotalRecords] = useState(0);
  const [summary, setSummary] = useState<Summary>({ total_sales: 0, total_discount: 0, completed_count: 0, void_count: 0, payment_breakdown: {} });
  const [receiptData, setReceiptData] = useState<any>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<string[] | null>(null);
  const [searchInput, setSearchInput] = useState(searchTerm);
  const [warehousesFetched, setWarehousesFetched] = useState(false);

  // Helper: update URL params
  const setParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    // Reset to page 1 when non-page filters change
    if (!('page' in updates)) {
      params.delete('page');
    }
    // Remove defaults
    if (params.get('page') === '1') params.delete('page');
    if (params.get('limit') === '20') params.delete('limit');
    const today = todayStr();
    if (params.get('from') === today) params.delete('from');
    if (params.get('to') === today) params.delete('to');

    const qs = params.toString();
    router.replace(`/pos/orders${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  // Fetch orders
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(recordsPerPage));
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);
      if (searchTerm) params.set('search', searchTerm);
      if (warehouseFilter) params.set('warehouse_id', warehouseFilter);

      const res = await apiFetch(`/api/pos/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
      setTotalRecords(data.total || 0);
      if (data.summary) setSummary(data.summary);
      if (data.allowed_warehouse_ids !== undefined) {
        setAllowedWarehouseIds(data.allowed_warehouse_ids);
      }
    } catch {
      setOrders([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  }, [currentPage, recordsPerPage, dateFrom, dateTo, searchTerm, warehouseFilter]);

  // Fetch warehouses once
  useEffect(() => {
    if (authLoading || !userProfile || warehousesFetched) return;
    setWarehousesFetched(true);
    (async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        if (res.ok) {
          const data = await res.json();
          setWarehouses((data.warehouses || []).filter((w: WarehouseItem) => w.is_active !== false));
        }
      } catch { /* silent */ }
    })();
  }, [authLoading, userProfile, warehousesFetched]);

  // Fetch orders when params change
  useEffect(() => {
    if (authLoading || !userProfile) return;
    fetchOrders();
  }, [authLoading, userProfile, fetchOrders]);

  // Sync search input with URL
  useEffect(() => {
    setSearchInput(searchTerm);
  }, [searchTerm]);

  // Handlers
  const handleSearch = () => {
    if (searchInput !== searchTerm) {
      setParams({ q: searchInput || null });
    }
  };

  const handleDateChange = (val: DateValueType) => {
    const from = val?.startDate instanceof Date ? val.startDate.toISOString().slice(0, 10) : val?.startDate ? String(val.startDate).slice(0, 10) : null;
    const to = val?.endDate instanceof Date ? val.endDate.toISOString().slice(0, 10) : val?.endDate ? String(val.endDate).slice(0, 10) : null;
    setParams({ from, to });
  };

  const handleWarehouseChange = (wid: string) => {
    setParams({ warehouse: wid || null });
  };

  const handleVoid = async (orderId: string) => {
    const ok = await confirm({ title: 'ต้องการ Void รายการนี้?', variant: 'danger' });
    if (!ok) return;
    setVoidingId(orderId);
    try {
      const res = await apiFetch('/api/pos/orders/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, reason: 'Void จากหน้ารายการ POS' }),
      });
      if (res.ok) fetchOrders();
    } catch {}
    setVoidingId(null);
  };

  const handleViewReceipt = async (orderId: string) => {
    try {
      const res = await apiFetch(`/api/pos/receipt?order_id=${orderId}`);
      const data = await res.json();
      if (data.receipt) setReceiptData(data.receipt);
    } catch {}
  };

  // Filter warehouses by allowed permissions
  const availableWarehouses = allowedWarehouseIds
    ? warehouses.filter(w => allowedWarehouseIds.includes(w.id))
    : warehouses;

  // Pagination
  const totalPages = Math.ceil(totalRecords / recordsPerPage);
  const startIdx = (currentPage - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + recordsPerPage, totalRecords);

  // Date range value for picker
  const dateRangeValue: DateValueType = {
    startDate: dateFrom ? new Date(dateFrom + 'T00:00:00') : new Date(),
    endDate: dateTo ? new Date(dateTo + 'T00:00:00') : new Date(),
  };

  // Payment breakdown sorted by amount
  const paymentEntries = Object.entries(summary.payment_breakdown || {}).sort((a, b) => b[1].amount - a[1].amount);

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">รายการขาย POS</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">ประวัติการขายจากระบบ POS</p>
        </div>

        {/* Filter card */}
        <div className="data-filter-card">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                onBlur={handleSearch}
                placeholder="ค้นหาเลขที่บิล, ชื่อลูกค้า, เบอร์โทร..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2">
              {availableWarehouses.length > 0 && (
                <div className="w-44 flex-shrink-0">
                  <FormSelect
                    value={warehouseFilter}
                    onChange={handleWarehouseChange}
                    options={availableWarehouses.map(wh => ({ id: wh.id, label: wh.name }))}
                    clearLabel="ทุกสาขา"
                    icon={<Store className="w-4 h-4" />}
                    searchThreshold={99}
                  />
                </div>
              )}
              <div className="w-52 flex-shrink-0">
                <DateRangePicker
                  value={dateRangeValue}
                  onChange={handleDateChange}
                  placeholder="เลือกวันที่"
                  showShortcuts
                  showFooter={false}
                  popupAlign="right"
                  displayFormat="short"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        {!loading && summary.completed_count > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {/* Total sales */}
            <div className="bg-green-50 dark:bg-green-900/20 px-4 py-3 rounded-xl">
              <p className="text-sm text-green-600 dark:text-green-400 mb-0.5">ยอดขาย</p>
              <p className="text-lg font-bold text-green-700 dark:text-green-300">฿{formatPrice(summary.total_sales)}</p>
              <p className="text-xs text-green-600/70 dark:text-green-400/70 mt-0.5">
                {summary.completed_count} บิล
                {summary.void_count > 0 && <span className="text-red-500 dark:text-red-400"> · {summary.void_count} void</span>}
              </p>
            </div>
            {/* Discount total */}
            {summary.total_discount > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 px-4 py-3 rounded-xl">
                <p className="text-sm text-red-600 dark:text-red-400 mb-0.5">ส่วนลดรวม</p>
                <p className="text-lg font-bold text-red-700 dark:text-red-300">฿{formatPrice(summary.total_discount)}</p>
              </div>
            )}
            {/* Payment breakdown */}
            {paymentEntries.map(([method, data]) => (
              <div key={method} className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 rounded-xl">
                <p className="text-sm text-blue-600 dark:text-blue-400 mb-0.5">{PAYMENT_LABELS[method] || method}</p>
                <p className="text-lg font-bold text-blue-700 dark:text-blue-300">฿{formatPrice(data.amount)}</p>
                <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-0.5">{data.count} บิล</p>
              </div>
            ))}
          </div>
        )}

        {/* Orders list — full width, single column */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-[#F4511E]" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <ReceiptIcon className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm">ไม่พบรายการขาย POS ในช่วงวันที่เลือก</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(order => (
              <PosOrderCard
                key={order.id}
                order={order}
                onViewReceipt={handleViewReceipt}
                onVoid={handleVoid}
                voidingId={voidingId}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loading && totalRecords > 0 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            startIdx={startIdx}
            endIdx={endIdx}
            recordsPerPage={recordsPerPage}
            setRecordsPerPage={(v) => setParams({ limit: String(v), page: '1' })}
            setPage={(p) => setParams({ page: String(p) })}
          />
        )}
      </div>

      {confirmDialog}

      {/* Receipt modal */}
      {receiptData && (
        <ReceiptComponent
          data={receiptData}
          onClose={() => setReceiptData(null)}
          onNewSale={() => setReceiptData(null)}
        />
      )}
    </Layout>
  );
}

export default function PosOrdersPage() {
  return (
    <Suspense fallback={
      <Layout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[#F4511E]" />
        </div>
      </Layout>
    }>
      <PosOrdersContent />
    </Suspense>
  );
}
