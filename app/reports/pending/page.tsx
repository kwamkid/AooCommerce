// Path: app/reports/pending/page.tsx
'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import Layout from '@/components/layout/Layout';

import {
  FileText,
  Calendar,
  Users,
  Loader2,
  ChevronDown,
  ChevronRight,
  Phone,
  User,
  ShoppingCart,
  AlertCircle,
  Clock,
  DollarSign
} from 'lucide-react';

// Interfaces
interface OrderDetail {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  totalAmount: number;
  orderStatus: string;
  paymentMethod: string | null;
  paymentTerms: string | null;
}

interface GroupedDataByCustomer {
  customerId: string;
  customerCode: string;
  customerName: string;
  contactPerson: string;
  phone: string;
  orderCount: number;
  totalPending: number;
  orders: OrderDetail[];
}

interface GroupedDataByOrder {
  id: string;
  orderNumber: string;
  orderDate: string;
  deliveryDate: string | null;
  totalAmount: number;
  orderStatus: string;
  paymentMethod: string | null;
  paymentTerms: string | null;
  customerId: string;
  customerCode: string;
  customerName: string;
  contactPerson: string;
  phone: string;
}

interface Summary {
  totalOrders: number;
  totalPending: number;
  oldestPending: string | null;
  newestPending: string | null;
}

