'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import SearchInput from '@/components/ui/SearchInput';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  ClipboardList, Loader2, RefreshCw, CheckCircle2,
  FileText, AlertCircle, Clock, BadgeCheck, Copy,
} from 'lucide-react';
import Pagination from '@/app/components/Pagination';

interface ConsignmentReport {
  id: string;
  report_number: string;
  period_year: number;
  period_month: number;
  status: string;
  total_qty_sold: number;
  our_amount: number;
  due_date: string | null;
  report_token: string | null;
  created_at: string;
  customer: { id: string; name: string; customer_code: string | null } | null;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  draft:    { label: 'รอรายงาน',   color: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-100 dark:bg-orange-900/40' },
  received: { label: 'รับแล้ว',    color: 'text-blue-700 dark:text-blue-300',     bg: 'bg-blue-100 dark:bg-blue-900/40' },
  invoiced: { label: 'ออก invoice', color: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-100 dark:bg-purple-900/40' },
  billed:   { label: 'วางบิลแล้ว', color: 'text-indigo-700 dark:text-indigo-300', bg: 'bg-indigo-100 dark:bg-indigo-900/40' },
  paid:     { label: 'ชำระแล้ว',   color: 'text-green-700 dark:text-green-300',   bg: 'bg-green-100 dark:bg-green-900/40' },
  overdue:  { label: 'เกินกำหนด',  color: 'text-red-700 dark:text-red-300',       bg: 'bg-red-100 dark:bg-red-900/40' },
};

const STATUS_TABS = [
  { key: 'all',      label: 'ทั้งหมด' },
  { key: 'draft',    label: 'รอรายงาน' },
  { key: 'received', label: 'รับแล้ว' },
  { key: 'invoiced', label: 'ออก invoice' },
  { key: 'paid',     label: 'ชำระแล้ว' },
  { key: 'overdue',  label: 'เกินกำหนด' },
];

const THAI_MONTHS = ['', 'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

const formatPeriod = (year: number, month: number) =>
  `${THAI_MONTHS[month]} ${year + 543}`;

const formatAmount = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ConsignmentReportsPage() {
  const { showToast } = useToast();

  const [activeStatus, setActiveStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [reports, setReports] = useState<ConsignmentReport[]>([]);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const recordsPerPage = 20;

  const fetchReports = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true); else setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(currentPage),
        limit: String(recordsPerPage),
      });
      if (activeStatus !== 'all') params.set('status', activeStatus);
      if (search.trim()) params.set('search', search.trim());

      const res = await apiFetch(`/api/consignment/reports?${params}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      setReports(data.reports || []);
      setStatusCounts(data.status_counts || {});
      setTotalPages(data.total_pages || 1);
      setTotalRecords(data.total || 0);
    } catch {
      showToast('ไม่สามารถโหลดข้อมูลได้', 'error');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [activeStatus, search, currentPage]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const copyPortalReportLink = (report: ConsignmentReport) => {
    if (!report.report_token) return;
    const url = `${window.location.origin}/portal/consignment/${report.customer?.id}?report=${report.report_token}`;
    navigator.clipboard.writeText(url).then(() => showToast('คัดลอกลิงก์แล้ว', 'success'));
  };

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardList className="w-6 h-6 text-amber-500" />
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">รายงานฝากขาย</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">รายงานยอดขายจากตัวแทน consignment</p>
            </div>
          </div>
          <button
            onClick={() => fetchReports(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>

        {/* Status Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all'
              ? Object.values(statusCounts).reduce((a, b) => a + b, 0)
              : (statusCounts[tab.key] || 0);
            return (
              <button
                key={tab.key}
                onClick={() => { setActiveStatus(tab.key); setCurrentPage(1); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  activeStatus === tab.key
                    ? 'bg-amber-500 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeStatus === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 dark:bg-slate-600 text-gray-600 dark:text-gray-300'
                  }`}>{count}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <SearchInput
          value={search}
          onChange={(v) => { setSearch(v); setCurrentPage(1); }}
          placeholder="ค้นหาเลขรายงาน หรือชื่อตัวแทน..."
        />

        {/* List */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-gray-400 dark:text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>ไม่พบรายงาน</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(report => {
              const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.draft;
              return (
                <div key={report.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold text-gray-900 dark:text-white">
                          {report.report_number}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color} ${cfg.bg}`}>
                          {cfg.label}
                        </span>
                        {report.status === 'overdue' && (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </div>
                      <p className="text-sm text-gray-700 dark:text-gray-300 mt-1 font-medium">
                        {report.customer?.name || '-'}
                        {report.customer?.customer_code && (
                          <span className="text-xs text-gray-400 ml-1">({report.customer.customer_code})</span>
                        )}
                      </p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatPeriod(report.period_year, report.period_month)}
                        </span>
                        {report.due_date && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            ครบกำหนด {new Date(report.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {report.total_qty_sold} ชิ้น
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        ฿{formatAmount(report.our_amount)}
                      </span>
                      <div className="flex items-center gap-1">
                        {report.status === 'draft' && report.report_token && (
                          <button
                            onClick={() => copyPortalReportLink(report)}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-lg transition-colors"
                            title="คัดลอกลิงก์ส่งให้ตัวแทน"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            ส่งลิงก์
                          </button>
                        )}
                        {report.status === 'received' && (
                          <button
                            onClick={async () => {
                              const res = await apiFetch(`/api/consignment/reports/${report.id}`, {
                                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'confirm' }),
                              });
                              if (res.ok) { showToast('ยืนยันรายงานแล้ว', 'success'); fetchReports(true); }
                              else showToast('เกิดข้อผิดพลาด', 'error');
                            }}
                            className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 rounded-lg transition-colors"
                          >
                            <BadgeCheck className="w-3.5 h-3.5" />
                            ยืนยัน
                          </button>
                        )}
                        {report.status === 'paid' && (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalRecords}
            recordsPerPage={recordsPerPage}
            onPageChange={setCurrentPage}
          />
        )}
      </div>
    </Layout>
  );
}
