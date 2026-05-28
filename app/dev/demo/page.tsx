'use client';

/**
 * Demo page — `/dev/demo`
 *
 * Realistic "Sales Dashboard" built ENTIRELY from shared components.
 * Zero inline `className="bg-X text-X p-X..."` blobs for layout/buttons/badges.
 *
 * Use this as a reference when building new pages — copy the structure,
 * swap the data.
 */

import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { ExportButton } from '@/components/ui/ExportImportButton';
import Badge from '@/components/ui/Badge';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { Stat, BarChart, Sparkline, ProgressBar } from '@/components/ui/Chart';
import FormSelect from '@/components/ui/FormSelect';
import Tabs from '@/components/ui/Tabs';
import {
  Banknote, ShoppingCart, Package, Users,
  Eye, Pencil,
} from 'lucide-react';

type Period = 'today' | '7d' | '30d' | 'mtd';

interface OrderRow {
  id: string;
  order_no: string;
  customer: string;
  channel: 'Shopee' | 'TikTok' | 'LINE' | 'POS' | 'เปิดบิลตรง';
  total: number;
  status: 'new' | 'processing' | 'shipping' | 'completed' | 'cancelled';
  created_at: string;
}

const DEMO_ORDERS: OrderRow[] = [
  { id: '1', order_no: 'OD-25241',  customer: 'คุณสมชาย ใจดี',     channel: 'Shopee',       total: 1290,  status: 'new',         created_at: '14:32' },
  { id: '2', order_no: 'OD-25240',  customer: 'คุณวรรณา รักษ์ดี',   channel: 'TikTok',       total:  890,  status: 'processing',  created_at: '14:18' },
  { id: '3', order_no: 'OD-25239',  customer: 'คุณนภดล มั่งมี',     channel: 'LINE',         total: 2480,  status: 'shipping',    created_at: '13:50' },
  { id: '4', order_no: 'OD-25238',  customer: 'หน้าร้าน POS',     channel: 'POS',          total:  450,  status: 'completed',   created_at: '13:42' },
  { id: '5', order_no: 'OD-25237',  customer: 'คุณปรีดา ทองดี',    channel: 'เปิดบิลตรง',   total: 5680,  status: 'completed',   created_at: '13:20' },
  { id: '6', order_no: 'OD-25236',  customer: 'คุณอารยา รุ่งเรือง', channel: 'Shopee',       total:  790,  status: 'cancelled',   created_at: '12:55' },
];

const STATUS_LABEL: Record<OrderRow['status'], { label: string; tone: 'gray' | 'blue' | 'amber' | 'emerald' | 'red' }> = {
  new:         { label: 'ใหม่',       tone: 'blue' },
  processing:  { label: 'กำลังจัด',   tone: 'amber' },
  shipping:    { label: 'จัดส่ง',     tone: 'amber' },
  completed:   { label: 'สำเร็จ',     tone: 'emerald' },
  cancelled:   { label: 'ยกเลิก',     tone: 'gray' },
};

const CHANNEL_TONE: Record<OrderRow['channel'], 'orange' | 'red' | 'emerald' | 'purple' | 'blue'> = {
  Shopee: 'orange',
  TikTok: 'red',
  LINE: 'emerald',
  POS: 'purple',
  'เปิดบิลตรง': 'blue',
};

