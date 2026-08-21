// Path: app/reports/sales/page.tsx
'use client';

import { useState, useEffect, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import { PageSkeleton } from '@/components/ui/Skeleton';
import Button from '@/components/ui/Button';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import {
  BarChart3,
  Calendar,
  Download,
  TrendingUp,
  Users,
  Package,
  ChevronDown,
  ChevronRight,
  Banknote,
  Clock,
  CheckCircle,
  Loader2
} from 'lucide-react';

// Types
interface SalesSummary {
  totalOrders: number;
  totalRevenue: number;
  totalDiscount: number;
  totalVat: number;
  totalNet: number;
  paidAmount: number;
  pendingAmount: number;
  averageOrderValue: number;
}

interface GroupedDataByDate {
  date: string;
  orderCount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  orders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    paymentStatus: string;
  }>;
}

interface GroupedDataByCustomer {
  customerId: string;
  customerCode: string;
  customerName: string;
  orderCount: number;
  totalAmount: number;
  paidAmount: number;
  pendingAmount: number;
  orders: Array<{
    id: string;
    orderNumber: string;
    orderDate: string;
    totalAmount: number;
    paymentStatus: string;
  }>;
}

interface GroupedDataByProduct {
  productCode: string;
  productName: string;
  variationLabel: string;
  totalQuantity: number;
  totalAmount: number;
  orderCount: number;
}

type GroupBy = 'date' | 'customer' | 'product';

