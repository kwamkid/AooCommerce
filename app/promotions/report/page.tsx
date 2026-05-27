// Path: app/promotions/report/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { formatPrice } from '@/lib/utils/format';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import FormSelect from '@/components/ui/FormSelect';
import { BarChart3, ShoppingCart, Package, Banknote, Tag } from 'lucide-react';

interface ReportItem {
  id: string;
  name: string;
  promotion_type: string;
  status: string;
  image: string | null;
  order_count: number;
  total_qty: number;
  total_sales: number;
}

interface Summary {
  total_promotions: number;
  total_orders: number;
  total_qty: number;
  total_sales: number;
}

const TYPE_LABELS: Record<string, string> = {
  bundle_set: 'เซ็ตรวม',
  buy_get_free: 'ซื้อ X แถม Y',
  buy_get_discount: 'ซื้อ X ลด Y',
  qty_discount: 'ซื้อเยอะลดเยอะ',
};

const SOURCE_OPTIONS = [
  { id: 'all', label: 'ทั้งหมด' },
  { id: 'manual', label: 'Manual' },
  { id: 'pos', label: 'POS' },
  { id: 'shopee', label: 'Shopee' },
];

function getDefaultDateRange(): DateValueType {
  const today = new Date();
  const start = new Date(today);
  start.setMonth(today.getMonth() - 1);
  return { startDate: start, endDate: today };
}

export default function PromotionReportPage() {
  const { loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<ReportItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dateRange, setDateRange] = useState<DateValueType>(getDefaultDateRange);
  const [source, setSource] = useState('all');

  const fetchReport = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateRange?.startDate) {
        const d = dateRange.startDate instanceof Date ? dateRange.startDate : new Date(dateRange.startDate);
        params.set('date_from', d.toISOString().split('T')[0]);
      }
      if (dateRange?.endDate) {
        const d = dateRange.endDate instanceof Date ? dateRange.endDate : new Date(dateRange.endDate);
        params.set('date_to', d.toISOString().split('T')[0]);
      }
      if (source !== 'all') params.set('source', source);

      const res = await apiFetch(`/api/promotions/report?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReport(data.report || []);
        setSummary(data.summary || null);
      }
    } catch { /* silent */ }
    setLoading(false);
  };

  useEffect(() => {
    if (!authLoading) fetchReport();
  }, [authLoading, dateRange, source]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Layout>
      <Container size="6xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="heading-2">รายงานยอดขายโปรโมชั่น</h1>
            <p className="page-subtitle">ยอดขายแยกตามโปรโมชั่น (ไม่รวมตัวแทน/ห้าง)</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-64">
            <DateRangePicker
              value={dateRange}
              onChange={setDateRange}
              placeholder="เลือกช่วงวันที่"
            />
          </div>
          <div className="w-40">
            <FormSelect
              value={source}
              onChange={(v) => setSource(v)}
              options={SOURCE_OPTIONS}
              placeholder="ช่องทาง"
            />
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card padding="sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Tag className="w-4 h-4" />
                <span className="text-sm">โปรโมชั่น</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total_promotions}</p>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <ShoppingCart className="w-4 h-4" />
                <span className="text-sm">คำสั่งซื้อ</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total_orders}</p>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Package className="w-4 h-4" />
                <span className="text-sm">จำนวนชิ้น</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{summary.total_qty}</p>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                <Banknote className="w-4 h-4" />
                <span className="text-sm">ยอดขายรวม</span>
              </div>
              <p className="text-2xl font-bold text-primary">฿{formatPrice(summary.total_sales)}</p>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card padding="none" className="overflow-hidden">
          {loading ? (
            <LoadingCard />
          ) : report.length === 0 ? (
            <EmptyCard
              icon={<BarChart3 className="w-10 h-10 text-gray-400 opacity-50" />}
              title="ไม่พบข้อมูลโปรโมชั่นในช่วงเวลานี้"
            />
          ) : (
            <>
            {/* Desktop Table */}
            <div className="overflow-x-auto hidden md:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700/50">
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">โปรโมชั่น</th>
                    <th className="text-left px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">ประเภท</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">คำสั่งซื้อ</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">จำนวนชิ้น</th>
                    <th className="text-right px-4 py-3 text-sm font-medium text-gray-500 dark:text-gray-400">ยอดขาย</th>
                  </tr>
                </thead>
                <tbody>
                  {report.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700/30 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                              <Tag className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                          <div>
                            <p className="text-gray-900 dark:text-white font-medium">{item.name}</p>
                            <Badge
                              tone={item.status === 'active' ? 'emerald' : 'gray'}
                              shape="square"
                              size="sm"
                              className="mt-0.5"
                            >
                              {item.status === 'active' ? 'ใช้งาน' : item.status === 'inactive' ? 'ปิด' : item.status}
                            </Badge>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-sm">
                        {TYPE_LABELS[item.promotion_type] || item.promotion_type}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                        {item.order_count}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white font-medium">
                        {item.total_qty}
                      </td>
                      <td className="px-4 py-3 text-right text-primary font-bold">
                        ฿{formatPrice(item.total_sales)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-700/30">
              {report.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    {item.image ? (
                      <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover" />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-white/10 flex items-center justify-center">
                        <Tag className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 dark:text-white font-medium truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {TYPE_LABELS[item.promotion_type] || item.promotion_type}
                        </span>
                        <Badge
                          tone={item.status === 'active' ? 'emerald' : 'gray'}
                          shape="square"
                          size="sm"
                        >
                          {item.status === 'active' ? 'ใช้งาน' : item.status === 'inactive' ? 'ปิด' : item.status}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-gray-500 dark:text-gray-400">คำสั่งซื้อ</div>
                      <div className="font-medium text-gray-900 dark:text-white">{item.order_count}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400">จำนวนชิ้น</div>
                      <div className="font-medium text-gray-900 dark:text-white">{item.total_qty}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-gray-500 dark:text-gray-400">ยอดขาย</div>
                      <div className="font-bold text-primary">฿{formatPrice(item.total_sales)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            </>
          )}
        </Card>
      </Container>
    </Layout>
  );
}