export default function DemoDashboardPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [sortBy, setSortBy] = useState<string | undefined>('order_no');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | undefined>('desc');
  const [orders, setOrders] = useState<OrderRow[]>(DEMO_ORDERS);
  const [orderTab, setOrderTab] = useState<'all' | OrderRow['status']>('all');

  const filteredOrders = orderTab === 'all'
    ? orders
    : orders.filter(o => o.status === orderTab);

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (!sortBy || !sortDir) return 0;
    const va = a[sortBy as keyof OrderRow];
    const vb = b[sortBy as keyof OrderRow];
    if (va == null || vb == null) return 0;
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const orderCounts = orders.reduce<Record<string, number>>((acc, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: 'order_no', label: 'เลขที่', alwaysVisible: true, sortable: true, resizable: true, reorderable: true, defaultWidth: 130,
      render: (r) => (
        <div>
          <div className="text-gray-900 dark:text-white font-medium">{r.order_no}</div>
          <div className="text-xs text-gray-500">{r.created_at}</div>
        </div>
      ),
    },
    {
      key: 'customer', label: 'ลูกค้า', sortable: true, resizable: true, reorderable: true, defaultWidth: 200,
      render: (r) => <span className="text-gray-700 dark:text-slate-300">{r.customer}</span>,
    },
    {
      key: 'channel', label: 'ช่องทาง', sortable: true, resizable: true, reorderable: true, defaultWidth: 130,
      render: (r) => <Badge tone={CHANNEL_TONE[r.channel]}>{r.channel}</Badge>,
    },
    {
      key: 'total', label: 'ยอด', headerClassName: 'text-right', sortable: true, resizable: true, reorderable: true, defaultWidth: 110,
      edit: {
        type: 'number',
        getValue: (r) => r.total,
        onSave: async (r, v) => setOrders(os => os.map(o => o.id === r.id ? { ...o, total: Number(v) } : o)),
        validate: (v) => Number(v) > 0 ? null : 'ต้องมากกว่า 0',
      },
      render: (r) => (
        <div className="text-right font-medium text-gray-900 dark:text-white">
          ฿{r.total.toLocaleString('th-TH')}
        </div>
      ),
    },
    {
      key: 'status', label: 'สถานะ', sortable: true, resizable: true, reorderable: true, defaultWidth: 120,
      edit: {
        type: 'select',
        getValue: (r) => r.status,
        options: Object.entries(STATUS_LABEL).map(([value, { label }]) => ({ value, label })),
        onSave: async (r, v) => setOrders(os => os.map(o => o.id === r.id ? { ...o, status: v as OrderRow['status'] } : o)),
      },
      render: (r) => {
        const s = STATUS_LABEL[r.status];
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: 'actions', label: '', alwaysVisible: true, stopPropagation: true,
      render: () => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="sm" icon={<Eye className="w-4 h-4" />} aria-label="ดู" />
          <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} aria-label="แก้ไข" />
        </div>
      ),
    },
  ];

  return (
    <Layout>
      <Container size="full">
        {/* Page title with action — list-page pattern */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-1">Sales Dashboard</h1>
            <p className="page-subtitle">
              ภาพรวมยอดขาย / ออเดอร์ / สินค้า — ตัวอย่างใช้ design system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FormSelect
              value={period}
              onChange={(v) => setPeriod(v as Period)}
              options={[
                { id: 'today', label: 'วันนี้' },
                { id: '7d',    label: '7 วันล่าสุด' },
                { id: '30d',   label: '30 วันล่าสุด' },
                { id: 'mtd',   label: 'เดือนนี้' },
              ]}
            />
            <ExportButton />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat
            label="ยอดขาย"
            value="฿146,820"
            subtitle="142 ออเดอร์"
            delta="+18.2% vs สัปดาห์ก่อน"
            trend="up"
            icon={<Banknote className="w-5 h-5" />}
          />
          <Stat
            label="ออเดอร์ใหม่"
            value="34"
            subtitle="รอตรวจสอบ"
            delta="-2 จากเมื่อวาน"
            trend="down"
            icon={<ShoppingCart className="w-5 h-5" />}
          />
          <Stat
            label="สินค้า low stock"
            value="8"
            subtitle="ต่ำกว่า min"
            icon={<Package className="w-5 h-5" />}
          />
          <Stat
            label="ลูกค้าใหม่"
            value="142"
            delta="+12% vs สัปดาห์ก่อน"
            trend="up"
            icon={<Users className="w-5 h-5" />}
          />
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bar chart spans 2/3 */}
          <Card className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="heading-4">ยอดขาย 7 วัน</h3>
              <Badge tone="emerald" size="sm">+18%</Badge>
            </div>
            <BarChart
              data={[
                { label: 'จ', value: 12500 },
                { label: 'อ', value: 18200 },
                { label: 'พ', value:  9800 },
                { label: 'พฤ', value: 22000 },
                { label: 'ศ', value: 28500 },
                { label: 'ส', value: 31000 },
                { label: 'อา', value: 24820 },
              ]}
              height={180}
              showValues
              formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
            />
          </Card>

          {/* Channels breakdown */}
          <Card>
            <h3 className="heading-4 mb-4">ช่องทาง</h3>
            <div className="space-y-3">
              <ProgressBar
                value={62000} max={146820} toneClass="bg-[#F4511E]"
                label={<><span className="flex items-center gap-1"><Badge tone="orange" size="sm">Shopee</Badge></span><span className="font-medium">฿62,000</span></>}
              />
              <ProgressBar
                value={38500} max={146820} toneClass="bg-red-500"
                label={<><span className="flex items-center gap-1"><Badge tone="red" size="sm">TikTok</Badge></span><span className="font-medium">฿38,500</span></>}
              />
              <ProgressBar
                value={24820} max={146820} toneClass="bg-emerald-500"
                label={<><span className="flex items-center gap-1"><Badge tone="emerald" size="sm">LINE</Badge></span><span className="font-medium">฿24,820</span></>}
              />
              <ProgressBar
                value={12500} max={146820} toneClass="bg-purple-500"
                label={<><span className="flex items-center gap-1"><Badge tone="purple" size="sm">POS</Badge></span><span className="font-medium">฿12,500</span></>}
              />
              <ProgressBar
                value={9000} max={146820} toneClass="bg-blue-500"
                label={<><span className="flex items-center gap-1"><Badge tone="blue" size="sm">เปิดบิลตรง</Badge></span><span className="font-medium">฿9,000</span></>}
              />
            </div>
          </Card>
        </div>

        {/* Sparkline trends row */}
        <Card>
          <h3 className="heading-4 mb-4">Trends (30 วันล่าสุด)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TrendItem
              label="ยอดขายรวม"
              value="฿612k"
              delta="+24%"
              tone="text-emerald-600"
              data={[12, 19, 8, 22, 14, 25, 18, 28, 31, 22, 35, 42, 38, 45, 41, 48, 52, 49, 55, 61, 58, 67, 71, 65, 72, 78, 75, 82, 88, 91]}
            />
            <TrendItem
              label="ออเดอร์"
              value="582"
              delta="+12%"
              tone="text-blue-600"
              data={[5, 8, 4, 12, 9, 15, 11, 18, 14, 17, 22, 19, 25, 28, 24, 31, 35, 32, 38, 42, 39, 45, 48, 44, 51, 55, 52, 58, 61, 64]}
            />
            <TrendItem
              label="ยกเลิก"
              value="14"
              delta="-32%"
              tone="text-red-600"
              data={[3, 5, 2, 4, 6, 3, 5, 4, 2, 3, 1, 4, 2, 3, 5, 2, 1, 3, 2, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 1]}
            />
          </div>
        </Card>

        {/* Recent orders table */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="heading-3">ออเดอร์ล่าสุด</h2>
            <Button variant="ghost" size="sm">ดูทั้งหมด →</Button>
          </div>
          <Tabs
            activeKey={orderTab}
            onSelect={(k) => setOrderTab(k as typeof orderTab)}
            tabs={[
              { key: 'all',        label: 'ทั้งหมด',   count: orders.length },
              { key: 'new',        label: 'ใหม่',      count: orderCounts.new || undefined },
              { key: 'processing', label: 'กำลังจัด',  count: orderCounts.processing || undefined },
              { key: 'shipping',   label: 'จัดส่ง',    count: orderCounts.shipping || undefined },
              { key: 'completed',  label: 'สำเร็จ',    count: orderCounts.completed || undefined },
              { key: 'cancelled',  label: 'ยกเลิก',    count: orderCounts.cancelled || undefined },
            ]}
          />
          <Card padding="none">
            <DataTable<OrderRow>
              storageKey="dev-demo-orders"
              columns={columns}
              data={sortedOrders}
              getRowId={(r) => r.id}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={(key, dir) => { setSortBy(dir ? key : undefined); setSortDir(dir || undefined); }}
              currentPage={page}
              totalPages={1}
              totalRecords={sortedOrders.length}
              recordsPerPage={perPage}
              onPageChange={setPage}
              onRecordsPerPageChange={setPerPage}
            />
          </Card>
        </div>
      </Container>
    </Layout>
  );
}

function TrendItem({ label, value, delta, tone, data }: { label: string; value: string; delta: string; tone: string; data: number[] }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-lg border border-gray-100 dark:border-slate-700">
      <div className="min-w-0">
        <div className="text-sm text-gray-500 dark:text-slate-400">{label}</div>
        <div className="text-xl font-bold text-gray-900 dark:text-white">{value}</div>
        <div className={`text-xs font-medium ${tone}`}>{delta}</div>
      </div>
      <Sparkline data={data} width={120} height={40} strokeClass={tone} fillClass={tone} />
    </div>
  );
}
