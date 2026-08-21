'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { RotateCcw, Search, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';

interface ReturnNoteRow {
  id: string;
  rn_number: string;
  rn_date: string;
  status: string;
  total_amount: number;
  reference_doc_number: string | null;
  reason: string | null;
  credit_note_id: string | null;
  customer: { id: string; name: string; customer_code: string | null } | null;
}

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatMoney(n: number) {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  issued: { label: 'ออกแล้ว', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  cancelled: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function ReturnNotesPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ReturnNoteRow[]>([]);
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
      const params = new URLSearchParams({ page: String(page), limit: String(recordsPerPage) });
      if (search) params.set('search', search);
      const res = await apiFetch(`/api/return-notes?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.return_notes || []);
        setTotal(data.total || 0);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / recordsPerPage);

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          icon={<RotateCcw />}
          title="ใบรับคืนสินค้า"
          subtitle="RN-YYYYMM-NNNN -- คืนสินค้าจากตัวแทน/ห้าง"
          actions={
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => router.push('/return-notes/new')}
            >
              สร้างใบรับคืน
            </Button>
          }
        />

        <div className="data-filter-card">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="ค้นหาเลขที่..."
                className="w-full h-[42px] pl-9 pr-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary"
              />
            </div>
          </div>
        </div>

        {/* DataTable */}
        <DataTable<ReturnNoteRow>
          storageKey="return-notes-columns"
          columns={[
            {
              key: 'rn_number', label: 'เลขที่', alwaysVisible: true,
              render: (row) => (
                <Link href={`/return-notes/${row.id}`} className="font-mono text-sm font-medium text-primary hover:underline" onClick={e => e.stopPropagation()}>
                  {row.rn_number}
                </Link>
              ),
            },
            {
              key: 'rn_date', label: 'วันที่',
              render: (row) => (
                <span className="text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.rn_date)}</span>
              ),
            },
            {
              key: 'customer', label: 'ลูกค้า',
              render: (row) => (
                <span className="text-sm text-gray-900 dark:text-white">{row.customer?.name || '-'}</span>
              ),
            },
            {
              key: 'reference', label: 'อ้างอิง',
              render: (row) => (
                <span className="text-sm text-gray-500 dark:text-slate-400">{row.reference_doc_number || '-'}</span>
              ),
            },
            {
              key: 'reason', label: 'เหตุผล',
              render: (row) => (
                <span className="text-sm text-gray-500 dark:text-slate-400 truncate max-w-[200px] block">{row.reason || '-'}</span>
              ),
            },
            {
              key: 'total_amount', label: 'ยอด (บาท)', headerClassName: 'text-right', cellClassName: 'text-right',
              render: (row) => (
                <span className="text-sm font-medium text-gray-900 dark:text-white">{formatMoney(row.total_amount)}</span>
              ),
            },
            {
              key: 'status', label: 'สถานะ', headerClassName: 'text-center', cellClassName: 'text-center',
              render: (row) => {
                const badge = STATUS_BADGE[row.status] || STATUS_BADGE.issued;
                return (
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                );
              },
            },
          ]}
          data={rows}
          loading={loading}
          getRowId={(row) => row.id}
          emptyMessage="ไม่พบใบรับคืนสินค้า"
          currentPage={page}
          totalPages={totalPages}
          totalRecords={total}
          recordsPerPage={recordsPerPage}
          onPageChange={setPage}
          onRecordsPerPageChange={(v) => { setRecordsPerPage(v); setPage(1); }}
          loadTime={loadTime}
          mobileCardRender={(row) => {
            const badge = STATUS_BADGE[row.status] || STATUS_BADGE.issued;
            return (
              <Link href={`/return-notes/${row.id}`} className="block">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-primary">{row.rn_number}</span>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{formatDate(row.rn_date)}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                </div>
                <div className="text-sm text-gray-900 dark:text-white mb-1">{row.customer?.name || '-'}</div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 mb-1">
                  {row.reference_doc_number && <span>อ้างอิง: {row.reference_doc_number}</span>}
                  {row.reason && <span className="truncate">เหตุผล: {row.reason}</span>}
                </div>
                <div className="text-sm font-medium text-gray-900 dark:text-white text-right">{formatMoney(row.total_amount)} บาท</div>
              </Link>
            );
          }}
        />
      </div>
    </Layout>
  );
}
