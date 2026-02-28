'use client';

import { useState, useEffect, useCallback } from 'react';
import SuperAdminLayout from '../components/SuperAdminLayout';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import {
  Search,
  Radio,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  Copy,
  Check,
} from 'lucide-react';
import FormSelect from '@/components/ui/FormSelect';

interface WebhookLog {
  id: string;
  shop_id: number;
  company_id: string | null;
  account_id: string | null;
  push_code: number;
  push_label: string | null;
  raw_payload: Record<string, unknown>;
  signature: string | null;
  signature_valid: boolean | null;
  processing_status: string;
  processing_error: string | null;
  processing_duration_ms: number | null;
  processed_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; icon: typeof CheckCircle2 }> = {
  processed: { bg: 'bg-green-900/30', text: 'text-green-400', icon: CheckCircle2 },
  failed: { bg: 'bg-red-900/30', text: 'text-red-400', icon: XCircle },
  pending: { bg: 'bg-yellow-900/30', text: 'text-yellow-400', icon: Clock },
  processing: { bg: 'bg-blue-900/30', text: 'text-blue-400', icon: Loader2 },
  skipped: { bg: 'bg-slate-700', text: 'text-slate-400', icon: SkipForward },
};

const PUSH_CODE_OPTIONS = [
  { value: '', label: 'ทุกประเภท' },
  { value: '0', label: 'Shop Auth (0)' },
  { value: '3', label: 'Order Status (3)' },
  { value: '4', label: 'Order Tracking (4)' },
  { value: '7', label: 'Banned Item (7)' },
  { value: '8', label: 'Item Stock (8)' },
  { value: '14', label: 'Return/Refund (14)' },
];

