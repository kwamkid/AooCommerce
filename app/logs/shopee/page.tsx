'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import Pagination from '@/app/components/Pagination';
import {
  Search,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  ScrollText,
} from 'lucide-react';

interface IntegrationLog {
  id: string;
  company_id: string;
  integration: string;
  account_id: string | null;
  account_name: string | null;
  direction: 'outgoing' | 'incoming';
  action: string;
  method: string | null;
  api_path: string | null;
  request_body: unknown;
  response_body: unknown;
  http_status: number | null;
  status: 'success' | 'error' | 'pending';
  error_message: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reference_label: string | null;
  duration_ms: number | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  sync_orders_manual: 'ดึงออเดอร์ (Manual)',
  sync_orders_poll: 'ดึงออเดอร์ (Auto)',
  webhook_order_status: 'Webhook อัปเดตสถานะ',
  sync_products: 'sync_products',
};

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  const d = new Date(dateStr);
  return {
    date: d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }),
    time: d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// --- Extract Shopee status from webhook payload or reference_label ---
const SHOPEE_STATUS_MAP: Record<string, { label: string; color: string }> = {
  UNPAID:         { label: 'รอชำระ',       color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  READY_TO_SHIP:  { label: 'พร้อมส่ง',     color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  PROCESSED:      { label: 'กำลังดำเนินการ', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  SHIPPED:        { label: 'จัดส่งแล้ว',   color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  COMPLETED:      { label: 'สำเร็จ',       color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  CANCELLED:      { label: 'ยกเลิก',       color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  IN_CANCEL:      { label: 'กำลังยกเลิก',  color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  INVOICE_PENDING:{ label: 'รอออกใบแจ้งหนี้', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
};

function extractShopeeStatus(log: IntegrationLog): string | null {
  // Try from request_body.data.status (webhook payload)
  if (log.request_body && typeof log.request_body === 'object') {
    const body = log.request_body as Record<string, unknown>;
    const data = body.data as Record<string, unknown> | undefined;
    if (data?.status && typeof data.status === 'string') {
      return data.status;
    }
  }
  // Try from reference_label "Order XXX → STATUS"
  if (log.reference_label) {
    const match = log.reference_label.match(/→\s*(\S+)$/);
    if (match) return match[1];
  }
  return null;
}

function getOrderSnFromLabel(label: string | null): string | null {
  if (!label) return null;
  // "Order 123 → SHIPPED" -> "Order 123"  or  "Order 123" -> "Order 123"
  const match = label.match(/^(Order\s+\S+)/);
  return match ? match[1] : label;
}

export default function ShopeeLogsPage() {
  const { userProfile } = useAuth();
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [directionFilter, setDirectionFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateValueType>({ startDate: null, endDate: null });
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [statusCounts, setStatusCounts] = useState({ all: 0, success: 0, error: 0 });
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loadTime, setLoadTime] = useState<number | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    const startTime = performance.now();
    try {
      const params = new URLSearchParams({
        integration: 'shopee',
        page: page.toString(),
        limit: recordsPerPage.toString(),
      });
      if (directionFilter !== 'all') params.set('direction', directionFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search) params.set('search', search);
      if (dateRange?.startDate) params.set('date_from', String(dateRange.startDate));
      if (dateRange?.endDate) params.set('date_to', String(dateRange.endDate));

      const res = await apiFetch(`/api/logs?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
        setTotalRecords(data.pagination.total);
        setTotalPages(data.pagination.totalPages);
        setStatusCounts(data.statusCounts);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoadTime((performance.now() - startTime) / 1000);
      setLoading(false);
    }
  }, [page, recordsPerPage, directionFilter, statusFilter, search, dateRange]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSearch = () => {
    setSearch(searchInput);
    setPage(1);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + recordsPerPage, totalRecords);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
              <ScrollText className="w-8 h-8 text-[#F4511E]" />
              Shopee Logs
            </h1>
            <p className="text-gray-600 dark:text-slate-400 mt-1">ประวัติการเชื่อมต่อกับ Shopee</p>
          </div>
          <button
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </button>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-3 gap-4">
          <button
            onClick={() => { setStatusFilter('all'); setPage(1); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              statusFilter === 'all'
                ? 'border-[#F4511E] bg-[#F4511E]/5 dark:bg-[#F4511E]/10'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300'
            }`}
          >
            <p className="text-sm text-gray-500 dark:text-slate-400">ทั้งหมด</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{statusCounts.all}</p>
          </button>
          <button
            onClick={() => { setStatusFilter('success'); setPage(1); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              statusFilter === 'success'
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300'
            }`}
          >
            <p className="text-sm text-gray-500 dark:text-slate-400">สำเร็จ</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{statusCounts.success}</p>
          </button>
          <button
            onClick={() => { setStatusFilter('error'); setPage(1); }}
            className={`p-4 rounded-xl border text-left transition-all ${
              statusFilter === 'error'
                ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-gray-300'
            }`}
          >
            <p className="text-sm text-gray-500 dark:text-slate-400">ผิดพลาด</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{statusCounts.error}</p>
          </button>
        </div>

        {/* Filters */}
        <div className="data-filter-card">
          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="ค้นหา order, error, action..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                onBlur={handleSearch}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#F4511E] focus:border-transparent"
              />
            </div>

            {/* Direction pills */}
            <div className="flex rounded-lg border border-gray-300 dark:border-slate-600 overflow-hidden">
              {[
                { value: 'all', label: 'ทั้งหมด' },
                { value: 'outgoing', label: 'ส่งออก' },
                { value: 'incoming', label: 'รับเข้า' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => { setDirectionFilter(opt.value); setPage(1); }}
                  className={`px-3 py-2 text-sm font-medium transition-colors ${
                    directionFilter === opt.value
                      ? 'bg-[#F4511E] text-white'
                      : 'bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Date range */}
            <div className="w-64">
              <DateRangePicker value={dateRange} onChange={(val) => { setDateRange(val); setPage(1); }} />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="data-table-wrap">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-[#F4511E]" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-20 text-gray-500 dark:text-slate-400">
              <Clock className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">ยังไม่มี Log</p>
              <p className="text-sm mt-1">Log จะปรากฏเมื่อมีการ Sync หรือรับ Webhook จาก Shopee</p>
            </div>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="data-table-fixed">
                  <thead className="data-thead">
                    <tr>
                      <th className="data-th w-6 pl-3 pr-1"></th>
                      <th className="data-th px-3">เวลา</th>
                      <th className="data-th px-3">ทิศทาง</th>
                      <th className="data-th">Action</th>
                      <th className="data-th">ร้านค้า</th>
                      <th className="data-th">อ้างอิง</th>
                      <th className="data-th">สถานะที่อัพเดท</th>
                      <th className="data-th text-center">ผลลัพธ์</th>
                      <th className="data-th text-right">เวลาใช้</th>
                    </tr>
                  </thead>
                  <tbody className="data-tbody">
                    {logs.map((log) => {
                      const dt = formatDateTime(log.created_at);
                      const isExpanded = expandedRow === log.id;
                      return (
                        <LogRow
                          key={log.id}
                          log={log}
                          dt={dt}
                          isExpanded={isExpanded}
                          onToggle={() => setExpandedRow(isExpanded ? null : log.id)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden divide-y divide-gray-200 dark:divide-slate-700">
                {logs.map((log) => {
                  const dt = formatDateTime(log.created_at);
                  const isExpanded = expandedRow === log.id;
                  return (
                    <MobileLogCard
                      key={log.id}
                      log={log}
                      dt={dt}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedRow(isExpanded ? null : log.id)}
                    />
                  );
                })}
              </div>
            </>
          )}

          {/* Pagination */}
          {totalRecords > 0 && (
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalRecords={totalRecords}
              startIdx={startIdx}
              endIdx={endIdx}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={setRecordsPerPage}
              setPage={setPage}
              loadTime={loadTime}
            />
          )}
        </div>
      </div>
    </Layout>
  );
}

// --- Desktop Row ---
function LogRow({
  log,
  dt,
  isExpanded,
  onToggle,
}: {
  log: IntegrationLog;
  dt: { date: string; time: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const shopeeStatus = extractShopeeStatus(log);
  const statusInfo = shopeeStatus ? SHOPEE_STATUS_MAP[shopeeStatus] : null;
  const orderLabel = getOrderSnFromLabel(log.reference_label);

  return (
    <>
      <tr className="data-tr cursor-pointer" onClick={onToggle}>
        <td className="pl-3 pr-1 py-3">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <div className="text-sm text-gray-900 dark:text-white">{dt.date}</div>
          <div className="text-xs text-gray-500 dark:text-slate-400">{dt.time}</div>
        </td>
        <td className="px-3 py-3 whitespace-nowrap">
          <DirectionBadge direction={log.direction} />
        </td>
        <td className="px-6 py-4">
          <span className="text-gray-900 dark:text-white">{getActionLabel(log.action)}</span>
        </td>
        <td className="px-6 py-4">
          <span className="text-gray-600 dark:text-slate-300">{log.account_name || '-'}</span>
        </td>
        <td className="px-6 py-4">
          {log.reference_type === 'order' && log.reference_id ? (
            <OrderLink referenceId={log.reference_id} label={orderLabel || log.reference_id} />
          ) : log.reference_label ? (
            <span className="text-blue-600 dark:text-blue-400">{log.reference_label}</span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
        <td className="px-6 py-4">
          {shopeeStatus ? (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo?.color || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
              {statusInfo?.label || shopeeStatus}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </td>
        <td className="px-6 py-4 text-center">
          <StatusIcon status={log.status} />
        </td>
        <td className="px-6 py-4 text-right">
          <span className="text-gray-500 dark:text-slate-400">{formatDuration(log.duration_ms)}</span>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="px-6 py-4 bg-gray-50 dark:bg-slate-900/50">
            <LogDetail log={log} />
          </td>
        </tr>
      )}
    </>
  );
}

// --- Mobile Card ---
function MobileLogCard({
  log,
  dt,
  isExpanded,
  onToggle,
}: {
  log: IntegrationLog;
  dt: { date: string; time: string };
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const shopeeStatus = extractShopeeStatus(log);
  const statusInfo = shopeeStatus ? SHOPEE_STATUS_MAP[shopeeStatus] : null;
  const orderLabel = getOrderSnFromLabel(log.reference_label);

  return (
    <div className="p-4">
      <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <DirectionBadge direction={log.direction} />
            <StatusIcon status={log.status} />
            <span className="text-xs text-gray-500 dark:text-slate-400">{formatDuration(log.duration_ms)}</span>
          </div>
          <p className="text-sm font-medium text-gray-900 dark:text-white">{getActionLabel(log.action)}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-gray-500 dark:text-slate-400">{dt.date} {dt.time}</span>
            {log.account_name && (
              <span className="text-xs text-gray-500 dark:text-slate-400">• {log.account_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1.5">
            {log.reference_type === 'order' && log.reference_id ? (
              <OrderLink referenceId={log.reference_id} label={orderLabel || log.reference_id} />
            ) : log.reference_label ? (
              <span className="text-xs text-blue-600 dark:text-blue-400">{log.reference_label}</span>
            ) : null}
            {shopeeStatus && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo?.color || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                {statusInfo?.label || shopeeStatus}
              </span>
            )}
          </div>
          {log.error_message && (
            <p className="text-xs text-red-500 mt-1 truncate">{log.error_message}</p>
          )}
        </div>
        <div className="ml-2 flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </div>
      </div>
      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-slate-700">
          <LogDetail log={log} />
        </div>
      )}
    </div>
  );
}

// --- Shared Components ---
function DirectionBadge({ direction }: { direction: 'outgoing' | 'incoming' }) {
  if (direction === 'outgoing') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        <ArrowUpRight className="w-3 h-3 flex-shrink-0" />
        ส่งออก
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <ArrowDownLeft className="w-3 h-3 flex-shrink-0" />
      รับเข้า
    </span>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') {
    return <CheckCircle2 className="w-5 h-5 text-green-500 inline-block" />;
  }
  if (status === 'error') {
    return <XCircle className="w-5 h-5 text-red-500 inline-block" />;
  }
  return <Clock className="w-5 h-5 text-yellow-500 inline-block" />;
}

function OrderLink({ referenceId, label }: { referenceId: string; label: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    try {
      const orderNumber = `SP-${referenceId}`;
      const res = await apiFetch(`/api/orders?search=${encodeURIComponent(orderNumber)}&limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.orders?.length > 0) {
          window.open(`/orders/${data.orders[0].id}`, '_blank');
          return;
        }
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  return (
    <a
      href="#"
      onClick={handleClick}
      className={`inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline ${loading ? 'opacity-50' : ''}`}
    >
      {label}
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <ExternalLink className="w-3 h-3" />
      )}
    </a>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
      title="คัดลอก"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-gray-400 dark:text-slate-500" />
      )}
    </button>
  );
}

function LogDetail({ log }: { log: IntegrationLog }) {
  return (
    <div className="space-y-3 text-sm">
      {/* Meta info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {log.api_path && (
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">API Path</p>
            <p className="text-gray-900 dark:text-white font-mono text-xs">{log.method && `${log.method} `}{log.api_path}</p>
          </div>
        )}
        {log.http_status != null && (
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">HTTP Status</p>
            <p className="text-gray-900 dark:text-white font-mono text-xs">{log.http_status}</p>
          </div>
        )}
        {log.reference_id && (
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Reference</p>
            <p className="text-gray-900 dark:text-white text-xs">{log.reference_id}</p>
          </div>
        )}
        {log.duration_ms != null && (
          <div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Duration</p>
            <p className="text-gray-900 dark:text-white text-xs">{formatDuration(log.duration_ms)}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {log.error_message && (
        <div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Error</p>
          <p className="text-red-600 dark:text-red-400 text-xs bg-red-50 dark:bg-red-900/20 rounded px-2 py-1">{log.error_message}</p>
        </div>
      )}

      {/* Request Body */}
      {log.request_body != null && (
        <div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Request</p>
          <div className="relative">
            <div className="absolute top-1.5 right-1.5 z-10">
              <CopyButton text={JSON.stringify(log.request_body, null, 2)} />
            </div>
            <pre className="text-xs bg-gray-100 dark:bg-slate-900 rounded p-2 pr-8 overflow-x-auto max-h-48 text-gray-800 dark:text-slate-300">
              {JSON.stringify(log.request_body, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Response Body */}
      {log.response_body != null && (
        <div>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-0.5">Response</p>
          <div className="relative">
            <div className="absolute top-1.5 right-1.5 z-10">
              <CopyButton text={JSON.stringify(log.response_body, null, 2)} />
            </div>
            <pre className="text-xs bg-gray-100 dark:bg-slate-900 rounded p-2 pr-8 overflow-x-auto max-h-48 text-gray-800 dark:text-slate-300">
              {JSON.stringify(log.response_body, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
