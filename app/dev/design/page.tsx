'use client';

/**
 * Design System Showcase — `/dev/design`
 *
 * Single-page reference for every shared UI primitive in AooCommerce. New pages
 * should pull components from this list instead of writing inline className blobs.
 *
 * Not linked from the sidebar — access by URL while developing.
 */

import { useState } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import BulkErrorModal, { type BulkErrorReport } from '@/components/bulk/BulkErrorModal';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { Stat, ProgressBar, BarChart, Sparkline } from '@/components/ui/Chart';
import Tabs from '@/components/ui/Tabs';
import PlatformIcon from '@/components/ui/PlatformIcon';
import {
  Plus, Save, Trash2, Check, AlertCircle, AlertTriangle, Pencil, Settings, Download, Upload, ArrowRight,
  ShoppingCart, Package, Banknote, Users,
} from 'lucide-react';

interface DemoRow {
  id: string;
  name: string;
  sku: string;
  stock: number;
  price: number;
  status: 'active' | 'inactive';
}

const INITIAL_ROWS: DemoRow[] = [
  { id: '1', name: 'เสื้อยืดสีขาว ไซส์ M', sku: 'TS-WHT-M', stock: 24, price: 299, status: 'active' },
  { id: '2', name: 'กางเกงยีนส์ ทรงสลิม', sku: 'JN-001',   stock:  6, price: 890, status: 'active' },
  { id: '3', name: 'กระเป๋าผ้าแคนวาส',     sku: 'BAG-001',  stock:  0, price: 450, status: 'inactive' },
  { id: '4', name: 'แก้วเซรามิก สีฟ้า',     sku: 'MUG-BLU',  stock: 18, price: 220, status: 'active' },
  { id: '5', name: 'หมวกแก๊ป Vintage',     sku: 'CAP-001',  stock: 12, price: 350, status: 'active' },
  { id: '6', name: 'กระบอกน้ำ Stainless',   sku: 'BTL-001',  stock:  3, price: 590, status: 'active' },
];

type SortKey = 'name' | 'stock' | 'price';

