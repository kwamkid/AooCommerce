'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import { Loader2, Search, Warehouse, ArrowDownUp, ExternalLink, X } from 'lucide-react';
import ColumnSettingsDropdown from './ColumnSettingsDropdown';
import Pagination from './Pagination';
import {
  Transaction, TransactionType, WarehouseItem, HistoryColumnKey,
  HISTORY_COLUMN_CONFIGS, HISTORY_COLUMNS_STORAGE_KEY,
  TYPE_CONFIG, POSITIVE_TYPES, NEGATIVE_TYPES,
  formatDate, formatTime, formatDateValue,
} from './types';

interface HistoryTabProps {
  warehouses: WarehouseItem[];
  filterVariationId?: string;
  filterProductLabel?: string;
  onFilterCleared?: () => void;
}

export default function HistoryTab({ warehouses, filterVariationId, filterProductLabel, onFilterCleared }: HistoryTabProps) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(20);
  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [type, setType] = useState('');
  const [dateRange, setDateRange] = useState<DateValueType>({ startDate: null, endDate: null });
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  // Variation filter from parent (when clicking "ดูประวัติ" per product)
  const [variationId, setVariationId] = useState(filterVariationId || '');
  const [variationLabel, setVariationLabel] = useState(filterProductLabel || '');

  // Column toggle
  const [visibleColumns, setVisibleColumns] = useState<Set<HistoryColumnKey>>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(HISTORY_COLUMNS_STORAGE_KEY);
      if (stored) {
        try { return new Set(JSON.parse(stored) as HistoryColumnKey[]); } catch { /* defaults */ }
      }
    }
    return new Set(HISTORY_COLUMN_CONFIGS.filter(c => c.defaultVisible).map(c => c.key));
  });

  const toggleColumn = (key: HistoryColumnKey) => {
    const config = HISTORY_COLUMN_CONFIGS.find(c => c.key === key);
    if (config?.alwaysVisible) return;
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      localStorage.setItem(HISTORY_COLUMNS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(recordsPerPage));
      if (warehouseFilter) params.set('warehouse_id', warehouseFilter);
      if (variationId) params.set('variation_id', variationId);
      if (type) params.set('type', type);
      if (search) params.set('search', search);
      const dateFrom = formatDateValue(dateRange?.startDate);
      const dateTo = formatDateValue(dateRange?.endDate);
      if (dateFrom) params.set('date_from', dateFrom);
      if (dateTo) params.set('date_to', dateTo);

      const res = await apiFetch(`/api/inventory/transactions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error('Error fetching transactions:', error);
    } finally {
      setLoading(false);
    }
  }, [page, recordsPerPage, warehouseFilter, variationId, type, search, dateRange]);

  // Fetch on mount + on filter changes
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const handleSearch = (val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => setPage(1), 500));
  };

  const clearVariationFilter = () => {
    setVariationId('');
    setVariationLabel('');
    setPage(1);
    onFilterCleared?.();
  };

  // Display
  const totalPages = Math.ceil(total / recordsPerPage);
  const startIdx = (page - 1) * recordsPerPage;
  const endIdx = Math.min(startIdx + transactions.length, total);

  function getTypeBadge(txType: TransactionType) {
    const config = TYPE_CONFIG[txType];
    if (!config) return <span className="text-xs text-gray-500">{txType}</span>;
    return <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${config.bgClass} ${config.textClass}`}>{config.label}</span>;
  }

  function getQuantityDisplay(txType: TransactionType, quantity: number) {
    if (POSITIVE_TYPES.includes(txType)) return <span className="font-medium text-green-600 dark:text-green-400">+{quantity.toLocaleString()}</span>;
    if (NEGATIVE_TYPES.includes(txType)) return <span className="font-medium text-red-600 dark:text-red-400">-{quantity.toLocaleString()}</span>;
    return <span className="font-medium text-purple-600 dark:text-purple-400">{quantity.toLocaleString()}</span>;
  }

  function getReferenceDisplay(referenceType: string | null, referenceId: string | null) {
    if (!referenceType) return <span className="text-gray-400 dark:text-slate-500">-</span>;
    if (referenceType === 'order') {
      return (
        <span className="inline-flex items-center gap-1 text-[#F4511E] hover:text-[#D63B0E]">
          <span className="text-xs">Order</span>
          {referenceId && (
            <a href={`/orders/${referenceId}`} className="text-xs underline inline-flex items-center gap-0.5">
              #{referenceId.substring(0, 8)}<ExternalLink className="w-3 h-3" />
            </a>
          )}
        </span>
      );
    }
    if (referenceType === 'manual') return <span className="text-xs text-gray-600 dark:text-slate-400">ปรับมือ</span>;
    if (referenceType === 'transfer') return <span className="text-xs text-blue-600 dark:text-blue-400">โอนย้าย</span>;
    return <span className="text-xs text-gray-500 dark:text-slate-400">{referenceType}</span>;
  }

  return (
    <>
      {/* Variation filter badge */}
      {variationId && variationLabel && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 rounded-lg text-sm">
            ประวัติ: <span className="font-medium">{variationLabel}</span>
            <button onClick={clearVariationFilter} className="p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded">
              <X className="w-3.5 h-3.5" />
            </button>
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="data-filter-card">
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={warehouseFilter}
            onChange={e => { setWarehouseFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
          >
            <option value="">ทุกคลัง</option>
            {warehouses.map(wh => <option key={wh.id} value={wh.id}>{wh.name}</option>)}
          </select>
          <select
            value={type}
            onChange={e => { setType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50"
          >
            <option value="">ทุกประเภท</option>
            {(Object.keys(TYPE_CONFIG) as TransactionType[]).map(t => (
              <option key={t} value={t}>{TYPE_CONFIG[t].label}</option>
            ))}
          </select>
          <div className="w-64">
            <DateRangePicker
              value={dateRange}
              onChange={(v) => { setDateRange(v); setPage(1); }}
              placeholder="เลือกช่วงวันที่"
            />
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearch(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>
          <ColumnSettingsDropdown
            configs={HISTORY_COLUMN_CONFIGS}
            visible={visibleColumns}
            toggle={toggleColumn}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" /></div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-16">
          <ArrowDownUp className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-slate-400 text-sm">ไม่พบรายการเคลื่อนไหว</p>
        </div>
      ) : (
        <div className="data-table-wrap">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="data-thead">
                <tr>
                  {visibleColumns.has('date') && <th className="data-th">วันที่</th>}
                  {visibleColumns.has('type') && <th className="data-th">ประเภท</th>}
                  {visibleColumns.has('product') && <th className="data-th">สินค้า</th>}
                  {visibleColumns.has('qty') && <th className="data-th text-right">จำนวน</th>}
                  {visibleColumns.has('balance') && <th className="data-th text-right">คงเหลือ</th>}
                  {visibleColumns.has('warehouse') && <th className="data-th">คลัง</th>}
                  {visibleColumns.has('reference') && <th className="data-th">อ้างอิง</th>}
                  {visibleColumns.has('user') && <th className="data-th">ผู้ทำรายการ</th>}
                </tr>
              </thead>
              <tbody className="data-tbody">
                {transactions.map(tx => (
                  <tr key={tx.id} className="data-tr">
                    {visibleColumns.has('date') && (
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">{formatDate(tx.created_at)}</div>
                        <div className="text-xs text-gray-500 dark:text-slate-400">{formatTime(tx.created_at)}</div>
                      </td>
                    )}
                    {visibleColumns.has('type') && (
                      <td className="px-6 py-4">{getTypeBadge(tx.type)}</td>
                    )}
                    {visibleColumns.has('product') && (
                      <td className="px-6 py-4">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">
                            {tx.product_name}{tx.variation_label ? ` - ${tx.variation_label}` : ''}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-slate-400">
                            {tx.product_code}
                            {tx.sku && <span className="ml-1">• {tx.sku}</span>}
                          </p>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('qty') && (
                      <td className="px-6 py-4 text-right">{getQuantityDisplay(tx.type, tx.quantity)}</td>
                    )}
                    {visibleColumns.has('balance') && (
                      <td className="px-6 py-4 text-right font-medium text-gray-900 dark:text-white">{tx.balance_after.toLocaleString()}</td>
                    )}
                    {visibleColumns.has('warehouse') && (
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-gray-600 dark:text-slate-300 text-xs">{tx.warehouse_name}</span>
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('reference') && (
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          {getReferenceDisplay(tx.reference_type, tx.reference_id)}
                          {tx.notes && <span className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[150px] cursor-help" title={tx.notes}>{tx.notes}</span>}
                        </div>
                      </td>
                    )}
                    {visibleColumns.has('user') && (
                      <td className="px-6 py-4 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">{tx.created_by_name || '-'}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            startIdx={startIdx}
            endIdx={endIdx}
            recordsPerPage={recordsPerPage}
            setRecordsPerPage={setRecordsPerPage}
            setPage={setPage}
          />
        </div>
      )}
    </>
  );
}