export default function SalesReportPage() {
  const router = useRouter();
  const { session, userProfile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [groupedData, setGroupedData] = useState<any[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>('date');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  // Date range state - default to last 30 days
  const getDefaultDateRange = (): DateValueType => {
    const today = new Date();
    const start = new Date(today);
    start.setMonth(today.getMonth() - 1);
    return {
      startDate: start,
      endDate: today,
    };
  };

  const [dateRange, setDateRange] = useState<DateValueType>(getDefaultDateRange);

  // Helper to convert date to YYYY-MM-DD string
  const toDateString = (val: unknown): string => {
    if (!val) return '';
    if (val instanceof Date) {
      const y = val.getFullYear();
      const m = String(val.getMonth() + 1).padStart(2, '0');
      const d = String(val.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    const s = String(val);
    const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    return '';
  };

  const startDate = toDateString(dateRange?.startDate);
  const endDate = toDateString(dateRange?.endDate);

  // Fetch report data
  const fetchReport = async () => {
    if (!session?.access_token || !startDate || !endDate) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        group_by: groupBy
      });

      console.log('Fetching sales report with params:', params.toString());
      console.log('Session token exists:', !!session.access_token);

      const response = await apiFetch(`/api/reports/sales?${params}`);

      console.log('Response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch report');
      }

      const data = await response.json();
      console.log('Data received:', data);
      setSummary(data.summary);
      setGroupedData(data.groupedData);
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const isAuthReady = !authLoading && !!session?.access_token;
  useEffect(() => {
    if (!isAuthReady || !startDate || !endDate) return;
    fetchReport();
  }, [isAuthReady, startDate, endDate, groupBy]);

  // Auth check
  useEffect(() => {
    if (authLoading) return;
    if (!userProfile) {
      router.push('/login');
    }
  }, [userProfile, authLoading, router]);

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


  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Export to CSV
  const exportToCSV = () => {
    setExporting(true);

    try {
      let csvContent = '\ufeff'; // BOM for Thai characters
      const dateRange = `${formatDate(startDate)} - ${formatDate(endDate)}`;

      if (groupBy === 'date') {
        csvContent += 'รายงานยอดขายตามวัน\n';
        csvContent += `ช่วงเวลา: ${dateRange}\n\n`;
        csvContent += 'วันที่,จำนวน Order,ยอดขายรวม,ชำระแล้ว,รอชำระ\n';

        groupedData.forEach((item: GroupedDataByDate) => {
          csvContent += `${formatDate(item.date)},${item.orderCount},${formatPrice(item.totalAmount)},${formatPrice(item.paidAmount)},${formatPrice(item.pendingAmount)}\n`;
        });
      } else if (groupBy === 'customer') {
        csvContent += 'รายงานยอดขายตามลูกค้า\n';
        csvContent += `ช่วงเวลา: ${dateRange}\n\n`;
        csvContent += 'รหัสลูกค้า,ชื่อลูกค้า,จำนวน Order,ยอดขายรวม,ชำระแล้ว,รอชำระ\n';

        groupedData.forEach((item: GroupedDataByCustomer) => {
          csvContent += `${item.customerCode},"${item.customerName}",${item.orderCount},${formatPrice(item.totalAmount)},${formatPrice(item.paidAmount)},${formatPrice(item.pendingAmount)}\n`;
        });
      } else {
        csvContent += 'รายงานยอดขายตามสินค้า\n';
        csvContent += `ช่วงเวลา: ${dateRange}\n\n`;
        csvContent += 'รหัสสินค้า,ชื่อสินค้า,ขนาด,จำนวนขาย,ยอดขาย\n';

        groupedData.forEach((item: GroupedDataByProduct) => {
          csvContent += `${item.productCode},"${item.productName}",${item.variationLabel},${item.totalQuantity},${formatPrice(item.totalAmount)}\n`;
        });
      }

      // Add summary
      csvContent += '\n\nสรุปรวม\n';
      csvContent += `จำนวน Order ทั้งหมด,${summary?.totalOrders || 0}\n`;
      csvContent += `ยอดขายสุทธิ,${formatPrice(summary?.totalNet || 0)}\n`;
      csvContent += `ชำระแล้ว,${formatPrice(summary?.paidAmount || 0)}\n`;
      csvContent += `รอชำระ,${formatPrice(summary?.pendingAmount || 0)}\n`;

      // Download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `sales-report-${groupBy}-${startDate}-${endDate}.csv`;
      link.click();
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setExporting(false);
    }
  };

  if (authLoading) {
    return (
      <Layout>
        <PageSkeleton variant="dashboard" />
      </Layout>
    );
  }

  if (!userProfile) return null;

  return (
    <Layout>
      {/* Header */}
      <PageHeader
        className="mb-6"
        icon={<BarChart3 />}
        title="รายงานยอดขาย"
        subtitle="วิเคราะห์ยอดขายตามช่วงเวลา"
        actions={
          <Button
            variant="primary"
            loading={exporting}
            disabled={loading}
            icon={<Download className="w-5 h-5" />}
            onClick={exportToCSV}
          >
            Export CSV
          </Button>
        }
      />

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date Range Picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ช่วงเวลา</label>
            <DateRangePicker
              value={dateRange}
              onChange={(val) => setDateRange(val)}
              placeholder="เลือกช่วงวันที่"
            />
          </div>

          {/* Group By */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">แยกตาม</label>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'date', label: 'วัน', icon: Calendar },
                { value: 'customer', label: 'ลูกค้า', icon: Users },
                { value: 'product', label: 'สินค้า', icon: Package }
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => setGroupBy(option.value as GroupBy)}
                  className={`flex items-center gap-1.5 px-4 h-[42px] rounded-lg text-sm font-medium transition-colors ${
                    groupBy === option.value
                      ? 'bg-[#1A1A2E] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <option.icon className="w-4 h-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">ยอดขายสุทธิ</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">{formatPrice(summary.totalNet)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">ชำระแล้ว</p>
                <p className="text-xl font-bold text-green-600">{formatPrice(summary.paidAmount)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">รอชำระ</p>
                <p className="text-xl font-bold text-orange-600">{formatPrice(summary.pendingAmount)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-lg shadow p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Banknote className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-slate-400">Order ({summary.totalOrders})</p>
                <p className="text-xl font-bold text-gray-900 dark:text-white">เฉลี่ย {formatPrice(summary.averageOrderValue)}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="data-table-wrap-shadow">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-primary" />
            <p className="text-gray-500 dark:text-slate-400">กำลังโหลดข้อมูล...</p>
          </div>
        ) : groupedData.length === 0 ? (
          <div className="p-8 text-center">
            <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 dark:text-slate-400">ไม่พบข้อมูลในช่วงเวลานี้</p>
          </div>
        ) : (
          <>
          {/* Desktop Table */}
          <div className="overflow-x-auto hidden md:block">
            <table className="data-table-fixed">
              <thead className="data-thead">
                <tr>
                  {groupBy === 'date' && (
                    <>
                      <th className="data-th">วันที่</th>
                      <th className="data-th text-center">จำนวน Order</th>
                      <th className="data-th text-right">ยอดขาย</th>
                      <th className="data-th text-right">ชำระแล้ว</th>
                      <th className="data-th text-right">รอชำระ</th>
                      <th className="px-6 py-3 w-10"></th>
                    </>
                  )}
                  {groupBy === 'customer' && (
                    <>
                      <th className="data-th">ลูกค้า</th>
                      <th className="data-th text-center">จำนวน Order</th>
                      <th className="data-th text-right">ยอดขาย</th>
                      <th className="data-th text-right">ชำระแล้ว</th>
                      <th className="data-th text-right">รอชำระ</th>
                      <th className="px-6 py-3 w-10"></th>
                    </>
                  )}
                  {groupBy === 'product' && (
                    <>
                      <th className="data-th">สินค้า</th>
                      <th className="data-th text-center">ขนาด</th>
                      <th className="data-th text-center">จำนวนขาย</th>
                      <th className="data-th text-right">ยอดขาย</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {groupBy === 'date' && groupedData.map((item: GroupedDataByDate, index: number) => (
                  <Fragment key={item.date || `date-${index}`}>
                    <tr
                      className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                      onClick={() => toggleRow(item.date || `date-${index}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900 dark:text-white">{item.date ? formatDate(item.date) : 'ไม่ระบุ'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center text-gray-900 dark:text-white">{item.orderCount}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">{formatPrice(item.totalAmount)}</td>
                      <td className="px-6 py-4 text-right text-green-600">{formatPrice(item.paidAmount)}</td>
                      <td className="px-6 py-4 text-right text-orange-600">{formatPrice(item.pendingAmount)}</td>
                      <td className="px-6 py-4">
                        {expandedRows.has(item.date || `date-${index}`) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(item.date || `date-${index}`) && item.orders.map((order) => (
                      <tr key={order.id} className="bg-gray-50 dark:bg-slate-900">
                        <td className="px-6 py-3 pl-12">
                          <span className="text-sm text-gray-600 dark:text-slate-400">{order.orderNumber}</span>
                        </td>
                        <td className="px-6 py-3 text-center text-sm text-gray-600 dark:text-slate-400">{order.customerName}</td>
                        <td className="px-6 py-3 text-right text-sm text-gray-900 dark:text-white">{formatPrice(order.totalAmount)}</td>
                        <td className="px-6 py-3 text-right" colSpan={2}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            order.paymentStatus === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {order.paymentStatus === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}

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
                      <td className="px-6 py-4 text-center text-gray-900 dark:text-white">{item.orderCount}</td>
                      <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">{formatPrice(item.totalAmount)}</td>
                      <td className="px-6 py-4 text-right text-green-600">{formatPrice(item.paidAmount)}</td>
                      <td className="px-6 py-4 text-right text-orange-600">{formatPrice(item.pendingAmount)}</td>
                      <td className="px-6 py-4">
                        {expandedRows.has(item.customerId || `customer-${index}`) ? (
                          <ChevronDown className="w-5 h-5 text-gray-400" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-gray-400" />
                        )}
                      </td>
                    </tr>
                    {expandedRows.has(item.customerId || `customer-${index}`) && item.orders.map((order) => (
                      <tr key={order.id} className="bg-gray-50 dark:bg-slate-900">
                        <td className="px-6 py-3 pl-12">
                          <span className="text-sm text-gray-600 dark:text-slate-400">{order.orderNumber}</span>
                        </td>
                        <td className="px-6 py-3 text-center text-sm text-gray-600 dark:text-slate-400">{formatDate(order.orderDate)}</td>
                        <td className="px-6 py-3 text-right text-sm text-gray-900 dark:text-white">{formatPrice(order.totalAmount)}</td>
                        <td className="px-6 py-3 text-right" colSpan={2}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            order.paymentStatus === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {order.paymentStatus === 'paid' ? 'ชำระแล้ว' : 'รอชำระ'}
                          </span>
                        </td>
                        <td></td>
                      </tr>
                    ))}
                  </Fragment>
                ))}

                {groupBy === 'product' && groupedData.map((item: GroupedDataByProduct, index: number) => (
                  <tr key={`${item.productCode || 'unknown'}-${item.variationLabel || 'unknown'}-${index}`} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 dark:bg-slate-900">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{item.productName}</div>
                        <div className="text-sm text-gray-500 dark:text-slate-400">{item.productCode}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:text-blue-400">
                        {item.variationLabel}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center font-semibold text-gray-900 dark:text-white">
                      {(item.totalQuantity || 0).toLocaleString()} ขวด
                    </td>
                    <td className="px-6 py-4 text-right font-semibold text-gray-900 dark:text-white">{formatPrice(item.totalAmount || 0)}</td>
                  </tr>
                ))}
              </tbody>

              {/* Total Footer */}
              <tfoot className="data-tfoot">
                <tr>
                  <td className="px-6 py-4 font-bold text-gray-900 dark:text-white" colSpan={groupBy === 'product' ? 2 : 2}>
                    รวมทั้งหมด
                  </td>
                  {groupBy === 'product' ? (
                    <>
                      <td className="px-6 py-4 text-center font-bold text-gray-900 dark:text-white">
                        {groupedData.reduce((sum: number, item: GroupedDataByProduct) => sum + (item.totalQuantity || 0), 0).toLocaleString()} ขวด
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                        {formatPrice(summary?.totalNet || 0)}
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-6 py-4 text-right font-bold text-gray-900 dark:text-white">
                        {formatPrice(summary?.totalNet || 0)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-green-600">
                        {formatPrice(summary?.paidAmount || 0)}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-orange-600">
                        {formatPrice(summary?.pendingAmount || 0)}
                      </td>
                      <td></td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile Card Layout */}
          <div className="md:hidden space-y-3">
            {groupBy === 'date' && groupedData.map((item: GroupedDataByDate, index: number) => (
              <div key={item.date || `date-${index}`} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-900 dark:text-white">{item.date ? formatDate(item.date) : 'ไม่ระบุ'}</span>
                  <span className="ml-auto text-sm text-gray-500 dark:text-slate-400">{item.orderCount} orders</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">ยอดขาย</div>
                    <div className="font-semibold text-gray-900 dark:text-white">{formatPrice(item.totalAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">ชำระแล้ว</div>
                    <div className="font-semibold text-green-600">{formatPrice(item.paidAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">รอชำระ</div>
                    <div className="font-semibold text-orange-600">{formatPrice(item.pendingAmount)}</div>
                  </div>
                </div>
              </div>
            ))}

            {groupBy === 'customer' && groupedData.map((item: GroupedDataByCustomer, index: number) => (
              <div key={item.customerId || `customer-${index}`} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <div className="mb-3">
                  <div className="font-medium text-gray-900 dark:text-white">{item.customerName}</div>
                  <div className="text-sm text-gray-500 dark:text-slate-400">{item.customerCode} &middot; {item.orderCount} orders</div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">ยอดขาย</div>
                    <div className="font-semibold text-gray-900 dark:text-white">{formatPrice(item.totalAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">ชำระแล้ว</div>
                    <div className="font-semibold text-green-600">{formatPrice(item.paidAmount)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">รอชำระ</div>
                    <div className="font-semibold text-orange-600">{formatPrice(item.pendingAmount)}</div>
                  </div>
                </div>
              </div>
            ))}

            {groupBy === 'product' && groupedData.map((item: GroupedDataByProduct, index: number) => (
              <div key={`${item.productCode || 'unknown'}-${item.variationLabel || 'unknown'}-${index}`} className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">{item.productName}</div>
                    <div className="text-sm text-gray-500 dark:text-slate-400">{item.productCode}</div>
                  </div>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:text-blue-400">
                    {item.variationLabel}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-500 dark:text-slate-400">จำนวนขาย: <span className="font-semibold text-gray-900 dark:text-white">{(item.totalQuantity || 0).toLocaleString()} ขวด</span></span>
                  <span className="font-semibold text-gray-900 dark:text-white">{formatPrice(item.totalAmount || 0)}</span>
                </div>
              </div>
            ))}

            {/* Mobile Totals */}
            <div className="bg-gray-50 dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-slate-700 p-4">
              <div className="text-sm font-bold text-gray-900 dark:text-white mb-2">รวมทั้งหมด</div>
              {groupBy === 'product' ? (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600 dark:text-slate-400">
                    {groupedData.reduce((sum: number, item: GroupedDataByProduct) => sum + (item.totalQuantity || 0), 0).toLocaleString()} ขวด
                  </span>
                  <span className="font-bold text-gray-900 dark:text-white">{formatPrice(summary?.totalNet || 0)}</span>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">ยอดขาย</div>
                    <div className="font-bold text-gray-900 dark:text-white">{formatPrice(summary?.totalNet || 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">ชำระแล้ว</div>
                    <div className="font-bold text-green-600">{formatPrice(summary?.paidAmount || 0)}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 dark:text-slate-400">รอชำระ</div>
                    <div className="font-bold text-orange-600">{formatPrice(summary?.pendingAmount || 0)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
          </>
        )}
      </div>
    </Layout>
  );
}
