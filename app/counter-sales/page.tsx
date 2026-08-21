// Path: app/counter-sales/page.tsx
// Admin dashboard — PC-recorded sales across all branch counters (realtime).
// These entries are an informational overlay (audit / replenishment planning);
// billing still comes from the store's month-end report (DSR).
'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import FormSelect from '@/components/ui/FormSelect';
import Badge from '@/components/ui/Badge';
import { Stat } from '@/components/ui/Chart';
import { LoadingCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useCompany } from '@/lib/company-context';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { formatPrice, formatNumber } from '@/lib/utils/format';
import { Store, Banknote, Boxes, Trash2 } from 'lucide-react';

interface SaleRow {
  id: string;
  counter_id: string;
  sale_date: string;
  quantity: number;
  unit_price: number;
  amount: number;
  report_id: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
  counter?: { id: string; name: string; customer?: { id: string; name: string } | null } | null;
  variation?: { variation_label?: string | null; sku?: string | null; product?: { name?: string } | null } | null;
}

const bangkokToday = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

const PERIODS = [
  { id: 'today', label: 'วันนี้' },
  { id: '7d', label: '7 วันล่าสุด' },
  { id: 'month', label: 'เดือนนี้' },
] as const;

function periodRange(period: string): { from: string; to: string } {
  const today = bangkokToday();
  if (period === 'today') return { from: today, to: today };
  if (period === '7d') {
    const from = new Date(Date.now() + 7 * 3600_000 - 6 * 86400_000).toISOString().slice(0, 10);
    return { from, to: today };
  }
  return { from: `${today.slice(0, 7)}-01`, to: today };
}

