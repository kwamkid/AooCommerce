'use client';

import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { DateValueType } from 'react-tailwindcss-datepicker';
import {
  Loader2, Search, ArrowDownUp, ChevronLeft, ChevronRight,
  Warehouse, Package2, ExternalLink,
} from 'lucide-react';

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
}

type TransactionType = 'in' | 'out' | 'transfer_in' | 'transfer_out' | 'reserve' | 'unreserve' | 'adjust' | 'return';

interface Transaction {
  id: string;
  type: TransactionType;
  quantity: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_at: string;
  warehouse_name: string;
  warehouse_code: string;
  product_code: string;
  product_name: string;
  sku: string | null;
  variation_label: string | null;
  created_by_name: string | null;
}

const TYPE_CONFIG: Record<TransactionType, { label: string; bgClass: string; textClass: string }> = {
  in: { label: 'รับเข้า', bgClass: 'bg-green-100 dark:bg-green-900/30', textClass: 'text-green-700 dark:text-green-400' },
  out: { label: 'เบิกออก', bgClass: 'bg-red-100 dark:bg-red-900/30', textClass: 'text-red-700 dark:text-red-400' },
  transfer_in: { label: 'โอนเข้า', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  transfer_out: { label: 'โอนออก', bgClass: 'bg-blue-100 dark:bg-blue-900/30', textClass: 'text-blue-700 dark:text-blue-400' },
  reserve: { label: 'จอง', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', textClass: 'text-yellow-700 dark:text-yellow-400' },
  unreserve: { label: 'ปล่อยจอง', bgClass: 'bg-gray-100 dark:bg-gray-700/30', textClass: 'text-gray-700 dark:text-gray-400' },
  adjust: { label: 'ปรับปรุง', bgClass: 'bg-purple-100 dark:bg-purple-900/30', textClass: 'text-purple-700 dark:text-purple-400' },
  return: { label: 'คืน', bgClass: 'bg-teal-100 dark:bg-teal-900/30', textClass: 'text-teal-700 dark:text-teal-400' },
};

const POSITIVE_TYPES: TransactionType[] = ['in', 'transfer_in', 'return', 'unreserve'];
const NEGATIVE_TYPES: TransactionType[] = ['out', 'transfer_out', 'reserve'];

function getTypeBadge(type: TransactionType) {
  const config = TYPE_CONFIG[type];
  if (!config) return <span className="text-xs text-gray-500">{type}</span>;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${config.bgClass} ${config.textClass}`}>
      {config.label}
    </span>
  );
}

function getQuantityDisplay(type: TransactionType, quantity: number) {
  if (POSITIVE_TYPES.includes(type)) {
    return <span className="font-medium text-green-600 dark:text-green-400">+{quantity.toLocaleString()}</span>;
  }
  if (NEGATIVE_TYPES.includes(type)) {
    return <span className="font-medium text-red-600 dark:text-red-400">-{quantity.toLocaleString()}</span>;
  }
  // adjust
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
            #{referenceId.substring(0, 8)}
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </span>
    );
  }
  if (referenceType === 'manual') {
    return <span className="text-xs text-gray-600 dark:text-slate-400">ปรับมือ</span>;
  }
  if (referenceType === 'transfer') {
    return <span className="text-xs text-blue-600 dark:text-blue-400">โอนย้าย</span>;
  }
  return <span className="text-xs text-gray-500 dark:text-slate-400">{referenceType}</span>;
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatDateValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function InventoryTransactionsPage() {
  const { userProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [dateRange, setDateRange] = useState<DateValueType>({ startDate: null, endDate: null });

  // Warehouses
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);

  // Search debounce
  const [searchTimeout, setSearchTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [page, selectedWarehouse, selectedType, dateRange]);

  const fetchWarehouses = async () => {
    try {
      const res = await apiFetch('/api/warehouses');
      if (res.ok) {
        const data = await res.json();
        setWarehouses(data.warehouses || []);
      }
    } catch {
      // silent
    }
  };

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (selectedWarehouse) params.set('warehouse_id', selectedWarehouse);
      if (selectedType) params.set('type', selectedType);
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
  }, [page, limit, selectedWarehouse, selectedType, search, dateRange]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => {
      setPage(1);
      fetchTransactions();
    }, 500));
  };

  const handleDateChange = (value: DateValueType) => {
    setDateRange(value);
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push('...');
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (page < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <Layout
      title="ประวัติการเคลื่อนไหว"
      breadcrumbs={[
        { label: 'คลังสินค้า', href: '/inventory' },
        { label: 'ประวัติการเคลื่อนไหว' },
      ]}
    >
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col lg:flex-row gap-3">
          {/* Warehouse filter */}
          <select
            value={selectedWarehouse}
            onChange={e => { setSelectedWarehouse(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          >
            <option value="">ทุกคลัง</option>
            {warehouses.map(wh => (
              <option key={wh.id} value={wh.id}>{wh.name}</option>
            ))}
          </select>

          {/* Transaction type filter */}
          <select
            value={selectedType}
            onChange={e => { setSelectedType(e.target.value); setPage(1); }}
            className="px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
          >
            <option value="">ทุกประเภท</option>
            {(Object.keys(TYPE_CONFIG) as TransactionType[]).map(type => (
              <option key={type} value={type}>{TYPE_CONFIG[type].label}</option>
            ))}
          </select>

          {/* Date range picker */}
          <div className="w-full lg:w-64">
            <DateRangePicker
              value={dateRange}
              onChange={handleDateChange}
              placeholder="เลือกช่วงวันที่"
            />
          </div>

          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="ค้นหาสินค้า..."
              className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 text-[#F4511E] animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="text-center py-16">
            <ArrowDownUp className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-slate-400 text-sm">ไม่พบรายการเคลื่อนไหว</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">วันที่</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ประเภท</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">สินค้า</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">จำนวน</th>
                      <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">คงเหลือ</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">คลัง</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">อ้างอิง</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase">ผู้ทำรายการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                        {/* Date */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="text-gray-900 dark:text-white text-sm">{formatDate(tx.created_at)}</div>
                          <div className="text-gray-500 dark:text-slate-400 text-xs">{formatTime(tx.created_at)}</div>
                        </td>
                        {/* Type badge */}
                        <td className="px-4 py-3">{getTypeBadge(tx.type)}</td>
                        {/* Product */}
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 dark:text-white truncate max-w-[200px]">{tx.product_name}</p>
                            <p className="text-xs text-gray-500 dark:text-slate-400">
                              {tx.product_code}
                              {tx.sku && <span className="ml-1">• {tx.sku}</span>}
                              {tx.variation_label && <span className="ml-1">• {tx.variation_label}</span>}
                            </p>
                          </div>
                        </td>
                        {/* Quantity */}
                        <td className="px-4 py-3 text-right">{getQuantityDisplay(tx.type, tx.quantity)}</td>
                        {/* Balance after */}
                        <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                          {tx.balance_after.toLocaleString()}
                        </td>
                        {/* Warehouse */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Warehouse className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-gray-600 dark:text-slate-300 text-xs">{tx.warehouse_name}</span>
                          </div>
                        </td>
                        {/* Reference */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            {getReferenceDisplay(tx.reference_type, tx.reference_id)}
                            {tx.notes && (
                              <span
                                className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[150px] cursor-help"
                                title={tx.notes}
                              >
                                {tx.notes}
                              </span>
                            )}
                          </div>
                        </td>
                        {/* Created by */}
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-slate-300 whitespace-nowrap">
                          {tx.created_by_name || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-3">
                  {/* Top: Date + Type badge */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      {formatDate(tx.created_at)} {formatTime(tx.created_at)}
                    </div>
                    {getTypeBadge(tx.type)}
                  </div>

                  {/* Product info */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-8 h-8 rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                      <Package2 className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white text-sm truncate">{tx.product_name}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {tx.product_code}
                        {tx.sku && <span> • {tx.sku}</span>}
                        {tx.variation_label && <span> • {tx.variation_label}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Quantity + Balance */}
                  <div className="grid grid-cols-3 gap-2 text-center mb-2">
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">จำนวน</p>
                      <p className="text-sm">{getQuantityDisplay(tx.type, tx.quantity)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">คงเหลือ</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{tx.balance_after.toLocaleString()}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 dark:text-slate-400">อ้างอิง</p>
                      <div className="text-sm">{getReferenceDisplay(tx.reference_type, tx.reference_id)}</div>
                    </div>
                  </div>

                  {/* Footer: Warehouse + Created by */}
                  <div className="flex items-center justify-between text-xs text-gray-400 dark:text-slate-500 pt-1 border-t border-gray-100 dark:border-slate-700">
                    <div className="flex items-center gap-1">
                      <Warehouse className="w-3 h-3" />
                      {tx.warehouse_name}
                    </div>
                    {tx.created_by_name && <span>{tx.created_by_name}</span>}
                  </div>

                  {/* Notes */}
                  {tx.notes && (
                    <p className="text-xs text-gray-400 dark:text-slate-500 mt-1 truncate" title={tx.notes}>
                      {tx.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  แสดง {(page - 1) * limit + 1}-{Math.min(page * limit, total)} จาก {total.toLocaleString()} รายการ
                </p>
                <div className="flex items-center gap-1">
                  {/* Previous */}
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Page numbers */}
                  {getPageNumbers().map((pg, idx) =>
                    typeof pg === 'string' ? (
                      <span key={`ellipsis-${idx}`} className="px-2 py-1 text-sm text-gray-400 dark:text-slate-500">
                        ...
                      </span>
                    ) : (
                      <button
                        key={pg}
                        onClick={() => setPage(pg)}
                        className={`min-w-[36px] h-9 px-2 text-sm rounded-lg border transition-colors ${
                          page === pg
                            ? 'bg-[#F4511E] text-white border-[#F4511E]'
                            : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                        }`}
                      >
                        {pg}
                      </button>
                    )
                  )}

                  {/* Next */}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border border-gray-300 dark:border-slate-600 rounded-lg disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
