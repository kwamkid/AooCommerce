'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import SearchInput from '@/components/ui/SearchInput';
import SearchableDropdown from '@/components/ui/SearchableDropdown';
import Pagination from '@/app/components/Pagination';
import {
  Plus,
  Edit2,
  Trash2,
  MoreVertical,
  Package,
  Gift,
  Percent,
  Tag,
  FilterX,
  Image as ImageIcon,
  Send,
} from 'lucide-react';
import PushDealModal from './components/PushDealModal';

// ─── Types ──────────────────────────────────────────────

interface PromotionItem {
  id: string;
  name: string;
  promotion_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  image: string | null;
  bundle_price: number | null;
  created_at: string;
  items: {
    product_name: string;
    variation_label: string;
    role: string;
    quantity: number;
    default_price: number;
  }[];
  tiers: {
    min_qty: number;
    discount_type: string;
    discount_value: number;
  }[];
}

// ─── Constants ──────────────────────────────────────────

const TYPE_OPTIONS = [
  { id: 'bundle_set', label: 'เซ็ตรวม' },
  { id: 'buy_get_free', label: 'ซื้อ X แถม Y' },
  { id: 'buy_get_discount', label: 'ซื้อ X ได้ Y ราคาพิเศษ' },
  { id: 'qty_discount', label: 'ซื้อเยอะลดเยอะ' },
];

const STATUS_OPTIONS = [
  { id: 'active', label: 'ใช้งาน' },
  { id: 'inactive', label: 'ปิดใช้งาน' },
  { id: 'scheduled', label: 'รอเริ่ม' },
  { id: 'expired', label: 'หมดอายุ' },
];

const TYPE_LABELS: Record<string, string> = {
  bundle_set: 'เซ็ตรวม',
  buy_get_free: 'ซื้อ X แถม Y',
  buy_get_discount: 'ซื้อ X ได้ Y ราคาพิเศษ',
  qty_discount: 'ซื้อเยอะลดเยอะ',
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  bundle_set: <Package className="w-4 h-4" />,
  buy_get_free: <Gift className="w-4 h-4" />,
  buy_get_discount: <Tag className="w-4 h-4" />,
  qty_discount: <Percent className="w-4 h-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  inactive: 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-400',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  expired: 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'ใช้งาน',
  inactive: 'ปิดใช้งาน',
  scheduled: 'รอเริ่ม',
  expired: 'หมดอายุ',
};

// ─── Helper Components ──────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
      {TYPE_ICONS[type]}
      {TYPE_LABELS[type] || type}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] || STATUS_COLORS.inactive}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function ActionMenu({ onEdit, onDelete, onPush }: { onEdit: () => void; onDelete: () => void; onPush?: () => void }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [open]);

  return (
    <div className="relative inline-block">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
      >
        <MoreVertical className="w-4 h-4 text-gray-500" />
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-1 w-44 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-slate-600 py-1">
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit(); }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
          >
            <Edit2 className="w-3.5 h-3.5" />
            แก้ไข
          </button>
          {onPush && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen(false); onPush(); }}
              className="w-full text-left px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2"
            >
              <Send className="w-3.5 h-3.5" />
              ส่งไป Shopee
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDelete(); }}
            className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
          >
            <Trash2 className="w-3.5 h-3.5" />
            ลบ
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

function PromotionsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL-driven state
  const typeFilter = searchParams.get('type') || '';
  const statusFilter = searchParams.get('status') || '';
  const searchQuery = searchParams.get('q') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const rowsPerPage = parseInt(searchParams.get('limit') || '20', 10);

  // Local state
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [promotions, setPromotions] = useState<PromotionItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadTime, setLoadTime] = useState<number | null>(null);
  const [pushModalPromo, setPushModalPromo] = useState<PromotionItem | null>(null);

  const totalPages = Math.ceil(totalRecords / rowsPerPage);
  const startIdx = (currentPage - 1) * rowsPerPage;
  const endIdx = Math.min(startIdx + rowsPerPage, totalRecords);

  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      if (!v || v === '') params.delete(k);
      else params.set(k, v);
    }
    if (pageReset) params.delete('page');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/promotions', { scroll: false });
  }, [searchParams, router]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== searchQuery) {
        setParams({ q: searchInput });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, searchQuery, setParams]);

  // Fetch promotions
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      const t0 = performance.now();
      try {
        const params = new URLSearchParams();
        if (searchQuery) params.set('search', searchQuery);
        if (typeFilter) params.set('type', typeFilter);
        if (statusFilter) params.set('status', statusFilter);
        params.set('page', String(currentPage));
        params.set('limit', String(rowsPerPage));

        const res = await apiFetch(`/api/promotions?${params}`);
        const data = await res.json();
        if (cancelled) return;
        setPromotions(data.promotions || []);
        setTotalRecords(data.total || 0);
        setLoadTime((performance.now() - t0) / 1000);
      } catch {
        if (!cancelled) {
          setPromotions([]);
          setTotalRecords(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [searchQuery, typeFilter, statusFilter, currentPage, rowsPerPage]);

  const hasActiveFilters = !!(typeFilter || statusFilter || searchQuery);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`ลบโปรโมชั่น "${name}" ?`)) return;
    try {
      await apiFetch(`/api/promotions/${id}`, { method: 'DELETE' });
      setPromotions(prev => prev.filter(p => p.id !== id));
      setTotalRecords(prev => prev - 1);
    } catch {
      alert('เกิดข้อผิดพลาดในการลบ');
    }
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  const formatPrice = (p: number | null) => {
    if (p == null) return '-';
    return p.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  };

  const getItemsSummary = (promo: PromotionItem) => {
    if (promo.items.length === 0) return '-';
    if (promo.items.length <= 2) {
      return promo.items.map(i => {
        const label = i.variation_label ? `${i.product_name} (${i.variation_label})` : i.product_name;
        if (i.role === 'gift') return `${label} [แถม]`;
        if (i.role === 'discounted') return `${label} [พิเศษ]`;
        return label;
      }).join(', ');
    }
    return `${promo.items.length} รายการ`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">โปรโมชั่น</h1>
          <p className="text-gray-600 dark:text-slate-400 mt-1">จัดการโปรโมชั่นสินค้า</p>
        </div>
        <Link
          href="/promotions/new"
          className="flex items-center space-x-2 px-4 py-2 bg-[#F4511E] hover:bg-[#D63B0E] text-white rounded-lg font-semibold transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>สร้างโปรโมชั่น</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="data-filter-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64">
            <SearchInput
              value={searchInput}
              onChange={setSearchInput}
              placeholder="ค้นหาชื่อโปรโมชั่น..."
            />
          </div>
          <div className="w-48">
            <SearchableDropdown
              value={typeFilter}
              onChange={(v: string) => setParams({ type: v })}
              options={[
                { id: '', label: 'ทั้งหมด' },
                ...TYPE_OPTIONS,
              ]}
              placeholder="ประเภท"
            />
          </div>
          <div className="w-36">
            <SearchableDropdown
              value={statusFilter}
              onChange={(v: string) => setParams({ status: v })}
              options={[
                { id: '', label: 'ทั้งหมด' },
                ...STATUS_OPTIONS,
              ]}
              placeholder="สถานะ"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchInput('');
                router.replace('/promotions', { scroll: false });
              }}
              className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <FilterX className="w-3.5 h-3.5" />
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="data-table-wrap relative">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F4511E]" />
          </div>
        )}

        {!loading && promotions.length === 0 && (
          <div className="text-center py-20 text-gray-500 dark:text-slate-400">
            {hasActiveFilters ? 'ไม่พบโปรโมชั่นที่ตรงกับเงื่อนไข' : 'ยังไม่มีโปรโมชั่น'}
          </div>
        )}

        {!loading && promotions.length > 0 && (
          <div>
            <table className="data-table-fixed">
              <thead className="data-thead">
                <tr>
                  <th className="data-th" style={{ width: '52px' }}>รูป</th>
                  <th className="data-th" style={{ minWidth: '240px' }}>ชื่อโปรโมชั่น</th>
                  <th className="data-th" style={{ width: '180px' }}>ประเภท</th>
                  <th className="data-th" style={{ width: '100px' }}>สถานะ</th>
                  <th className="data-th text-right" style={{ width: '110px' }}>ราคา</th>
                  <th className="data-th" style={{ width: '200px' }}>สินค้า</th>
                  <th className="data-th" style={{ width: '120px' }}>ระยะเวลา</th>
                  <th className="data-th" style={{ width: '44px' }}></th>
                </tr>
              </thead>
              <tbody>
                {promotions.map(promo => (
                  <tr
                    key={promo.id}
                    className="data-tr cursor-pointer"
                    onClick={() => router.push(`/promotions/${promo.id}/edit`)}
                  >
                    {/* Image */}
                    <td className="data-td">
                      {promo.image ? (
                        <img
                          src={promo.image}
                          alt=""
                          className="w-10 h-10 rounded-lg object-cover bg-gray-100 dark:bg-slate-700"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                          <ImageIcon className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                    </td>

                    {/* Name */}
                    <td className="data-td">
                      <div className="font-medium text-gray-900 dark:text-white truncate">
                        {promo.name}
                      </div>
                    </td>

                    {/* Type */}
                    <td className="data-td">
                      <TypeBadge type={promo.promotion_type} />
                    </td>

                    {/* Status */}
                    <td className="data-td">
                      <StatusBadge status={promo.status} />
                    </td>

                    {/* Price */}
                    <td className="data-td text-right">
                      {promo.promotion_type === 'qty_discount' ? (
                        <span className="text-sm text-gray-500 dark:text-slate-400">
                          {promo.tiers.length > 0
                            ? `${promo.tiers.length} ขั้น`
                            : '-'}
                        </span>
                      ) : (
                        <span className="font-medium">
                          {formatPrice(promo.bundle_price)}
                        </span>
                      )}
                    </td>

                    {/* Items */}
                    <td className="data-td">
                      <span className="text-sm text-gray-600 dark:text-slate-400 truncate block max-w-[200px]">
                        {getItemsSummary(promo)}
                      </span>
                    </td>

                    {/* Date range */}
                    <td className="data-td text-sm text-gray-500 dark:text-slate-400">
                      {promo.start_date || promo.end_date ? (
                        <>
                          {formatDate(promo.start_date)}
                          {promo.end_date ? ` - ${formatDate(promo.end_date)}` : ''}
                        </>
                      ) : (
                        <span className="text-gray-400">ไม่จำกัด</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="data-td" onClick={e => e.stopPropagation()}>
                      <ActionMenu
                        onEdit={() => router.push(`/promotions/${promo.id}/edit`)}
                        onDelete={() => handleDelete(promo.id, promo.name)}
                        onPush={
                          (promo.status === 'active' || promo.status === 'scheduled') && promo.start_date && promo.end_date
                            ? () => setPushModalPromo(promo)
                            : undefined
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {!loading && totalRecords > 0 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalRecords={totalRecords}
          startIdx={startIdx}
          endIdx={endIdx}
          recordsPerPage={rowsPerPage}
          setRecordsPerPage={(v: number) => setParams({ limit: String(v) })}
          setPage={(p: number) => setParams({ page: String(p) })}
          loadTime={loadTime}
        />
      )}

      {/* Push Deal Modal */}
      {pushModalPromo && (
        <PushDealModal
          promotionId={pushModalPromo.id}
          promotionName={pushModalPromo.name}
          startDate={pushModalPromo.start_date}
          endDate={pushModalPromo.end_date}
          onClose={() => setPushModalPromo(null)}
        />
      )}
    </div>
  );
}

export default function PromotionsPage() {
  return (
    <Layout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#F4511E]" />
        </div>
      }>
        <PromotionsPageContent />
      </Suspense>
    </Layout>
  );
}