export default function CounterSalesDashboardPage() {
  const { allowed, loading: guardLoading } = useAuthGuard('counter.manage', { noRedirect: true });
  const { currentCompany } = useCompany();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [counters, setCounters] = useState<{ id: string; name: string; customer?: { name: string } | null }[]>([]);
  const [counterFilter, setCounterFilter] = useState('');
  const [period, setPeriod] = useState<string>('month');
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<{ total_qty: number; total_amount: number }>({ total_qty: 0, total_amount: 0 });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    if (!allowed) return;
    apiFetch('/api/counters?active=false')
      .then(r => r.json())
      .then(d => setCounters(d.counters || []))
      .catch(() => {});
  }, [allowed]);

  const fetchSales = useCallback(async () => {
    if (!allowed) return;
    setLoading(true);
    try {
      const { from, to } = periodRange(period);
      const params = new URLSearchParams({ from, to, page: String(page), limit: String(limit) });
      if (counterFilter) params.set('counter_id', counterFilter);
      const res = await apiFetch(`/api/counter-sales?${params}`);
      const data = await res.json();
      if (res.ok) {
        setSales(data.sales || []);
        setTotal(data.total || 0);
        setSummary(data.summary || { total_qty: 0, total_amount: 0 });
      }
    } catch {
      setSales([]);
    } finally {
      setLoading(false);
    }
  }, [allowed, period, counterFilter, page, limit]);

  useEffect(() => { fetchSales(); }, [fetchSales]);

  // Realtime: refresh (debounced) whenever any counter_sales row changes for this company
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const fetchSalesRef = useRef(fetchSales);
  fetchSalesRef.current = fetchSales;
  useEffect(() => {
    if (!allowed || !currentCompany?.id) return;
    const channel = supabase
      .channel(`counter-sales-${currentCompany.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'counter_sales', filter: `company_id=eq.${currentCompany.id}` }, () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchSalesRef.current(), 500);
      })
      .subscribe();
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [allowed, currentCompany?.id]);

  const handleDelete = useCallback(async (row: SaleRow) => {
    const ok = await confirm({
      title: 'ลบรายการขาย PC',
      description: `ลบรายการ ${row.variation?.product?.name || ''} ยอด ฿${formatPrice(row.amount)} ของสาขา ${row.counter?.name || ''}?`,
      confirmLabel: 'ลบรายการ',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const res = await apiFetch(`/api/counter-sales?id=${row.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      showToast('ลบรายการแล้ว', 'success');
      fetchSales();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
    }
  }, [confirm, showToast, fetchSales]);

  const columns: DataTableColumn<SaleRow>[] = useMemo(() => [
    {
      key: 'sale_date', label: 'วันที่', alwaysVisible: true,
      render: (r) => (
        <div>
          <div>{new Date(`${r.sale_date}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}</div>
          <div className="helper-text text-gray-500">
            {new Date(r.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
          </div>
        </div>
      ),
    },
    {
      key: 'counter', label: 'สาขา',
      render: (r) => (
        <div>
          <div>{r.counter?.name || '-'}</div>
          <div className="helper-text text-gray-500">{r.counter?.customer?.name || ''}</div>
        </div>
      ),
    },
    {
      key: 'product', label: 'สินค้า',
      render: (r) => (
        <div>
          <div>{r.variation?.product?.name || '-'}</div>
          {r.variation?.variation_label && <div className="helper-text text-gray-500">{r.variation.variation_label}</div>}
        </div>
      ),
    },
    {
      key: 'quantity', label: 'จำนวน', headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => formatNumber(r.quantity),
    },
    {
      key: 'amount', label: 'ยอดเงิน', headerClassName: 'text-right', cellClassName: 'text-right',
      render: (r) => <span className="font-semibold">฿{formatPrice(r.amount)}</span>,
    },
    {
      key: 'recorded_by', label: 'ผู้บันทึก',
      render: (r) => r.recorded_by_name || '-',
    },
    {
      key: 'status', label: 'สถานะ',
      render: (r) => r.report_id
        ? <Badge tone="emerald" size="sm">เข้ารายงานห้างแล้ว</Badge>
        : <Badge tone="blue" size="sm">รอรอบสิ้นเดือน</Badge>,
    },
    {
      key: 'actions', label: '', stopPropagation: true, alwaysVisible: true,
      render: (r) => !r.report_id ? (
        <button onClick={() => handleDelete(r)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors" title="ลบรายการ">
          <Trash2 className="w-4 h-4" />
        </button>
      ) : null,
    },
  ], [handleDelete]);

  if (guardLoading) return <Layout><Container size="full"><LoadingCard /></Container></Layout>;
  if (!allowed) return <Layout><Container size="full"><NoPermissionCard /></Container></Layout>;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<Store />}
          title="ยอดขาย PC"
          subtitle="ยอดขายรายวันที่ PC บันทึกจากทุกสาขา (ข้อมูลติดตาม — วางบิลใช้ report ห้างตามเดิม)"
        />

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="ยอดขายรวม" value={`฿${formatPrice(summary.total_amount)}`} icon={<Banknote className="w-5 h-5" />} />
          <Stat label="จำนวนที่ขาย" value={`${formatNumber(summary.total_qty)} ชิ้น`} icon={<Boxes className="w-5 h-5" />} />
          <Stat label="จำนวนรายการ" value={formatNumber(total)} icon={<Store className="w-5 h-5" />} />
        </div>

        <div className="data-filter-card flex flex-wrap gap-3">
          <div className="w-44">
            <FormSelect
              value={period}
              onChange={(v) => { setPeriod(v); setPage(1); }}
              options={PERIODS.map(p => ({ id: p.id, label: p.label }))}
              searchThreshold={99}
            />
          </div>
          <div className="w-56">
            <FormSelect
              value={counterFilter}
              onChange={(v) => { setCounterFilter(v); setPage(1); }}
              options={counters.map(c => ({ id: c.id, label: `${c.customer?.name ? `${c.customer.name} — ` : ''}${c.name}` }))}
              placeholder="ทุกสาขา"
              clearLabel="ทุกสาขา"
            />
          </div>
        </div>

        <DataTable
          storageKey="counter-sales"
          columns={columns}
          data={sales}
          loading={loading}
          getRowId={(r) => r.id}
          emptyMessage="ยังไม่มียอดขายในช่วงเวลานี้"
          currentPage={page}
          totalPages={Math.max(1, Math.ceil(total / limit))}
          totalRecords={total}
          recordsPerPage={limit}
          onPageChange={setPage}
          onRecordsPerPageChange={(l) => { setLimit(l); setPage(1); }}
        />

        {confirmDialog}
      </Container>
    </Layout>
  );
}
