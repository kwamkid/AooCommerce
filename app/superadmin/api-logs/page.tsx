'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCopy } from '@/lib/useCopy';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import Pagination from '@/app/components/Pagination';
import {
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  ArrowUpRight,
  ArrowDownLeft,
  Activity,
  RefreshCw,
} from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';
import { LoadingCard } from '@/components/ui/StateCard';
import { useDebouncedCallback } from '@/lib/useDebounce';

// ─── Types ──────────────────────────────────────────────

interface IntegrationLog {
  id: string;
  company_id: string;
  company_name?: string;
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
  status: string;
  error_message: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reference_label: string | null;
  duration_ms: number | null;
  created_at: string;
}

const ACTION_OPTIONS = [
  { value: '', label: 'ทุก Action' },
  { value: 'webhook_order_status', label: 'Webhook Order Status' },
  { value: 'webhook_order_tracking', label: 'Webhook Tracking' },
  { value: 'webhook_return_refund', label: 'Webhook Refund' },
  { value: 'sync_orders_manual', label: 'Sync Orders (Manual)' },
  { value: 'sync_orders_poll', label: 'Sync Orders (Poll)' },
  { value: 'resync_order', label: 'Resync Order' },
  { value: 'accept_order', label: 'Accept Order' },
  { value: 'push_deal', label: 'Push Deal' },
  { value: 'push_stock', label: 'Push Stock' },
  { value: 'push_price', label: 'Push Price' },
  { value: 'auto_push_stock', label: 'Auto Push Stock' },
  { value: 'auto_push_price', label: 'Auto Push Price' },
  { value: 'auto_push_info', label: 'Auto Push Info' },
  { value: 'shipping_document', label: 'Shipping Label' },
  { value: 'sync_products', label: 'Sync Products' },
  { value: 'auto_export_product', label: 'Auto Export Product' },
  { value: 'auto_credit_note', label: 'Auto Credit Note' },
];

const DIRECTION_STYLES: Record<string, { bg: string; text: string; icon: typeof ArrowUpRight }> = {
  outgoing: { bg: 'bg-blue-900/30', text: 'text-blue-400', icon: ArrowUpRight },
  incoming: { bg: 'bg-emerald-900/30', text: 'text-emerald-400', icon: ArrowDownLeft },
};

const ACTION_LABELS: Record<string, string> = {
  sync_orders_manual: 'Sync Orders (Manual)',
  sync_orders_poll: 'Sync Orders (Auto)',
  webhook_order_status: 'Webhook Status',
  webhook_sync_error: 'Webhook Sync Error',
  webhook_order_tracking: 'Webhook Tracking',
  webhook_return_refund: 'Webhook Refund',
  sync_products: 'Sync Products',
  auto_push_stock: 'Auto Push Stock',
  auto_push_price: 'Auto Push Price',
  auto_push_info: 'Auto Push Info',
  auto_push_category: 'Auto Push Category',
  push_stock: 'Push Stock',
  push_price: 'Push Price',
  shipping_document: 'Shipping Label',
  bulk_shipping_document: 'Shipping Label (Bulk)',
  resync_order: 'Resync Order',
  accept_order: 'Accept Order',
  push_deal: 'Push Deal',
  auto_export_product: 'Auto Export Product',
  auto_credit_note: 'Auto Credit Note',
};

// ─── Main Component ─────────────────────────────────