export default function PendingReportPage() {
  const router = useRouter();
  const { userProfile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupBy, setGroupBy] = useState<'customer' | 'order'>('customer');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [groupedData, setGroupedData] = useState<any[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Fetch report data
  const fetchReport = async () => {
    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams({ group_by: groupBy });

      const response = await apiFetch(`/api/reports/pending?${params}`);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', response.status, errorData);
        throw new Error(errorData.error || 'Failed to fetch report');
      }

      const data = await response.json();
      setSummary(data.summary);
      setGroupedData(data.groupedData);
    } catch (err) {
      console.error('Error fetching report:', err);
      setError('ไม่สามารถโหลดรายงานได้');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchReport();
    }
  }, [authLoading, userProfile, groupBy]);

  // Toggle row expansion
  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('th-TH', {
      style: 'currency',
      currency: 'THB',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Get days since delivery
  const getDaysSinceDelivery = (deliveryDate: string | null) => {
    if (!deliveryDate) return null;
    const delivery = new Date(deliveryDate);
    const today = new Date();
    const diffTime = today.getTime() - delivery.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  // Get order status badge
  const getOrderStatusBadge = (status: string) => {
    const statusConfig: { [key: string]: { label: string; color: string } } = {
      new: { label: 'ใหม่', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
      shipping: { label: 'กำลังส่ง', color: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
      completed: { label: 'ส่งแล้ว', color: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' }
    };
    const config = statusConfig[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  // Get aging badge
  const getAgingBadge = (days: number | null) => {
    if (days === null) return null;
    if (days < 0) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
          ยังไม่ถึงกำหนด
        </span>
      );
    }
    if (days <= 7) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          {days} วัน
        </span>
      );
    }
    if (days <= 30) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
          {days} วัน
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
        {days} วัน
      </span>
    );
  };

  if (authLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!userProfile) return null;

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3 mb-4 sm:mb-0">
          <FileText className="w-8 h-8 text-[#F4511E]" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">รายงานยอดค้างชำระ</h1>
            <p className="text-gray-600 dark:text-slate-400">ติดตามยอดค้างชำระจากลูกค้า</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">จำนวนออเดอร์ค้าง</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{summary.totalOrders} รายการ</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">ยอดค้างชำระรวม</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{formatCurrency(summary.totalPending)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">ออเดอร์เก่าสุด</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {summary.oldestPending ? formatDate(summary.oldestPending) : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">ออเดอร์ใหม่สุด</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {summary.newestPending ? formatDate(summary.newestPending) : '-'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group By Toggle */}
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4 mb-6">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">จัดกลุ่มตาม:</span>
          <div className="flex gap-2">
            <button
              onClick={() => setGroupBy('customer')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                groupBy === 'customer'
                  ? 'bg-[#F4511E] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <Users className="w-4 h-4 inline mr-1" />
              ลูกค้า
            </button>
            <button
              onClick={() => setGroupBy('order')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                groupBy === 'order'
                  ? 'bg-[#F4511E] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              <ShoppingCart className="w-4 h-4 inline mr-1" />
              ออเดอร์
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-12">
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-[#F4511E] animate-spin mb-4" />
            <p className="text-gray-500 dark:text-slate-400">กำลังโหลดข้อมูล...</p>
          </div>
        </div>
      ) : groupedData.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-12">
          <div className="flex flex-col items-center justify-center">
            <FileText className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg">ไม่มียอดค้างชำระ</p>
            <p className="text-gray-400 text-sm">ลูกค้าทุกรายชำระเงินครบถ้วนแล้ว</p>
          </div>
        </div>
      ) : (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="data-table-fixed">
              <thead className="data-thead">
                <tr>
                  {groupBy === 'customer' ? (
                    <>
                      <th className="data-th">ลูกค้า</th>
                      <th className="data-th text-center">ติดต่อ</th>
                      <th className="data-th text-center">จำนวนออเดอร์</th>
                      <th className="data-th text-right">ยอดค้างรวม</th>
                      <th className="data-th text-center w-10"></th>
                    </>
                  ) : (
                    <>
                      <th className="data-th">ออเดอร์</th>
                      <th className="data-th">ลูกค้า</th>
                      <th className="data-th text-center">วันที่ส่ง</th>
                      <th className="data-th text-center">ค้างมา</th>
                      <th className="data-th text-center">สถานะ</th>
                      <th className="data-th text-right">ยอดค้าง</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {groupBy === 'customer' && groupedData.map((item: GroupedDataByCustomer, index: number) => (
                  <Fragment key={item.customerId || `customer-${index}`}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => toggleRow(item.customerId || `customer-${index}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{item.customerName}</div>
                          <div className="text-sm text-gray-500 dark:text-slate-400">{item.customerCode}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="text-sm">
                          <div className="flex items-center justify-center gap-1 text-gray-600 dark:text-slate-400">
                            <User className="w-3 h-3" />
                            {item.contactPerson}
                          </div>
                          {item.phone !== '-' && (
                            <div className="flex items-center justify-center gap-1 text-gray-500 dark:text-slate-400">
                              <Phone className="w-3 h-3" />
                              {item.phone}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                          {item.orderCount} รายการ
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(item.totalPending)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {expandedRows.has(item.customerId || `customer-${index}`) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(item.customerId || `customer-${index}`) && item.orders.map((order) => (
                      <tr
                        key={order.id}
                        className="bg-gray-50 dark:bg-slate-900/50 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer"
                        onClick={() => router.push(`/orders/${order.id}`)}
                      >
                        <td className="px-6 py-3 pl-12">
                          <div>
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{order.orderNumber}</span>
                            <div className="text-xs text-gray-500 dark:text-slate-400">สั่ง: {formatDate(order.orderDate)}</div>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-center">
                          <div className="text-sm text-gray-600 dark:text-slate-400">
                            ส่ง: {formatDate(order.deliveryDate)}
                          </div>
                        </td>
                        <td className="px-6 py-3 text-center">
                          {getAgingBadge(getDaysSinceDelivery(order.deliveryDate))}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{formatCurrency(order.totalAmount)}</span>
                        </td>
                        <td className="px-6 py-3 text-center">
                          {getOrderStatusBadge(order.orderStatus)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}

                {groupBy === 'order' && groupedData.map((item: GroupedDataByOrder) => {
                  const daysSince = getDaysSinceDelivery(item.deliveryDate);
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => router.push(`/orders/${item.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{item.orderNumber}</div>
                          <div className="text-sm text-gray-500 dark:text-slate-400">สั่ง: {formatDate(item.orderDate)}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{item.customerName}</div>
                          <div className="text-sm text-gray-500 dark:text-slate-400">{item.customerCode}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-gray-900 dark:text-white">{formatDate(item.deliveryDate)}</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getAgingBadge(daysSince)}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {getOrderStatusBadge(item.orderStatus)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="font-bold text-red-600 dark:text-red-400">{formatCurrency(item.totalAmount)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Total Footer */}
              <tfoot className="data-tfoot">
                <tr>
                  <td colSpan={groupBy === 'customer' ? 3 : 5} className="px-6 py-4 font-bold text-gray-900 dark:text-white">
                    รวมทั้งหมด ({summary?.totalOrders || 0} รายการ)
                  </td>
                  <td className={`px-6 py-4 font-bold text-red-600 dark:text-red-400 ${groupBy === 'customer' ? 'text-right' : 'text-right'}`}>
                    {formatCurrency(summary?.totalPending || 0)}
                  </td>
                  {groupBy === 'customer' && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </Layout>
  );
}
