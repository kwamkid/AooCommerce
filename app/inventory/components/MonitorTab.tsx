'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker, { DateValueType } from '@/components/ui/DateRangePicker';
import FormSelect from '@/components/ui/FormSelect';
import Pagination from '@/app/components/Pagination';
import {
  Loader2, RefreshCw, Package, ArrowDownToLine, ArrowUpFromLine,
  ArrowLeftRight, Bookmark, BookmarkX, Settings2, RotateCcw,
} from 'lucide-react';
import {
  Transaction, TransactionType, WarehouseItem,
  TYPE_CONFIG, POSITIVE_TYPES, NEGATIVE_TYPES,
  formatDate, formatTime, formatDateValue,
  productDisplayName, productSubtitle,
} from './types';

interface MonitorTabProps {
  warehouses: WarehouseItem[];
}

interface SummaryCard {
  type: TransactionType;
  label: string;
  count: number;
  totalQty: number;
  icon: React.ReactNode;
  bgClass: string;
  textClass: string;
  borderClass: string;
}

const TYPE_ICONS: Record<TransactionType, React.ReactNode> = {
  in: <ArrowDownToLine className="w-5 h-5" />,
  out: <ArrowUpFromLine className="w-5 h-5" />,
  reserve: <Bookmark className="w-5 h-5" />,
  unreserve: <BookmarkX className="w-5 h-5" />,
  transfer_in: <ArrowLeftRight className="w-5 h-5" />,
  transfer_out: <ArrowLeftRight className="w-5 h-5" />,
  adjust: <Settings2 className="w-5 h-5" />,
  return: <RotateCcw className="w-5 h-5" />,
};

const CARD_STYLES: Record<TransactionType, { bgClass: string; textClass: string; borderClass: string }> = {
  in: { bgClass: 'bg-green-50 dark:bg-green-900/20', textClass: 'text-green-700 dark:text-green-400', borderClass: 'border-green-200 dark:border-green-800' },
  out: { bgClass: 'bg-red-50 dark:bg-red-900/20', textClass: 'text-red-700 dark:text-red-400', borderClass: 'border-red-200 dark:border-red-800' },
  reserve: { bgClass: 'bg-yellow-50 dark:bg-yellow-900/20', textClass: 'text-yellow-700 dark:text-yellow-400', borderClass: 'border-yellow-200 dark:border-yellow-800' },
  unreserve: { bgClass: 'bg-gray-50 dark:bg-gray-800/40', textClass: 'text-gray-600 dark:text-gray-400', borderClass: 'border-gray-200 dark:border-gray-700' },
  transfer_in: { bgClass: 'bg-blue-50 dark:bg-blue-900/20', textClass: 'text-blue-700 dark:text-blue-400', borderClass: 'border-blue-200 dark:border-blue-800' },
  transfer_out: { bgClass: 'bg-blue-50 dark:bg-blue-900/20', textClass: 'text-blue-700 dark:text-blue-400', borderClass: 'border-blue-200 dark:border-blue-800' },
  adjust: { bgClass: 'bg-purple-50 dark:bg-purple-900/20', textClass: 'text-purple-700 dark:text-purple-400', borderClass: 'border-purple-200 dark:border-purple-800' },
  return: { bgClass: 'bg-cyan-50 dark:bg-cyan-900/20', textClass: 'text-cyan-700 dark:text-cyan-400', borderClass: 'border-cyan-200 dark:border-cyan-800' },
};

const REFERENCE_TYPE_LABELS: Record<string, string> = {
  order: 'ออเดอร์',
  replenishment: 'เติมสินค้าตัวแทน',
  transfer: 'โอนย้าย',
  manual: 'ปรับปรุงสต๊อก',
  receive: 'ใบรับเข้า',
  issue: 'ใบเบิกออก',
  credit_note: 'ใบลดหนี้',
  pos_order: 'ขายหน้าร้าน (POS)',
  consignment_report: 'รายงานฝากขาย',
};

const REFERENCE_TYPE_OPTIONS = Object.entries(REFERENCE_TYPE_LABELS).map(([id, label]) => ({ id, label }));

