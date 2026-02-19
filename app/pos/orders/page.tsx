// Path: app/pos/orders/page.tsx
'use client';

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import Layout from '@/components/layout/Layout';
import { formatPrice } from '@/lib/utils/format';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import { Loader2, Printer, Ban, Eye, Search, Receipt as ReceiptIcon, Store } from 'lucide-react';
import ReceiptComponent from '../components/Receipt';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
}

interface PosOrder {
  id: string;
  order_number: string;
  receipt_number: string;
  customer_id: string | null;
  total_amount: number;
  payment_method: string;
  order_status: string;
  created_at: string;
  customer: { name: string; customer_code: string; phone: string | null } | null;
  items: { product_name: string; variation_label: string; quantity: number; unit_price: number; total: number }[];
}

function toDateStr(d: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

export default function PosOrdersPage() {
  const { loading: authLoading, userProfile } = useAuth();
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateValueType>({ startDate: new Date(), endDate: new Date() });
  const [searchTerm, setSearchTerm] = useState('');
  const [receiptData, setReceiptData] = useState<any>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [allowedWarehouseIds, setAllowedWarehouseIds] = useState<string[] | null>(null);
  const selectedWarehouseRef = useRef('');

  const fetchWithParams = useCallback(async (from: string | null, to: string | null, search?: string, warehouseId?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (from) params.set('date_from', from);
      if (to) params.set('date_to', to);
      if (search) params.set('search', search);
      const wid = warehouseId ?? selectedWarehouseRef.current;
      if (wid) params.set('warehouse_id', wid);
      const res = await apiFetch(`/api/pos/orders?${params.toString()}`);
      const data = await res.json();
      setOrders(data.orders || []);
      if (data.allowed_warehouse_ids !== undefined) {
        setAllowedWarehouseIds(data.allowed_warehouse_ids);
      }
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOrders = useCallback(async () => {
    await fetchWithParams(toDateStr(dateRange?.startDate), toDateStr(dateRange?.endDate), searchTerm || undefined);
  }, [dateRange, searchTerm, fetchWithParams]);

  useFetchOnce(() => {
    fetchOrders();
    // Fetch warehouses for filter
    (async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        if (res.ok) {
          const data = await res.json();
          setWarehouses((data.warehouses || []).filter((w: WarehouseItem & { is_active?: boolean }) => w.is_active !== false));
        }
      } catch { /* silent */ }
    })();
  }, !authLoading && !!userProfile);

  // Refetch when date range changes
  const handleDateChange = (val: DateValueType) => {
    setDateRange(val);
    fetchWithParams(toDateStr(val?.startDate), toDateStr(val?.endDate), searchTerm || undefined);
  };

  // Search handler
  const handleSearch = () => {
    fetchWithParams(toDateStr(dateRange?.startDate), toDateStr(dateRange?.endDate), searchTerm || undefined);
  };

  // Warehouse filter handler
  const handleWarehouseChange = (warehouseId: string) => {
    setSelectedWarehouse(warehouseId);
    selectedWarehouseRef.current = warehouseId;
    fetchWithParams(toDateStr(dateRange?.startDate), toDateStr(dateRange?.endDate), searchTerm || undefined, warehouseId);
  };

  // Filter warehouses by allowed permissions
  const availableWarehouses = allowedWarehouseIds
    ? warehouses.filter(w => allowedWarehouseIds.includes(w.id))
    : warehouses;

  const handleVoid = async (orderId: string) => {
    if (!confirm('ต้องการ Void รายการนี้?')) return;
    setVoidingId(orderId);
    try {
      const res = await apiFetch('/api/pos/orders/void', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, reason: 'Void จากหน้ารายการ POS' }),
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch {}
    setVoidingId(null);
  };

  const handleViewReceipt = async (orderId: string) => {
    try {
      const res = await apiFetch(`/api/pos/receipt?order_id=${orderId}`);
      const data = await res.json();
      if (data.receipt) {
        setReceiptData(data.receipt);
      }
    } catch {}
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">สำเร็จ</span>;
      case 'cancelled':
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Void</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">{status}</span>;
    }
  };

  const totalSales = orders
    .filter(o => o.order_status === 'completed')
    .reduce((s, o) => s + Number(o.total_amount), 0);
  const totalVoids = orders.filter(o => o.order_status === 'cancelled').length;

  return (
    <Layout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">รายการขาย POS</h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">ประวัติการขายจากระบบ POS</p>
          </div>
        </div>

        {/* Filter card */}
        <div className="data-filter-card">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                onBlur={handleSearch}
                placeholder="ค้นหาเลขที่บิล, ชื่อลูกค้า, เบอร์โทร..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>
            {availableWarehouses.length > 0 && (
              <div className="w-44 flex-shrink-0">
                <div className="relative">
                  <Store className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <select
                    value={selectedWarehouse}
                    onChange={(e) => handleWarehouseChange(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E] focus:border-transparent bg-white dark:bg-slate-700 appearance-none"
                  >
                    <option value="">ทุกสาขา</option>
                    {availableWarehouses.map(wh => (
                      <option key={wh.id} value={wh.id}>
                        {wh.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <div className="w-64 flex-shrink-0">
              <DateRangePicker
                value={dateRange}
                onChange={handleDateChange}
                placeholder="เลือกวันที่"
              />
            </div>
          </div>
        </div>

        {/* Summary */}
        {!loading && orders.length > 0 && (
          <div className="flex items-center gap-4 text-sm">
            <div className="bg-green-50 dark:bg-green-900/20 px-3 py-1.5 rounded-lg">
              <span className="text-green-700 dark:text-green-400 font-medium">
                ยอดขาย: ฿{formatPrice(totalSales)}
              </span>
            </div>
            <div className="text-gray-500 dark:text-gray-400">
              {orders.filter(o => o.order_status === 'completed').length} บิล
              {totalVoids > 0 && <span className="text-red-500 ml-2">({totalVoids} void)</span>}
            </div>
          </div>
        )}

        {/* Orders table */}
        <div className="data-table-wrap">
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
            <div className="overflow-x-auto">
              <table className="data-table-fixed">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่</th>
                    <th className="data-th">เวลา</th>
                    <th className="data-th">ลูกค้า</th>
                    <th className="data-th">รายการ</th>
                    <th className="data-th text-right">ยอดรวม</th>
                    <th className="data-th">สถานะ</th>
                    <th className="data-th text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {orders.map(order => (
                    <tr key={order.id} className={`data-tr ${order.order_status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="data-td">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{order.receipt_number}</span>
                      </td>
                      <td className="data-td text-sm text-gray-600 dark:text-gray-300">
                        <div>{new Date(order.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
                        <div className="text-xs text-gray-400">{new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</div>
                      </td>
                      <td className="data-td text-sm text-gray-600 dark:text-gray-300">
                        {order.customer?.name || 'ลูกค้าทั่วไป'}
                      </td>
                      <td className="data-td text-sm text-gray-600 dark:text-gray-300">
                        {order.items?.length || 0} รายการ
                      </td>
                      <td className="data-td text-sm text-right font-medium text-gray-900 dark:text-white">
                        ฿{formatPrice(order.total_amount)}
                      </td>
                      <td className="data-td">
                        {getStatusBadge(order.order_status)}
                      </td>
                      <td className="data-td">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleViewReceipt(order.id)}
                            className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors"
                            title="ดูใบเสร็จ"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleViewReceipt(order.id)}
                            className="p-1.5 text-gray-400 hover:text-[#F4511E] transition-colors"
                            title="พิมพ์"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {order.order_status === 'completed' && (
                            <button
                              onClick={() => handleVoid(order.id)}
                              disabled={voidingId === order.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                              title="Void"
                            >
                              {voidingId === order.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Ban className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

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