export default function DesignSystemPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorReport, setErrorReport] = useState<BulkErrorReport | null>(null);
  const [page, setPage] = useState(1);
  const [demoTab, setDemoTab] = useState<'orders' | 'invoices' | 'reports'>('orders');
  const [perPage, setPerPage] = useState<number>(20);
  const [rows, setRows] = useState<DemoRow[]>(INITIAL_ROWS);
  const [sortBy, setSortBy] = useState<SortKey | undefined>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | undefined>('asc');

  // Client-side sort for the showcase — real list pages usually pass sortBy
  // to the server and refetch.
  const sortedRows = [...rows].sort((a, b) => {
    if (!sortBy || !sortDir) return 0;
    const va = a[sortBy] as string | number;
    const vb = b[sortBy] as string | number;
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const updateRow = (id: string, patch: Partial<DemoRow>) => {
    setRows(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const tableColumns: DataTableColumn<DemoRow>[] = [
    {
      key: 'name', label: 'สินค้า', alwaysVisible: true, sortable: true, resizable: true, reorderable: true, defaultWidth: 260,
      render: (r) => (
        <div>
          <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
          <div className="text-xs text-gray-500 font-mono">{r.sku}</div>
        </div>
      ),
    },
    {
      key: 'stock', label: 'สต็อก', headerClassName: 'text-right', sortable: true, resizable: true, reorderable: true, defaultWidth: 110,
      edit: {
        type: 'number',
        getValue: (r) => r.stock,
        onSave: async (r, v) => updateRow(r.id, { stock: Number(v) }),
        validate: (v) => Number(v) < 0 ? 'ต้องไม่ติดลบ' : null,
      },
      render: (r) => (
        <div className="text-right">
          <span className={r.stock === 0 ? 'text-red-600 font-medium' : r.stock <= 10 ? 'text-amber-600 font-medium' : 'text-gray-900 dark:text-white'}>
            {r.stock}
          </span>
        </div>
      ),
    },
    {
      key: 'price', label: 'ราคา', headerClassName: 'text-right', sortable: true, resizable: true, reorderable: true, defaultWidth: 110,
      edit: {
        type: 'number',
        getValue: (r) => r.price,
        onSave: async (r, v) => updateRow(r.id, { price: Number(v) }),
        validate: (v) => Number(v) > 0 ? null : 'ต้องมากกว่า 0',
      },
      render: (r) => <div className="text-right">฿{r.price.toLocaleString('th-TH')}</div>,
    },
    {
      key: 'status', label: 'สถานะ', resizable: true, reorderable: true, defaultWidth: 130,
      edit: {
        type: 'select',
        getValue: (r) => r.status,
        options: [
          { value: 'active', label: 'ใช้งาน' },
          { value: 'inactive', label: 'ไม่ใช้งาน' },
        ],
        onSave: async (r, v) => updateRow(r.id, { status: v as 'active' | 'inactive' }),
      },
      render: (r) => r.status === 'active'
        ? <Badge tone="emerald">ใช้งาน</Badge>
        : <Badge tone="gray">ไม่ใช้งาน</Badge>,
    },
  ];

  return (
    <Layout>
      <Container size="6xl">
        {/* Page title — uses global typography classes (no inline color/size) */}
        <div>
          <h1 className="heading-1">Design System</h1>
          <p className="page-subtitle">
            Reference page — ทุก component ที่ใช้ได้ทั่วระบบ AooCommerce. URL: <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-slate-700 rounded text-sm">/dev/design</code>
          </p>
        </div>

        {/* TYPOGRAPHY */}
        <Section title="Typography" desc="Global classes — ใช้แทน inline `text-Nxl font-bold text-gray-900` chain">
          <Card>
            <div className="space-y-3">
              <div>
                <h1 className="heading-1">H1 — Page title</h1>
                <Hint><code>.heading-1</code> — list pages เช่น /products, /orders</Hint>
              </div>
              <div>
                <h2 className="heading-2">H2 — Sub-page title</h2>
                <Hint><code>.heading-2</code> — pages ที่มี back arrow (PageHeader)</Hint>
              </div>
              <div>
                <h3 className="heading-3">H3 — Section / Card title</h3>
                <Hint><code>.heading-3</code></Hint>
              </div>
              <div>
                <h4 className="heading-4">H4 — Small section / form group</h4>
                <Hint><code>.heading-4</code></Hint>
              </div>
              <div className="pt-2 space-y-1">
                <p className="body-text">Body — main reading text</p>
                <Hint className="!mt-0"><code>.body-text</code></Hint>
                <p className="subtitle-text">Subtitle / description</p>
                <Hint className="!mt-0"><code>.subtitle-text</code></Hint>
                <p className="helper-text">Helper / label / caption (ใช้เฉพาะ badge/subtitle context)</p>
                <Hint className="!mt-0"><code>.helper-text</code></Hint>
              </div>
              <div className="pt-2 border-t border-gray-100 dark:border-slate-700 space-y-1">
                <p className="page-subtitle">page-subtitle — ใต้ h1 (e.g. &quot;จัดการสินค้า&quot;)</p>
                <Hint className="!mt-0"><code>.page-subtitle</code></Hint>
                <p className="section-desc">section-desc — ใต้ section title (เล็กกว่า page-subtitle)</p>
                <Hint className="!mt-0"><code>.section-desc</code></Hint>
                <label className="field-label">field-label — input label</label>
                <Hint className="!mt-0"><code>.field-label</code></Hint>
              </div>
            </div>
          </Card>
        </Section>

        {/* COLORS */}
        <Section title="Color tokens" desc="ทุกสีอ้างจาก palette นี้เท่านั้น">
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Swatch name="Primary" cls="bg-[#F4511E]" hex="#F4511E" />
              <Swatch name="Primary hover" cls="bg-[#E64A19]" hex="#E64A19" />
              <Swatch name="Success" cls="bg-emerald-600" hex="emerald-600" />
              <Swatch name="Warning" cls="bg-amber-500" hex="amber-500" />
              <Swatch name="Danger" cls="bg-red-600" hex="red-600" />
              <Swatch name="Info" cls="bg-blue-600" hex="blue-600" />
              <Swatch name="Neutral" cls="bg-gray-500" hex="gray-500" />
              <Swatch name="Indigo" cls="bg-indigo-600" hex="indigo-600" />
            </div>
          </Card>
        </Section>

        {/* BUTTON */}
        <Section title="Button" desc="<Button variant size icon loading fullWidth />">
          <Card>
            <Group label="Variants">
              <Button variant="primary">Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="success">Success</Button>
            </Group>

            <Group label="Sizes">
              <Button size="sm">Small</Button>
              <Button size="md">Medium (default)</Button>
              <Button size="lg">Large</Button>
            </Group>

            <Group label="With icon">
              <Button icon={<Plus className="w-4 h-4" />}>เพิ่ม</Button>
              <Button variant="secondary" icon={<Download className="w-4 h-4" />}>ดาวน์โหลด</Button>
              <Button variant="danger" icon={<Trash2 className="w-4 h-4" />}>ลบ</Button>
              <Button iconRight={<ArrowRight className="w-4 h-4" />}>ถัดไป</Button>
            </Group>

            <Group label="States">
              <Button disabled>Disabled</Button>
              <Button loading>Loading...</Button>
              <Button variant="primary" loading>กำลังบันทึก</Button>
            </Group>

            <Group label="Full width">
              <Button fullWidth>Full width primary</Button>
            </Group>
          </Card>
        </Section>

        {/* CARD */}
        <Section title="Card" desc="<Card padding flat />">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card padding="sm">
              <div className="text-sm font-medium">padding=&quot;sm&quot;</div>
              <Hint>p-4 — dense layout</Hint>
            </Card>
            <Card padding="md">
              <div className="text-sm font-medium">padding=&quot;md&quot; (default)</div>
              <Hint>p-5 — standard</Hint>
            </Card>
            <Card padding="lg">
              <div className="text-sm font-medium">padding=&quot;lg&quot;</div>
              <Hint>p-6/p-8 — landing card</Hint>
            </Card>
          </div>
        </Section>

        {/* BADGE */}
        <Section title="Badge" desc="<Badge tone shape size icon />">
          <Card>
            <Group label="Tones">
              <Badge tone="gray">Gray</Badge>
              <Badge tone="red">Red</Badge>
              <Badge tone="amber">Amber</Badge>
              <Badge tone="emerald">Emerald</Badge>
              <Badge tone="blue">Blue</Badge>
              <Badge tone="indigo">Indigo</Badge>
              <Badge tone="purple">Purple</Badge>
              <Badge tone="orange">Orange</Badge>
            </Group>

            <Group label="With icon">
              <Badge tone="emerald" icon={<Check className="w-3 h-3" />}>สำเร็จ</Badge>
              <Badge tone="red" icon={<AlertCircle className="w-3 h-3" />}>Error</Badge>
              <Badge tone="amber" icon={<AlertTriangle className="w-3 h-3" />}>เตือน</Badge>
              <Badge tone="blue" icon={<Pencil className="w-3 h-3" />}>อัพเดท</Badge>
            </Group>

            <Group label="Shape + Size">
              <Badge size="sm" shape="pill">pill / sm</Badge>
              <Badge size="md" shape="pill">pill / md</Badge>
              <Badge size="sm" shape="square">square / sm</Badge>
              <Badge size="md" shape="square">square / md</Badge>
            </Group>
          </Card>
        </Section>

        {/* PAGE HEADER */}
        <Section title="PageHeader" desc="<PageHeader title subtitle backHref icon actions /> — sub-pages with back arrow">
          <Card>
            <PageHeader
              title="ตัวอย่างหน้า"
              subtitle="คำอธิบายเล็กๆ ใต้ title"
              backHref="/dev/design"
              actions={
                <>
                  <Button variant="secondary" icon={<Settings className="w-4 h-4" />}>ตั้งค่า</Button>
                  <Button variant="primary" icon={<Save className="w-4 h-4" />}>บันทึก</Button>
                </>
              }
            />
          </Card>
        </Section>

        {/* TABS */}
        <Section title="Tabs" desc="<Tabs activeKey tabs={[{key,label,icon?,count?,href?,activeColorClass?}]} onSelect? /> — underlined content tabs">
          <Card>
            <Group label="State-based (onSelect)">
              <div className="w-full">
                <Tabs
                  activeKey={demoTab}
                  onSelect={(k) => setDemoTab(k as typeof demoTab)}
                  tabs={[
                    { key: 'orders', label: 'คำสั่งซื้อ', count: 24 },
                    { key: 'invoices', label: 'ใบกำกับ', count: 8 },
                    { key: 'reports', label: 'รายงาน' },
                  ]}
                />
                <div className="subtitle-text text-gray-600 dark:text-slate-400">
                  active: <span className="font-mono">{demoTab}</span>
                </div>
              </div>
            </Group>
            <Group label="With icons + custom active color (per tab)">
              <div className="w-full">
                <Tabs
                  activeKey="facebook"
                  tabs={[
                    { key: 'facebook', label: 'FB / IG', icon: <PlatformIcon id="facebook" size={16} />, count: 2, activeColorClass: 'border-facebook text-facebook' },
                    { key: 'line', label: 'LINE', icon: <PlatformIcon id="line" size={16} />, count: 1, activeColorClass: 'border-line text-line' },
                  ]}
                />
              </div>
            </Group>
            <Group label="Link-based (route navigation)">
              <div className="w-full">
                <Tabs
                  activeKey="general"
                  tabs={[
                    { key: 'general', label: 'ทั่วไป', href: '/settings' },
                    { key: 'company', label: 'ข้อมูลบริษัท', href: '/settings/company' },
                  ]}
                />
                <Hint>กดเพื่อเปิด route จริง</Hint>
              </div>
            </Group>
          </Card>
        </Section>

        {/* PLATFORM ICON */}
        <Section title="PlatformIcon" desc="<PlatformIcon id='line|facebook|instagram|tiktok' size? title? /> — social icons from /public/social/">
          <Card>
            <Group label="All platforms (default size 18)">
              <PlatformIcon id="line" />
              <PlatformIcon id="facebook" />
              <PlatformIcon id="instagram" />
              <PlatformIcon id="tiktok" />
            </Group>
            <Group label="Sizes 14 / 18 / 24 / 32">
              <PlatformIcon id="facebook" size={14} />
              <PlatformIcon id="facebook" size={18} />
              <PlatformIcon id="facebook" size={24} />
              <PlatformIcon id="facebook" size={32} />
            </Group>
            <Group label="Stacked (FB + IG together)">
              <div className="inline-flex items-center gap-1.5">
                <PlatformIcon id="facebook" />
                <PlatformIcon id="instagram" />
              </div>
              <Hint>ใช้ pattern นี้ตอนแสดงว่า chat account เชื่อม FB + IG ในตัวเดียวกัน</Hint>
            </Group>
          </Card>
        </Section>

        {/* STATE CARDS */}
        <Section title="State cards" desc="LoadingCard / EmptyCard / NoPermissionCard / DoneCard">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <LoadingCard title="กำลังโหลด..." subtitle="กำลังตรวจสอบข้อมูล" />
            <EmptyCard title="ไม่พบข้อมูล" subtitle="ลองเปลี่ยน filter หรือสร้างใหม่" />
            <NoPermissionCard />
            <DoneCard
              hasErrors={false}
              summary={<span className="text-emerald-600 font-medium">5 สร้างใหม่</span>}
              actions={
                <>
                  <Button variant="primary">ไปหน้าสินค้า</Button>
                  <Button variant="secondary">อัพโหลดเพิ่ม</Button>
                </>
              }
            />
          </div>
          <div className="mt-4">
            <DoneCard
              hasErrors
              title="เสร็จสิ้น (มี error)"
              summary={
                <>
                  <span className="text-emerald-600 font-medium">5 สำเร็จ</span>
                  <span className="text-red-600 font-medium">2 ล้มเหลว</span>
                </>
              }
              actions={<Button variant="primary">ดูรายละเอียด</Button>}
            />
          </div>
        </Section>

        {/* MODAL */}
        <Section title="Modal" desc="<Modal open onClose title icon size footer /> — fixed centered + dark backdrop">
          <Card>
            <Group label="Triggers">
              <Button onClick={() => setModalOpen(true)}>Open Modal (lg)</Button>
              <Button variant="secondary" onClick={() => setConfirmOpen(true)}>Open ConfirmDialog</Button>
              <Button
                variant="danger"
                onClick={() =>
                  setErrorReport({
                    headerIssues: ['column "SKU" หายไป', 'column "Barcode" หายไป'],
                    rowIssues: [
                      'แถว 3: ราคาปกติ "350บาท" ไม่ใช่ตัวเลข',
                      'ไม่พบแบรนด์ในระบบ: "Brand A", "Brand B" — สร้างใน "ตั้งค่า > แบรนด์" ก่อน',
                    ],
                    otherIssues: [],
                  })
                }
              >
                Open BulkErrorModal
              </Button>
            </Group>
          </Card>
        </Section>

        {/* CONTAINER */}
        <Section title="Container" desc="<Container size='sm|md|lg|xl|2xl|4xl|5xl|6xl|full' gap />">
          <Card>
            <Hint>
              ใช้แทน <code>&lt;div className=&quot;max-w-5xl space-y-6&quot;&gt;</code> — sizes map:
              <br />
              <code>full</code> = list pages | <code>5xl</code> = bulk action (default) | <code>4xl</code> = bulk hub
              | <code>2xl</code> = detail/edit forms | <code>xl</code> = narrow settings
            </Hint>
          </Card>
        </Section>

        {/* DATA TABLE */}
        <Section
          title="DataTable"
          desc="ตารางสำหรับ list page ทุกหน้า — รองรับ sort, resize, cell edit, pagination, column toggle"
        >
          <Card padding="none">
            <DataTable<DemoRow>
              storageKey="dev-design-demo"
              columns={tableColumns}
              data={sortedRows}
              getRowId={(r) => r.id}
              sortBy={sortBy}
              sortDir={sortDir}
              onSort={(key, dir) => {
                setSortBy(dir ? key as SortKey : undefined);
                setSortDir(dir || undefined);
              }}
              currentPage={page}
              totalPages={1}
              totalRecords={sortedRows.length}
              recordsPerPage={perPage}
              onPageChange={setPage}
              onRecordsPerPageChange={setPerPage}
            />
          </Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 text-xs text-gray-600 dark:text-slate-400">
            <Hint>🔼 <strong>Sort</strong> — คลิกหัว column ที่มี arrow ↕ (สินค้า / สต็อก / ราคา) → asc → desc → unsort</Hint>
            <Hint>↔️ <strong>Resize</strong> — ลากขอบขวาของหัว column (cursor col-resize) — กว้างถูกเก็บใน localStorage</Hint>
            <Hint>✏️ <strong>Cell edit</strong> — คลิกที่ cell <em>สต็อก / ราคา / สถานะ</em> (พื้น hover เหลือง) → กรอก/เลือก → Enter save / Esc cancel</Hint>
            <Hint>📋 <strong>Column toggle</strong> — icon ขวาล่างของ pagination — toggle column แสดง/ซ่อน</Hint>
            <Hint>⋮⋮ <strong>Reorder</strong> — ลากหัว column (cursor grab) ทับ column อื่น → สลับลำดับ (บันทึก localStorage)</Hint>
          </div>
        </Section>

        {/* STATS / KPI */}
        <Section title="Stat (KPI box)" desc="<Stat label value subtitle delta trend icon />">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Stat
              label="ยอดขายวันนี้"
              value="฿24,560"
              subtitle="12 ออเดอร์"
              delta="+18% จากเมื่อวาน"
              trend="up"
              icon={<Banknote className="w-5 h-5" />}
            />
            <Stat
              label="ออเดอร์ใหม่"
              value="34"
              subtitle="รอตรวจสอบ"
              delta="-5% จากสัปดาห์ก่อน"
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
              delta="ไม่เปลี่ยนแปลง"
              trend="flat"
              icon={<Users className="w-5 h-5" />}
            />
          </div>
        </Section>

        {/* BAR CHART */}
        <Section title="BarChart" desc="<BarChart data height toneClass showValues /> — pure CSS, no extra deps">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">ยอดขาย 7 วัน</h3>
              <BarChart
                data={[
                  { label: 'จ', value: 12500 },
                  { label: 'อ', value: 18200 },
                  { label: 'พ', value: 9800 },
                  { label: 'พฤ', value: 22000 },
                  { label: 'ศ', value: 28500 },
                  { label: 'ส', value: 31000 },
                  { label: 'อา', value: 24500 },
                ]}
                showValues
                formatValue={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
              />
            </Card>
            <Card>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-3">ออเดอร์ 7 วัน</h3>
              <BarChart
                data={[
                  { label: 'จ', value: 5 },
                  { label: 'อ', value: 8 },
                  { label: 'พ', value: 4 },
                  { label: 'พฤ', value: 12 },
                  { label: 'ศ', value: 15 },
                  { label: 'ส', value: 18 },
                  { label: 'อา', value: 11 },
                ]}
                toneClass="bg-emerald-500"
                showValues
              />
            </Card>
          </div>
        </Section>

        {/* SPARKLINE */}
        <Section title="Sparkline" desc="<Sparkline data width height strokeClass fillClass /> — inline trend line">
          <Card>
            <div className="space-y-3">
              <SparklineRow label="ยอดขาย 30 วัน" data={[12, 19, 8, 22, 14, 25, 18, 28, 31, 22, 35, 42, 38, 45, 41, 48, 52, 49, 55, 61, 58, 67, 71, 65, 72, 78, 75, 82, 88, 91]} tone="text-emerald-600" />
              <SparklineRow label="ออเดอร์ขัดข้อง" data={[2, 1, 0, 3, 2, 1, 0, 0, 4, 2, 1, 0, 5, 3, 2, 1, 0, 0, 6, 3, 2, 1, 0, 4, 2, 1, 0, 0, 1, 2]} tone="text-red-600" />
              <SparklineRow label="Stock movement" data={[100, 95, 92, 88, 85, 90, 87, 82, 78, 80, 75, 72, 78, 82, 79, 75, 70, 68, 65, 70, 75, 72, 68, 65, 60, 58, 62, 65, 68, 70]} tone="text-blue-600" />
            </div>
          </Card>
        </Section>

        {/* PROGRESS */}
        <Section title="ProgressBar" desc="<ProgressBar value max toneClass label size />">
          <Card>
            <div className="space-y-4 max-w-md">
              <ProgressBar
                value={75}
                label={<><span>เป้าหมายเดือนนี้</span><span className="font-medium text-gray-900 dark:text-white">75%</span></>}
              />
              <ProgressBar value={45} toneClass="bg-emerald-500" label={<><span>สต็อก</span><span>45 / 100</span></>} />
              <ProgressBar value={92} toneClass="bg-amber-500" size="sm" label={<><span>Storage</span><span>92%</span></>} />
              <ProgressBar value={15} toneClass="bg-red-500" size="lg" label={<><span>Critical</span><span>15/100</span></>} />
            </div>
          </Card>
        </Section>

        {/* USAGE NOTES */}
        <Section title="🚫 Don't" desc="หลีกเลี่ยง inline className เหล่านี้">
          <Card>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-slate-300">
              <li>❌ <code>{`<button className="bg-[#F4511E] hover:bg-[#E64A19] text-white px-4 py-2 rounded-lg">`}</code>
                {' → '}✅ <code>{`<Button>`}</code></li>
              <li>❌ <code>{`<div className="bg-white rounded-lg shadow-sm p-5">`}</code>
                {' → '}✅ <code>{`<Card>`}</code></li>
              <li>❌ <code>{`<div className="max-w-5xl space-y-6">`}</code>
                {' → '}✅ <code>{`<Container>`}</code></li>
              <li>❌ <code>{`<span className="bg-red-50 text-red-700 px-2 py-0.5 rounded-full">`}</code>
                {' → '}✅ <code>{`<Badge tone="red">`}</code></li>
              <li>❌ inline back-arrow + title block ทุกหน้า
                {' → '}✅ <code>{`<PageHeader>`}</code></li>
              <li>❌ inline spinner card
                {' → '}✅ <code>{`<LoadingCard>`}</code></li>
            </ul>
          </Card>
        </Section>
      </Container>

      {/* Modal demos */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        size="lg"
        title="ตัวอย่าง Modal"
        icon={<Settings className="w-6 h-6 text-gray-500" />}
        footer={
          <div className="flex items-center justify-end gap-2 px-5 py-3">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>ยกเลิก</Button>
            <Button variant="primary" onClick={() => setModalOpen(false)}>บันทึก</Button>
          </div>
        }
      >
        <div className="p-5 space-y-3 text-sm text-gray-700 dark:text-slate-300">
          <p>เนื้อหา modal วางในนี้ — ต้องใส่ <code>p-5</code> เอง (Modal ไม่บังคับ padding ใน children)</p>
          <p>Backdrop bg-black/50 + Esc ปิดได้ + click backdrop ปิดได้ (override ได้)</p>
          <p>Sizes: <code>sm md lg xl 2xl 3xl 4xl</code></p>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
        title="ยืนยันการลบ?"
        description={`การลบสินค้านี้ไม่สามารถกู้คืนได้ ดำเนินการต่อ?`}
        confirmLabel="ลบ"
        cancelLabel="ยกเลิก"
        variant="danger"
        icon={<AlertTriangle className="w-6 h-6 text-red-500" />}
      />

      <BulkErrorModal
        report={errorReport}
        onClose={() => setErrorReport(null)}
      />
    </Layout>
  );
}

/* ---------- Local helpers for the showcase only ---------- */

function Section({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 mt-8">
      <div>
        <h2 className="heading-3">{title}</h2>
        {desc && <p className="section-desc">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-3 border-t border-gray-100 dark:border-slate-700 first:border-t-0 first:pt-0">
      <div className="helper-text uppercase tracking-wide mb-2">{label}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

function Hint({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`helper-text mt-1 ${className}`}>{children}</p>;
}

function SparklineRow({ label, data, tone }: { label: string; data: number[]; tone: string }) {
  const last = data[data.length - 1] ?? 0;
  return (
    <div className="flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-700 dark:text-slate-300">{label}</div>
        <div className="text-lg font-semibold text-gray-900 dark:text-white">{last.toLocaleString('th-TH')}</div>
      </div>
      <Sparkline data={data} width={140} height={40} strokeClass={tone} fillClass={tone} />
    </div>
  );
}

function Swatch({ name, cls, hex }: { name: string; cls: string; hex: string }) {
  return (
    <div className="space-y-1">
      <div className={`h-12 rounded-lg ${cls} border border-gray-200 dark:border-slate-700`} />
      <div className="text-sm font-medium text-gray-900 dark:text-white">{name}</div>
      <div className="text-xs text-gray-500 font-mono">{hex}</div>
    </div>
  );
}
