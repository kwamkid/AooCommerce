'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { ShoppingBag, Search, Plus, Package, Loader2, CheckCircle2, Clock, Truck, CreditCard } from 'lucide-react';
import Pagination from '@/app/components/Pagination';

interface WholesaleOrder {
  id: string;
  order_number: string;
  order_status: string;
  payment_status: string;
  flow_type: string;
  total_amount: number;
  created_at: string;
  customer: { id: string; name: string; phone: string | null } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}
function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, { label: string; cls: string; icon?: React.ReactNode }> = {
  new: { label: 'ใหม่', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  processing: { label: 'กำลังจัดเตรียม', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: <Clock className="w-3 h-3" /> },
  shipping: { label: 'จัดส่งแล้ว', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', icon: <Truck className="w-3 h-3" /> },
  completed: { label: 'เสร็จสิ้น', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelled: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const PAYMENT_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'รอชำระ', cls: 'text-gray-500' },
  paid: { label: 'ชำระแล้ว', cls: 'text-green-600' },
};

export default function DealerOrdersPage() {
  const [orders, setOrders] = useState<WholesaleOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(recordsPerPage),
        flow_type: 'w_cash,w_credit',
        customer_type: 'wholesale_dealer',
      });
      if (search) params.set('search', search);
      const res = await apiFetch(`/api/orders?${params}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
        setTotal(data.total || 0);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + orders.length, total);

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <ShoppingBag className="w-8 h-8 text-[#F4511E]" />
              คำสั่งซื้อตัวแทนขายขาด
            </h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1 text-sm">ตัวแทนขายขาด (เงินสด / เครดิต)</p>
          </div>
          <Link
            href="/dealer-orders/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#E64A19] transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> สร้างคำสั่งซื้อ
          </Link>
        </div>

        <div className="data-filter-card">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="ค้นหาเลขที่, ชื่อลูกค้า..."
              className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" /></div>
        ) : orders.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400">ยังไม่มีคำสั่งซื้อ</p>
          </div>
        ) : (
          <div className="data-table-wrap">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่</th>
                    <th className="data-th">ลูกค้า</th>
                    <th className="data-th text-right">ยอด</th>
                    <th className="data-th">สถานะ</th>
                    <th className="data-th">ชำระ</th>
                    <th className="data-th">วันที่</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {orders.map(order => {
                    const sBadge = STATUS_BADGE[order.order_status] || STATUS_BADGE.new;
                    const pBadge = PAYMENT_BADGE[order.payment_status] || PAYMENT_BADGE.pending;
                    return (
                      <tr key={order.id} className="data-tr cursor-pointer" onClick={() => window.location.href = `/orders/${order.id}`}>
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-bold text-[#F4511E]">{order.order_number}</span>
                          {order.flow_type === 'w_credit' && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">เครดิต</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-gray-900 dark:text-white font-medium">{order.customer?.name || '-'}</p>
                          {order.customer?.phone && <p className="text-xs text-gray-400">{order.customer.phone}</p>}
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">฿{formatMoney(order.total_amount)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sBadge.cls}`}>
                            {sBadge.icon}{sBadge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`text-xs font-medium ${pBadge.cls}`}>
                            {order.payment_status === 'paid' && <CreditCard className="w-3 h-3 inline mr-1" />}
                            {pBadge.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">{formatDate(order.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page} totalPages={totalPages} onPageChange={setPage}
              startIdx={startIdx + 1} endIdx={endIdx} total={total}
              recordsPerPage={recordsPerPage} onRecordsPerPageChange={(v) => { setRecordsPerPage(v); setPage(1); }}
              loadTime={loadTime}
            />
          </div>
        )}
      </div>
    </Layout>
  );
}
