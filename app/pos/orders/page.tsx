// Path: app/pos/orders/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import Layout from '@/components/layout/Layout';
import { formatPrice } from '@/lib/utils/format';
import { Loader2, Printer, Ban, Eye, Calendar, Receipt as ReceiptIcon } from 'lucide-react';
import ReceiptComponent from '../components/Receipt';

interface PosOrder {
  id: string;
  order_number: string;
  receipt_number: string;
  customer_id: string | null;
  total_amount: number;
  payment_method: string;
  order_status: string;
  created_at: string;
  customer: { name: string; customer_code: string } | null;
  items: { product_name: string; variation_label: string; quantity: number; unit_price: number; total: number }[];
}

export default function PosOrdersPage() {
  const { loading: authLoading, userProfile } = useAuth();
  const [orders, setOrders] = useState<PosOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptData, setReceiptData] = useState<any>(null);
  const [voidingId, setVoidingId] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/pos/orders?date=${selectedDate}`);
      const data = await res.json();
      setOrders(data.orders || []);
    } catch {
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useFetchOnce(() => {
    fetchOrders();
  }, !authLoading && !!userProfile);

  // Refetch when date changes
  const handleDateChange = (date: string) => {
    setSelectedDate(date);
    setTimeout(() => {
      (async () => {
        setLoading(true);
        try {
          const res = await apiFetch(`/api/pos/orders?date=${date}`);
          const data = await res.json();
          setOrders(data.orders || []);
        } catch {
          setOrders([]);
        } finally {
          setLoading(false);
        }
      })();
    }, 0);
  };

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
    <Layout title="รายการขาย POS">
      <div className="space-y-4">
        {/* Header with date picker */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
              />
            </div>
          </div>

          {/* Summary */}
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
        </div>

        {/* Orders table */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-[#F4511E]" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <ReceiptIcon className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">ไม่พบรายการขาย POS ในวันที่เลือก</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-slate-700/50 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">เลขที่</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">เวลา</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ลูกค้า</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">รายการ</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase text-right">ยอดรวม</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">สถานะ</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {orders.map(order => (
                    <tr key={order.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/30 ${order.order_status === 'cancelled' ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{order.receipt_number}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{order.order_number}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {new Date(order.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {order.customer?.name || 'ลูกค้าทั่วไป'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {order.items?.length || 0} รายการ
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-medium text-gray-900 dark:text-white">
                        ฿{formatPrice(order.total_amount)}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(order.order_status)}
                      </td>
                      <td className="px-4 py-3">
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