export default function SuperAdminWebhooks() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [codeFilter, setCodeFilter] = useState('');
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (codeFilter) params.set('code', codeFilter);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/superadmin/webhooks?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.pagination?.total || 0);
      setStatusCounts(data.statusCounts || {});
    } catch {
      showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, codeFilter, search, showToast]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => setPage(1), 500));
  };

  const copyPayload = async (log: WebhookLog) => {
    await navigator.clipboard.writeText(JSON.stringify(log.raw_payload, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalPages = Math.ceil(total / limit);

  const statusTabs = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'processed', label: 'Processed' },
    { key: 'failed', label: 'Failed' },
    { key: 'skipped', label: 'Skipped' },
    { key: 'pending', label: 'Pending' },
  ];

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('th-TH', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  return (
    <SuperAdminLayout title="Shopee Webhooks" subtitle={`ทั้งหมด ${statusCounts.all || 0} รายการ`}>
      <div className="space-y-4">
        {/* Status tabs */}
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
                <span className={`ml-1.5 text-xs ${isActive ? 'text-white/80' : 'text-slate-500'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหา ordersn, shop_id..."
              className="w-full pl-9 pr-3 py-2 border border-slate-600 rounded-lg bg-slate-800 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
          <div className="w-52">
            <FormSelect
              value={codeFilter}
              onChange={val => { setCodeFilter(val); setPage(1); }}
              options={PUSH_CODE_OPTIONS.filter(o => o.value !== '').map(o => ({ id: o.value, label: o.label }))}
              clearLabel="ทุกประเภท"
              searchThreshold={99}
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-16">
            <Radio className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">ไม่พบ webhook log</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700/50 bg-slate-800/80">
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase w-8"></th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">เวลา</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Shop ID</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Push Type</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-slate-400 uppercase">Status</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-slate-400 uppercase">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {logs.map(log => {
                    const isExpanded = expandedId === log.id;
                    const style = STATUS_STYLES[log.processing_status] || STATUS_STYLES.skipped;
                    const StatusIcon = style.icon;
                    return (
                      <tr key={log.id}>
                        <td colSpan={6} className="p-0">
                          <div
                            className="flex items-center px-4 py-3 cursor-pointer hover:bg-slate-700/30"
                            onClick={() => setExpandedId(isExpanded ? null : log.id)}
                          >
                            <div className="w-8 flex-shrink-0">
                              {isExpanded
                                ? <ChevronUp className="w-4 h-4 text-slate-400" />
                                : <ChevronDown className="w-4 h-4 text-slate-400" />}
                            </div>
                            <div className="flex-1 min-w-[140px] text-white">
                              {formatTime(log.created_at)}
                            </div>
                            <div className="w-[100px] font-mono text-slate-300">
                              {log.shop_id}
                            </div>
                            <div className="flex-1">
                              <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium bg-violet-900/30 text-violet-400">
                                {log.push_label || `code_${log.push_code}`}
                              </span>
                            </div>
                            <div className="w-[100px]">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${style.bg} ${style.text}`}>
                                <StatusIcon className="w-3 h-3" />
                                {log.processing_status}
                              </span>
                            </div>
                            <div className="w-[80px] text-right text-slate-400">
                              {log.processing_duration_ms ? `${log.processing_duration_ms}ms` : '-'}
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="px-4 pb-4 pt-1 bg-slate-900/50 border-t border-slate-700/50">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                                <div>
                                  <span className="text-slate-400">Company ID</span>
                                  <p className="font-mono text-white truncate">{log.company_id || '-'}</p>
                                </div>
                                <div>
                                  <span className="text-slate-400">Account ID</span>
                                  <p className="font-mono text-white truncate">{log.account_id || '-'}</p>
                                </div>
                                <div>
                                  <span className="text-slate-400">Signature</span>
                                  <p className={`font-medium ${
                                    log.signature_valid === true ? 'text-green-400' :
                                    log.signature_valid === false ? 'text-red-400' : 'text-slate-500'
                                  }`}>
                                    {log.signature_valid === true ? 'Valid' : log.signature_valid === false ? 'Invalid' : 'N/A'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-slate-400">Processed At</span>
                                  <p className="text-white">{log.processed_at ? formatTime(log.processed_at) : '-'}</p>
                                </div>
                              </div>

                              {log.processing_error && (
                                <div className="mb-3 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                                  <p className="text-xs font-medium text-red-400">Error</p>
                                  <p className="text-xs text-red-300 mt-0.5">{log.processing_error}</p>
                                </div>
                              )}

                              <div className="relative">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-medium text-slate-400">Raw Payload</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); copyPayload(log); }}
                                    className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-400 transition-colors"
                                  >
                                    {copiedId === log.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                    {copiedId === log.id ? 'Copied!' : 'Copy'}
                                  </button>
                                </div>
                                <pre className="text-xs bg-slate-950 text-green-400 p-3 rounded-lg overflow-x-auto max-h-64 border border-slate-700/50">
                                  {JSON.stringify(log.raw_payload, null, 2)}
                                </pre>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {logs.map(log => {
                const isExpanded = expandedId === log.id;
                const style = STATUS_STYLES[log.processing_status] || STATUS_STYLES.skipped;
                const StatusIcon = style.icon;
                return (
                  <div
                    key={log.id}
                    className="bg-slate-800/50 rounded-lg border border-slate-700/50 overflow-hidden"
                  >
                    <div
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-medium text-white">Shop {log.shop_id}</p>
                          <p className="text-xs text-slate-400">{formatTime(log.created_at)}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium flex-shrink-0 ${style.bg} ${style.text}`}>
                          <StatusIcon className="w-3 h-3" />
                          {log.processing_status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium bg-violet-900/30 text-violet-400">
                          {log.push_label || `code_${log.push_code}`}
                        </span>
                        <span className="text-xs text-slate-500">
                          {log.processing_duration_ms ? `${log.processing_duration_ms}ms` : ''}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-700/50">
                        {log.processing_error && (
                          <div className="mb-3 px-3 py-2 bg-red-900/20 border border-red-800/50 rounded-lg">
                            <p className="text-xs text-red-300">{log.processing_error}</p>
                          </div>
                        )}
                        <div className="relative">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-400">Payload</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); copyPayload(log); }}
                              className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-400"
                            >
                              {copiedId === log.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copiedId === log.id ? 'Copied!' : 'Copy'}
                            </button>
                          </div>
                          <pre className="text-xs bg-slate-950 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48 border border-slate-700/50">
                            {JSON.stringify(log.raw_payload, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-slate-400">
                  แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {total}
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-slate-600 rounded-lg disabled:opacity-50 text-slate-300 hover:bg-slate-700"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border border-slate-600 rounded-lg disabled:opacity-50 text-slate-300 hover:bg-slate-700"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SuperAdminLayout>
  );
}