export default function SuperAdminApiLogs() {
  const { showToast } = useToast();
  const copy = useCopy();

  // State
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<IntegrationLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('');
  const [directionFilter, setDirectionFilter] = useState('all');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const debouncedResetPage = useDebouncedCallback(() => setPage(1), 500);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const autoRefreshRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch logs
  const fetchLogs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const t0 = Date.now();
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (actionFilter) params.set('action', actionFilter);
      if (directionFilter !== 'all') params.set('direction', directionFilter);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/superadmin/integration-logs?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
      setStatusCounts(data.statusCounts || {});
      setLoadTime((Date.now() - t0) / 1000);
      setLastRefresh(new Date());
    } catch {
      if (!silent) showToast('โหลด API Logs ไม่สำเร็จ', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [page, limit, statusFilter, actionFilter, directionFilter, search, showToast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto refresh every 30s — ข้ามตอน tab ไม่ได้เปิดอยู่ กันยิง API ทิ้งเปล่า
  useEffect(() => {
    autoRefreshRef.current = setInterval(() => {
      if (document.hidden) return;
      fetchLogs(true); // silent refresh
    }, 30000);
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    };
  }, [fetchLogs]);

  const handleSearch = (val: string) => {
    setSearch(val);
    debouncedResetPage();
  };

  const copyApiBody = async (body: unknown, id: string) => {
    await copy(JSON.stringify(body, null, 2))
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const copyAllLog = async (log: IntegrationLog) => {
    const parts: string[] = [
      `[${log.status?.toUpperCase()}] ${ACTION_LABELS[log.action] || log.action}`,
      `Time: ${new Date(log.created_at).toLocaleString('th-TH')}`,
      `Company: ${log.company_name || log.company_id}`,
      `Account: ${log.account_name || '-'}`,
      `Direction: ${log.direction}`,
      `API: ${log.method || ''} ${log.api_path || '-'}`,
      `Reference: ${log.reference_label || log.reference_id || '-'}`,
      `Duration: ${log.duration_ms ? `${log.duration_ms}ms` : '-'}`,
    ];
    if (log.error_message) parts.push(`\nError: ${log.error_message}`);
    if (log.request_body != null) parts.push(`\nRequest Body:\n${JSON.stringify(log.request_body, null, 2)}`);
    if (log.response_body != null) parts.push(`\nResponse Body:\n${JSON.stringify(log.response_body, null, 2)}`);
    await copy(parts.join('\n'))
    setCopiedId(`all-${log.id}`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = Math.ceil(total / limit);
  const startIdx = (page - 1) * limit;
  const endIdx = Math.min(page * limit, total);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  const statusTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'success', label: 'Success' },
    { key: 'error', label: 'Error' },
  ];

  const directionTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'outgoing', label: 'ส่งออก' },
    { key: 'incoming', label: 'รับเข้า' },
  ];

  return (
    <SuperAdminLayout title="API Logs" subtitle={`${statusCounts.all || 0} รายการ`}>
      <div className="space-y-4">
        {/* Status + Direction tabs + Auto-refresh indicator */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex flex-wrap gap-2">
            {statusTabs.map(tab => {
              const count = statusCounts[tab.key] || 0;
              const isActive = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setStatusFilter(tab.key); setPage(1); }}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    isActive
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-800 text-slate-400 hover:bg-slate-700 border border-slate-700'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>
          <div className="h-5 w-px bg-slate-700" />
          <div className="flex flex-wrap gap-1">
            {directionTabs.map(tab => {
              const isActive = directionFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => { setDirectionFilter(tab.key); setPage(1); }}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-slate-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-slate-500">
              อัพเดทล่าสุด {lastRefresh.toLocaleTimeString('th-TH')}
            </span>
            <button
              onClick={() => fetchLogs()}
              className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="รีเฟรช"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหา ordersn, ร้านค้า, error..."
              className="w-full pl-9 pr-3 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div className="w-56">
            <FormSelect
              value={actionFilter}
              onChange={val => { setActionFilter(val); setPage(1); }}
              options={ACTION_OPTIONS.filter(o => o.value !== '').map(o => ({ id: o.value, label: o.label }))}
              clearLabel="ทุก Action"
              searchThreshold={99}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingCard />
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Activity className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">ไม่พบ API log</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[32px]" />
                  <col className="w-[100px]" />
                  <col className="w-[110px]" />
                  <col className="w-[155px]" />
                  <col className="w-[120px]" />
                  <col />
                  <col className="w-[50px]" />
                  <col className="w-[65px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/80">
                    <th className="px-3 py-3"></th>
                    <th className="text-left px-2 py-3 text-xs font-medium text-slate-400 uppercase">เวลา</th>
                    <th className="text-left px-2 py-3 text-xs font-medium text-slate-400 uppercase">Company</th>
                    <th className="text-left px-2 py-3 text-xs font-medium text-slate-400 uppercase">Action</th>
                    <th className="text-left px-2 py-3 text-xs font-medium text-slate-400 uppercase">ร้านค้า</th>
                    <th className="text-left px-2 py-3 text-xs font-medium text-slate-400 uppercase">อ้างอิง</th>
                    <th className="text-center px-2 py-3 text-xs font-medium text-slate-400 uppercase">สถานะ</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-slate-400 uppercase">เวลาใช้</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {logs.map(log => {
                    const isExpanded = expandedId === log.id;
                    const dirStyle = DIRECTION_STYLES[log.direction] || DIRECTION_STYLES.outgoing;
                    const DirIcon = dirStyle.icon;
                    const dt = new Date(log.created_at);
                    const dateStr = dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
                    const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <React.Fragment key={log.id}>
                      <tr
                        className="cursor-pointer hover:bg-slate-700/30"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        <td className="px-3 py-2.5">
                          {isExpanded
                            ? <ChevronUp className="w-4 h-4 text-slate-400" />
                            : <ChevronDown className="w-4 h-4 text-slate-400" />}
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="text-sm text-white leading-tight truncate">{dateStr}</p>
                          <p className="text-xs text-slate-400 leading-tight">{timeStr}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="text-sm text-slate-300 truncate" title={log.company_name}>{log.company_name || '-'}</p>
                        </td>
                        <td className="px-2 py-2.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md font-medium whitespace-nowrap ${dirStyle.bg} ${dirStyle.text}`}>
                            <DirIcon className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{ACTION_LABELS[log.action] || log.action}</span>
                          </span>
                        </td>
                        <td className="px-2 py-2.5">
                          <p className="text-sm text-slate-300 line-clamp-2 leading-tight" title={log.account_name || ''}>{log.account_name || '-'}</p>
                        </td>
                        <td className="px-2 py-2.5 overflow-hidden">
                          {log.reference_id && (
                            <p className="text-xs text-slate-200 truncate leading-tight font-mono">{log.reference_id}</p>
                          )}
                          {log.reference_label && (
                            <p className="text-xs text-slate-400 truncate leading-tight" title={log.reference_label}>{log.reference_label}</p>
                          )}
                          {!log.reference_id && !log.reference_label && (
                            <p className="text-xs text-slate-500">-</p>
                          )}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          {log.status === 'success' ? (
                            <CheckCircle2 className="w-4 h-4 text-green-400 inline-block" />
                          ) : log.status === 'error' ? (
                            <XCircle className="w-4 h-4 text-red-400 inline-block" />
                          ) : (
                            <Clock className="w-4 h-4 text-yellow-400 inline-block" />
                          )}
                        </td>
                        <td className="text-right text-slate-400 text-xs px-3 py-2.5">
                          {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                        </td>
                      </tr>
                      {isExpanded && (
                      <tr key={`${log.id}-detail`}>
                        <td colSpan={8} className="p-0">
                            <div className="px-4 pb-4 pt-1 bg-slate-900/50 border-t border-slate-700/50">
                              <div className="flex items-start justify-between mb-3">
                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs flex-1 min-w-0">
                                  <div>
                                    <span className="text-slate-400">API Path</span>
                                    <p className="font-mono text-white break-all">{log.method} {log.api_path || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">HTTP Status</span>
                                    <p className="text-white">{log.http_status || '-'}</p>
                                  </div>
                                  <div className="col-span-2 lg:col-span-1">
                                    <span className="text-slate-400">Reference</span>
                                    <p className="text-white break-all">{log.reference_label || log.reference_id || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="text-slate-400">Company ID</span>
                                    <p className="font-mono text-white text-[11px] break-all">{log.company_id}</p>
                                  </div>
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); copyAllLog(log); }}
                                  className="ml-3 flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 border border-violet-500/30 transition-colors"
                                >
                                  {copiedId === `all-${log.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                  {copiedId === `all-${log.id}` ? 'Copied!' : 'Copy All'}
                                </button>
                              </div>

                              {log.error_message && (
                                <div className="mb-3 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                                  <p className="text-xs font-medium text-red-400">Error</p>
                                  <p className="text-xs text-red-300 mt-0.5 break-all">{log.error_message}</p>
                                </div>
                              )}

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-slate-400">Request Body</span>
                                    {log.request_body != null && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); copyApiBody(log.request_body, `req-${log.id}`); }}
                                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-400 transition-colors"
                                      >
                                        {copiedId === `req-${log.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        {copiedId === `req-${log.id}` ? 'Copied!' : 'Copy'}
                                      </button>
                                    )}
                                  </div>
                                  <pre className="text-xs bg-slate-950 text-blue-400 p-3 rounded-lg overflow-x-auto max-h-48 border border-slate-700/50">
                                    {log.request_body != null ? JSON.stringify(log.request_body, null, 2) : '(none)'}
                                  </pre>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-medium text-slate-400">Response Body</span>
                                    {log.response_body != null && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); copyApiBody(log.response_body, `res-${log.id}`); }}
                                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-400 transition-colors"
                                      >
                                        {copiedId === `res-${log.id}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        {copiedId === `res-${log.id}` ? 'Copied!' : 'Copy'}
                                      </button>
                                    )}
                                  </div>
                                  <pre className="text-xs bg-slate-950 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48 border border-slate-700/50">
                                    {log.response_body != null ? JSON.stringify(log.response_body, null, 2) : '(none)'}
                                  </pre>
                                </div>
                              </div>
                            </div>
                        </td>
                      </tr>
                      )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {logs.map(log => {
                const isExpanded = expandedId === log.id;
                const dirStyle = DIRECTION_STYLES[log.direction] || DIRECTION_STYLES.outgoing;
                const DirIcon = dirStyle.icon;
                const dt = new Date(log.created_at);
                const dateStr = dt.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
                const timeStr = dt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                return (
                  <div key={log.id} className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
                    <div className="p-4 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : log.id)}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-md font-medium ${dirStyle.bg} ${dirStyle.text}`}>
                            <DirIcon className="w-3 h-3" />
                            {ACTION_LABELS[log.action] || log.action}
                          </span>
                          <p className="text-xs text-slate-400 mt-1">{dateStr} {timeStr}</p>
                        </div>
                        {log.status === 'success' ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="truncate">{log.company_name || '-'}</span>
                        <span className="truncate ml-2">{log.account_name || '-'}</span>
                      </div>
                      {log.reference_label && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{log.reference_label}</p>
                      )}
                    </div>
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-slate-700/50 pt-2 space-y-2">
                        <div className="flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); copyAllLog(log); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 border border-violet-500/30 transition-colors"
                          >
                            {copiedId === `all-${log.id}` ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {copiedId === `all-${log.id}` ? 'Copied!' : 'Copy All'}
                          </button>
                        </div>
                        {log.error_message && (
                          <div className="px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                            <p className="text-xs text-red-300 break-all">{log.error_message}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-xs font-medium text-slate-400">Request</span>
                          <pre className="text-xs bg-slate-950 text-blue-400 p-2 rounded overflow-x-auto max-h-32 border border-slate-700/50 mt-1">
                            {log.request_body != null ? JSON.stringify(log.request_body, null, 2) : '(none)'}
                          </pre>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-400">Response</span>
                          <pre className="text-xs bg-slate-950 text-green-400 p-2 rounded overflow-x-auto max-h-32 border border-slate-700/50 mt-1">
                            {log.response_body != null ? JSON.stringify(log.response_body, null, 2) : '(none)'}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalRecords={total}
              startIdx={startIdx}
              endIdx={endIdx}
              recordsPerPage={limit}
              setRecordsPerPage={setLimit}
              setPage={setPage}
              loadTime={loadTime}
            />
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
}