export default function MonitorTab({ warehouses }: MonitorTabProps) {
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);

  // Filters
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [refTypeFilter, setRefTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState<DateValueType>(() => {
    const today = formatDateValue(new Date());
    return { startDate: today, endDate: today };
  });

  // Summary
  const [summary, setSummary] = useState<SummaryCard[]>([]);

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const todayStr = formatDateValue(new Date());

  // Fetch summary (today's transactions grouped by type)
  const fetchSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      // Fetch all of today's transactions (up to 1000 for summary)
      const params = new URLSearchParams({
        date_from: todayStr,
        date_to: todayStr,
        limit: '1000',
        page: '1',
      });
      if (warehouseFilter) params.set('warehouse_id', warehouseFilter);

      const res = await apiFetch(`/api/inventory/transactions?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      const txs = (data.transactions || []) as Transaction[];

      // Group by type
      const grouped: Record<string, { count: number; totalQty: number }> = {};
      for (const tx of txs) {
        if (!grouped[tx.type]) grouped[tx.type] = { count: 0, totalQty: 0 };
        grouped[tx.type].count++;
        grouped[tx.type].totalQty += tx.quantity;
      }

      // Build summary cards — only types with data
      const cards: SummaryCard[] = [];
      const typeOrder: TransactionType[] = ['in', 'out', 'reserve', 'unreserve', 'transfer_in', 'transfer_out', 'adjust', 'return'];
      for (const t of typeOrder) {
        const g = grouped[t];
        if (!g) continue;
        const config = TYPE_CONFIG[t];
        const styles = CARD_STYLES[t];
        cards.push({
          type: t,
          label: config.label,
          count: g.count,
          totalQty: g.totalQty,
          icon: TYPE_ICONS[t],
          ...styles,
        });
      }

      setSummary(cards);
    } catch (err) { console.error('Monitor summary fetch error:', err); }
    setSummaryLoading(false);
  }, [todayStr, warehouseFilter]);

  // Fetch activity feed
  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(recordsPerPage),
      });

      if (warehouseFilter) params.set('warehouse_id', warehouseFilter);
      if (typeFilter) params.set('type', typeFilter);
      if (dateRange?.startDate) params.set('date_from', formatDateValue(dateRange.startDate));
      if (dateRange?.endDate) params.set('date_to', formatDateValue(dateRange.endDate));

      const res = await apiFetch(`/api/inventory/transactions?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      let txs = (data.transactions || []) as Transaction[];

      // Client-side filter by reference_type (API doesn't support it)
      if (refTypeFilter) {
        txs = txs.filter(tx => tx.reference_type === refTypeFilter);
      }

      setTransactions(txs);
      setTotal(refTypeFilter ? txs.length : (data.total || 0));
    } catch (err) { console.error('Monitor feed fetch error:', err); }
    setLoading(false);
  }, [page, recordsPerPage, warehouseFilter, typeFilter, refTypeFilter, dateRange]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      refreshIntervalRef.current = setInterval(() => {
        fetchSummary();
        fetchTransactions();
      }, 30000);
    }
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [autoRefresh, fetchSummary, fetchTransactions]);

  const handleRefresh = () => {
    fetchSummary();
    fetchTransactions();
  };

  const warehouseOptions = warehouses.map(w => ({ id: w.id, label: w.name }));
  const typeOptions = Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({ id: key, label: cfg.label }));
  const refTypeOptions = REFERENCE_TYPE_OPTIONS;

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium text-gray-700 dark:text-slate-300">
            สรุปวันนี้
          </h3>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-gray-300 dark:border-slate-600 text-[#F4511E] focus:ring-[#F4511E]"
              />
              Auto-refresh 30s
            </label>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-slate-400 hover:text-gray-800 dark:hover:text-slate-200 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${summaryLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {summaryLoading && summary.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
          </div>
        ) : summary.length === 0 ? (
          <div className="text-center py-6 text-gray-400 dark:text-slate-500 text-sm">
            ยังไม่มีรายการเคลื่อนไหววันนี้
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {summary.map(card => (
              <div
                key={card.type}
                className={`rounded-xl border p-4 ${card.bgClass} ${card.borderClass} cursor-pointer hover:shadow-sm transition-shadow`}
                onClick={() => {
                  setTypeFilter(card.type);
                  setDateRange({ startDate: todayStr, endDate: todayStr });
                  setPage(1);
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className={card.textClass}>{card.icon}</span>
                  <span className={`text-sm font-medium ${card.textClass}`}>{card.label}</span>
                </div>
                <div className="flex items-end justify-between">
                  <span className={`text-2xl font-bold ${card.textClass}`}>{card.count}</span>
                  <span className={`text-sm ${card.textClass} opacity-75`}>
                    {POSITIVE_TYPES.includes(card.type) ? '+' : NEGATIVE_TYPES.includes(card.type) ? '-' : ''}
                    {card.totalQty.toLocaleString()} ชิ้น
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="data-filter-card">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-44">
            <FormSelect
              value={warehouseFilter}
              onChange={(v) => { setWarehouseFilter(v); setPage(1); }}
              options={warehouseOptions}
              clearLabel="ทุกคลัง"
              placeholder="คลัง"
              searchThreshold={7}
            />
          </div>
          <div className="w-36">
            <FormSelect
              value={typeFilter}
              onChange={(v) => { setTypeFilter(v); setPage(1); }}
              options={typeOptions}
              clearLabel="ทุกประเภท"
              placeholder="ประเภท"
              searchThreshold={99}
            />
          </div>
          <div className="w-44">
            <FormSelect
              value={refTypeFilter}
              onChange={(v) => { setRefTypeFilter(v); setPage(1); }}
              options={refTypeOptions}
              clearLabel="ทั้งหมด"
              placeholder="แหล่งอ้างอิง"
              searchThreshold={99}
            />
          </div>
          <div className="w-64">
            <DateRangePicker
              value={dateRange}
              onChange={(v) => { setDateRange(v); setPage(1); }}
              placeholder="เลือกช่วงวันที่"
            />
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-medium text-gray-700 dark:text-slate-300">
            รายการเคลื่อนไหว
          </h3>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
        </div>

        {!loading && transactions.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-slate-500">
            <Package className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">ไม่พบรายการในช่วงเวลานี้</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map(tx => {
              const config = TYPE_CONFIG[tx.type] || { label: tx.type, bgClass: 'bg-gray-100', textClass: 'text-gray-700' };
              const isPositive = POSITIVE_TYPES.includes(tx.type);
              const isNegative = NEGATIVE_TYPES.includes(tx.type);

              return (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 hover:shadow-sm transition-shadow"
                >
                  {/* Time + Date */}
                  <div className="flex-shrink-0 w-20 text-right">
                    <div className="text-sm font-mono text-gray-500 dark:text-slate-400">{formatTime(tx.created_at)}</div>
                    <div className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{formatDate(tx.created_at)}</div>
                  </div>

                  {/* Product image */}
                  <div className="flex-shrink-0 w-10 h-10 rounded bg-gray-100 dark:bg-slate-700 overflow-hidden">
                    {tx.product_image ? (
                      <img src={tx.product_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-4 h-4 text-gray-300 dark:text-slate-600" />
                      </div>
                    )}
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-900 dark:text-slate-100 line-clamp-2">
                      {productDisplayName({
                        product_name: tx.product_name,
                        variation_label: tx.variation_label,
                        sku: tx.sku,
                      })}
                    </span>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-slate-400 flex-wrap">
                      <span>คงเหลือ: {tx.balance_after.toLocaleString()}</span>
                      {tx.reference_type && <span className="text-gray-400 dark:text-slate-500">{REFERENCE_TYPE_LABELS[tx.reference_type] || tx.reference_type}</span>}
                      {tx.created_by_name && <span>โดย: {tx.created_by_name}</span>}
                    </div>
                    {tx.notes && (
                      <div className="mt-0.5 text-xs text-gray-400 dark:text-slate-500 truncate">
                        {tx.notes}
                      </div>
                    )}
                  </div>

                  {/* Qty + Badge */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1">
                    <span className={`text-lg font-bold ${config.textClass}`}>
                      {isPositive ? '+' : isNegative ? '-' : ''}{tx.quantity}
                    </span>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium whitespace-nowrap ${config.bgClass} ${config.textClass}`}>
                      {config.label}
                    </span>
                  </div>

                  {/* Warehouse — rightmost */}
                  {tx.warehouse_name && (
                    <div className="flex-shrink-0 w-28 text-right">
                      <span className="text-xs text-gray-500 dark:text-slate-400">{tx.warehouse_name}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {total > recordsPerPage && (
          <div className="mt-4">
            <Pagination
              currentPage={page}
              totalPages={Math.ceil(total / recordsPerPage)}
              totalRecords={total}
              startIdx={(page - 1) * recordsPerPage + 1}
              endIdx={Math.min(page * recordsPerPage, total)}
              recordsPerPage={recordsPerPage}
              setRecordsPerPage={(v) => { setRecordsPerPage(v); setPage(1); }}
              setPage={setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
