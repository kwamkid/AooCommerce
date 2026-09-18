'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import StatusBadge from '@/components/ui/StatusBadge';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { LoadingCard } from '@/components/ui/StateCard';
import PageHeader from '@/components/ui/PageHeader';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { DocumentIcon, ExternalLinkIcon } from '@/lib/icons';
import ListFilters from '@/components/ui/ListFilters';
import { FilterMonth } from '@/components/ui/ListFilterFields';
import { useListFilterParams } from '@/lib/useListFilterParams';
import Pagination from '@/app/components/Pagination';
import { formatThaiDate as formatDate, formatPrice as formatMoney } from '@/lib/utils/format';

interface InvRow {
  doc_id: string;
  source_type: string;
  source_id: string;
  source_number: string | null;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  customer_name: string | null;
  customer: { id: string; name: string } | null;
  voided_at: string | null;
}

function getSourceLink(row: InvRow): { href: string; label: string; subtitle?: string } {
  switch (row.source_type) {
    case 'order':
      return { href: `/orders/${row.source_id}`, label: row.source_number || '-' };
    case 'consignment_report':
      return { href: `/consignment/reports/${row.source_id}`, label: row.source_number || '-', subtitle: 'ยอดขายตัวแทน' };
    case 'department_store_report':
      return { href: `/department-store/reports/${row.source_id}`, label: row.source_number || '-', subtitle: 'ยอดขายห้าง' };
    default:
      return { href: '#', label: row.source_number || '-' };
  }
}

export default function BillingInvoicesPage() {
  // ด่านสิทธิ์ระดับหน้า — เมนูใน Sidebar ซ่อนให้แล้ว แต่ URL ตรงยังเข้าได้
  const { allowed, loading: permLoading } = useAuthGuard('finance.view');
  const [rows, setRows] = useState<InvRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  // ตัวกรอง + แบ่งหน้าอยู่ใน URL ผ่าน hook กลาง (เดิม useState ล้วน รีเฟรชแล้วหาย)
  const filters = useListFilterParams('/invoices/billing', {
    fields: { q: { type: 'text' }, month: { type: 'select' } },
  });
  const search = filters.values.q;
  const month = filters.values.month;
  const page = filters.page;
  const recordsPerPage = filters.limit;
  const [loadTime, setLoadTime] = useState<number | null>(null);


  const fetchData = useCallback(async () => {
    setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams({ type: 'invoice', page: String(page), limit: String(recordsPerPage) });
      if (search) params.set('search', search);
      if (month) params.set('month', month);
      const res = await apiFetch(`/api/invoices?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRows(data.invoices || []);
        setTotal(data.total || 0);
        setLoadTime((Date.now() - t0) / 1000);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, search, month]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const totalPages = Math.ceil(total / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + rows.length, total);

  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไป /dashboard

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader
          icon={<DocumentIcon />}
          title="ใบแจ้งหนี้"
          subtitle="INV-YYYYMM-NNNN"
        />

        <ListFilters
          search={search}
          onSearch={value => filters.set({ q: value })}
          searchPlaceholder="ค้นหาเลขที่, ชื่อ..."
          hasActiveFilters={filters.hasActiveFilters}
          onClear={filters.clearAll}
        >
          <FilterMonth value={month} onChange={value => filters.set({ month: value })} />
        </ListFilters>

        {loading ? (
          <div className="flex justify-center py-16"><DocumentIcon className="w-8 h-8 text-gray-300 animate-pulse" /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-500 dark:text-slate-400 text-sm">ไม่พบใบแจ้งหนี้</div>
        ) : (
          <>
          <div className="data-table-wrap hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">เลขที่</th>
                    <th className="data-th">วันที่ออก</th>
                    <th className="data-th">อ้างอิง</th>
                    <th className="data-th">ลูกค้า</th>
                    <th className="data-th text-right">ยอด (บาท)</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {rows.map(row => {
                    const link = getSourceLink(row);
                    return (
                      <tr key={row.doc_id} className="data-tr">
                        <td className="px-6 py-4">
                          <span className="font-mono text-sm font-medium text-primary">{row.invoice_number}</span>
                          {row.voided_at && (
                            <StatusBadge domain="taxDoc" status="voided" className="ml-1" />
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{formatDate(row.invoice_date)}</td>
                        <td className="px-6 py-4">
                          <Link href={link.href} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                            {link.label} <ExternalLinkIcon className="w-3 h-3" />
                          </Link>
                          {link.subtitle && <div className="text-xs text-gray-400">{link.subtitle}</div>}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{row.customer_name || row.customer?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-right font-medium text-gray-900 dark:text-white">{formatMoney(row.total_amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              setPage={filters.setPage}
              startIdx={startIdx + 1}
              endIdx={endIdx}
              totalRecords={total}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={filters.setLimit}
              loadTime={loadTime}
            />
          </div>

          {/* Mobile card layout */}
          <div className="md:hidden bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 overflow-hidden">
            <div className="divide-y divide-gray-100 dark:divide-slate-700">
              {rows.map(row => {
                const link = getSourceLink(row);
                return (
                  <div key={row.doc_id} className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium text-primary">{row.invoice_number}</span>
                      {row.voided_at && (
                        <StatusBadge domain="taxDoc" status="voided" />
                      )}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-slate-400 mt-1">{formatDate(row.invoice_date)}</div>
                    <div className="mt-1">
                      <Link href={link.href} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                        {link.label} <ExternalLinkIcon className="w-3 h-3" />
                      </Link>
                      {link.subtitle && <span className="text-xs text-gray-400 ml-1">{link.subtitle}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="text-sm text-gray-600 dark:text-slate-300">{row.customer_name || row.customer?.name || '-'}</div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{formatMoney(row.total_amount)} บาท</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              setPage={filters.setPage}
              startIdx={startIdx + 1}
              endIdx={endIdx}
              totalRecords={total}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={filters.setLimit}
              loadTime={loadTime}
            />
          </div>
          </>
        )}
      </div>
    </Layout>
  );
}
