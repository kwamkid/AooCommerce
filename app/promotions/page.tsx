'use client';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { apiFetch } from '@/lib/api-client';
import SearchInput from '@/components/ui/SearchInput';
import SearchableDropdown from '@/components/ui/SearchableDropdown';
import Pagination from '@/app/components/Pagination';
import SharedActionMenu, { type ActionItem as SharedActionItem } from '@/components/ui/ActionMenu';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { LoadingCard, EmptyCard } from '@/components/ui/StateCard';
import {
  Plus,
  Edit2,
  Trash2,
  Package,
  Gift,
  Percent,
  Tag,
  FilterX,
  Image as ImageIcon,
  Send,
  Calendar,
  X,
  AlertTriangle,
} from 'lucide-react';
import PushDealModal from './components/PushDealModal';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { getBadgeColor, getStatusHeaderTint } from '@/lib/status-tab-colors';

// ─── Types ──────────────────────────────────────────────

interface PromotionItemDetail {
  product_name: string;
  variation_label: string;
  variation_id: string;
  product_id?: string;
  role: string;
  quantity: number;
  default_price: number;
  max_price?: number;
  special_price?: number | null;
  image?: string | null;
}

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
  items: PromotionItemDetail[];
  tiers: {
    min_qty: number;
    discount_type: string;
    discount_value: number;
  }[];
  discount_type?: string | null;
  discount_value?: number | null;
  updated_at: string;
  marketplace_deals?: { account_id: string; status: string; shop_name: string; updated_at: string }[];
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

const TYPE_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  bundle_set: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400', icon: 'text-orange-500' },
  buy_get_free: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', icon: 'text-emerald-500' },
  buy_get_discount: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: 'text-blue-500' },
  qty_discount: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: 'text-purple-500' },
};

// สีสถานะ (active/inactive/scheduled/expired) มาจาก getBadgeColor/getStatusHeaderTint
// ผ่าน STATUS_KEY_ALIASES ใน lib/status-tab-colors.ts — ห้ามเขียนสีเองที่นี่

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
  const cfg = getBadgeColor(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function PromoActionMenu({ onEdit, onDelete, onPush }: { onEdit: () => void; onDelete: () => void; onPush?: () => void }) {
  const items: SharedActionItem[] = [
    { key: 'edit', label: 'แก้ไข', icon: <Edit2 className="w-3.5 h-3.5" />, onClick: onEdit },
    ...(onPush ? [{ key: 'push', label: 'ส่งไป Shopee', icon: <Send className="w-3.5 h-3.5" />, onClick: onPush }] : []),
    { key: 'delete', label: 'ลบ', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: onDelete },
  ];
  return <SharedActionMenu items={items} />;
}

function RoleBadge({ role }: { role: string }) {
  if (role === 'gift') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400">แถม</span>;
  }
  if (role === 'discounted') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">พิเศษ</span>;
  }
  if (role === 'main') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">หลัก</span>;
  }
  return null;
}

// Lightbox for single image
function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[999] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={0}
      ref={(el) => el?.focus()}
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2.5 bg-white/20 hover:bg-white/30 rounded-full transition-colors text-white z-10"
      >
        <X className="w-5 h-5" />
      </button>
      <div className="max-w-[90vw] max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
        <img src={url} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg select-none" draggable={false} />
      </div>
    </div>
  );
}

// ─── Promotion Card ─────────────────────────────────────

function PromotionCard({
  promo,
  onEdit,
  onDelete,
  onPush,
  onImageClick,
  showMarketplace = false,
}: {
  promo: PromotionItem;
  onEdit: () => void;
  onDelete: () => void;
  onPush?: () => void;
  onImageClick: (url: string) => void;
  /** ร้านเปิดฟีเจอร์ marketplace อยู่ไหม — ปิดแล้วห้ามโชว์อะไรที่เป็น Shopee เลย */
  showMarketplace?: boolean;
}) {
  const headerTint = getStatusHeaderTint(promo.status);
  const hasShopeeDeals = showMarketplace && (promo.marketplace_deals || []).length > 0;

  // Check if local promotion was updated after the last Shopee sync
  const isOutOfSync = hasShopeeDeals && (() => {
    const promoTime = new Date(promo.updated_at).getTime();
    const latestSyncTime = Math.max(
      ...promo.marketplace_deals!.map(d => new Date(d.updated_at).getTime())
    );
    return promoTime > latestSyncTime;
  })();

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  const formatPrice = (p: number | null) => {
    if (p == null) return '-';
    return p.toLocaleString('th-TH', { minimumFractionDigits: 0 });
  };

  return (
    <div
      onClick={onEdit}
      className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 hover:border-primary/40 dark:hover:border-primary/40 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Header bar */}
      <div className={`flex items-center gap-2 px-4 py-2.5 ${headerTint.bg}`}>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {(() => {
            const tc = TYPE_COLORS[promo.promotion_type] || TYPE_COLORS.bundle_set;
            return (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${tc.bg} ${tc.text}`}>
                {TYPE_ICONS[promo.promotion_type]}
                {TYPE_LABELS[promo.promotion_type] || promo.promotion_type}
              </span>
            );
          })()}
          <span className={`font-semibold text-base truncate ${headerTint.text}`}>
            {promo.name}
          </span>
          {(promo.start_date || promo.end_date) && (
            <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
              {formatDate(promo.start_date)} - {formatDate(promo.end_date)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Shopee sync indicator */}
          {hasShopeeDeals && (
            <div className="relative group">
              <div className="relative">
                <img
                  src="/marketplace/shopee.svg"
                  alt="Shopee"
                  className="w-5 h-5"
                />
                {isOutOfSync && (
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-500 absolute -top-1 -right-1" />
                )}
              </div>
              <div className="absolute bottom-full right-0 mb-1.5 hidden group-hover:block z-[999]">
                <div className="bg-gray-900 dark:bg-slate-700 text-white text-xs rounded-lg px-3 py-2 shadow-lg min-w-[140px]">
                  <div className="font-medium mb-1">Sync กับ Shopee</div>
                  {isOutOfSync && (
                    <div className="flex items-center gap-1 text-amber-400 mb-1">
                      <AlertTriangle className="w-3 h-3" />
                      <span>มีการแก้ไขที่ยังไม่ sync</span>
                    </div>
                  )}
                  {promo.marketplace_deals!.map((d, i) => (
                    <div key={i} className="flex items-center gap-1.5 py-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.status === 'ongoing' ? 'bg-green-400' : d.status === 'upcoming' ? 'bg-blue-400' : 'bg-gray-400'}`} />
                      <span className="truncate">{d.shop_name}</span>
                    </div>
                  ))}
                  <div className="absolute top-full right-3 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-slate-700" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body: 2 columns — items left, info+actions right */}
      <div className="flex">
        {/* Left: Items list */}
        <div className="flex-[7] min-w-0 py-3">
          <div className="px-4 space-y-2">
            {promo.items.slice(0, 4).map((item, idx) => (
              <div key={idx} className="flex items-start gap-3">
                {/* Square image — clickable lightbox */}
                <div
                  className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0"
                  onClick={item.image ? (e) => { e.stopPropagation(); onImageClick(item.image!); } : undefined}
                  style={item.image ? { cursor: 'zoom-in' } : undefined}
                >
                  {item.image ? (
                    <img src={item.image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Package className="w-5 h-5 text-gray-300 dark:text-slate-500" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-1.5">
                    <p className="text-base text-gray-900 dark:text-slate-100 line-clamp-1 min-w-0">
                      {item.product_name}
                      {item.variation_label && (
                        <span className="text-gray-400 dark:text-slate-500"> ({item.variation_label})</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <RoleBadge role={item.role} />
                    {item.quantity > 1 && (
                      <span className="text-xs text-gray-500 dark:text-slate-400">x{item.quantity}</span>
                    )}
                    <span className="text-sm text-gray-500 dark:text-slate-400">
                      {item.max_price && item.max_price > item.default_price
                        ? `฿${formatPrice(item.default_price)} - ฿${formatPrice(item.max_price)}`
                        : `฿${formatPrice(item.default_price)}`}
                    </span>
                    {item.special_price != null && item.special_price > 0 && (
                      <span className="text-sm font-medium text-primary">
                        ฿{formatPrice(item.special_price)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {promo.items.length > 4 && (
              <p className="text-sm text-gray-400 dark:text-slate-500 pl-[60px]">
                + อีก {promo.items.length - 4} รายการ
              </p>
            )}
            {promo.items.length === 0 && (
              <p className="text-sm text-gray-400 dark:text-slate-500">ยังไม่มีสินค้า</p>
            )}
          </div>
        </div>

        {/* Right: Image, Price, date, actions */}
        <div className="flex-[3] py-3 px-4 flex flex-col justify-center items-end gap-2">
          {/* Promotion image */}
          {promo.image && (
            <div
              className="w-20 h-20 rounded-lg bg-gray-100 dark:bg-slate-700 overflow-hidden flex-shrink-0"
              onClick={(e) => { e.stopPropagation(); onImageClick(promo.image!); }}
              style={{ cursor: 'zoom-in' }}
            >
              <img src={promo.image} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Price */}
          {promo.promotion_type === 'qty_discount' ? (
            promo.tiers.length > 0 ? (
              <div className="text-right">
                <span className="text-sm text-gray-500 dark:text-slate-400">{promo.tiers.length} ขั้นส่วนลด</span>
              </div>
            ) : null
          ) : promo.promotion_type === 'bundle_set' && promo.discount_value ? (
            <div className="text-right">
              <span className="text-lg font-semibold text-primary">
                {promo.discount_type === 'percent' ? `ลด ${promo.discount_value}%` : `ลด ฿${formatPrice(promo.discount_value)}`}
              </span>
            </div>
          ) : promo.bundle_price ? (
            <div className="text-right">
              <span className="text-lg font-semibold text-gray-900 dark:text-white">
                ฿{formatPrice(promo.bundle_price)}
              </span>
            </div>
          ) : null}


          {/* Actions */}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <PromoActionMenu
              onEdit={onEdit}
              onDelete={onDelete}
              onPush={onPush}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────

function PromotionsPageContent() {
  const router = useRouter();
  const { showToast } = useToast();
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
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromotionItem | null>(null);
  const [deletingShopee, setDeletingShopee] = useState(false);
  const { features } = useFeatures();
  // ปิด marketplace แล้ว = ไม่มี deal ให้จัดการจากหน้านี้ · deal เก่าที่ค้างอยู่บน
  // Shopee ต้องเปิดฟีเจอร์กลับมาก่อนถึงจะสั่งลบจากที่นี่ได้
  const dealsOf = (p: PromotionItem | null) =>
    features.marketplace_sync ? (p?.marketplace_deals || []) : [];

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

  const handleDeleteClick = (promo: PromotionItem) => {
    setDeleteTarget(promo);
  };

  const handleDeleteConfirm = async (alsoDeleteShopee: boolean) => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    try {
      // If has shopee deals and user wants to delete them
      if (alsoDeleteShopee && dealsOf(deleteTarget).length > 0) {
        setDeletingShopee(true);
        await apiFetch(`/api/shopee/deals?promotion_id=${id}`, { method: 'DELETE' });
        setDeletingShopee(false);
      }
      // Soft delete promotion
      await apiFetch(`/api/promotions/${id}`, { method: 'DELETE' });
      setPromotions(prev => prev.filter(p => p.id !== id));
      setTotalRecords(prev => prev - 1);
      setDeleteTarget(null);
    } catch {
      setDeletingShopee(false);
      showToast('เกิดข้อผิดพลาดในการลบ', 'error');
    }
  };

  return (
    <Container size="full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader title="โปรโมชั่น" subtitle="จัดการโปรโมชั่นสินค้า" />
        <Link href="/promotions/new" className="btn btn-md btn-primary">
          <Plus className="w-4 h-4" />
          <span>สร้างโปรโมชั่น</span>
        </Link>
      </div>

      {/* Filters */}
      <div className="data-filter-card">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="ค้นหาชื่อโปรโมชั่น..."
          />
          <SearchableDropdown
            value={typeFilter}
            onChange={(v: string) => setParams({ type: v })}
            options={[
              { id: '', label: 'ทุกประเภท' },
              ...TYPE_OPTIONS,
            ]}
            placeholder="ประเภท"
          />
          <SearchableDropdown
            value={statusFilter}
            onChange={(v: string) => setParams({ status: v })}
            options={[
              { id: '', label: 'ทุกสถานะ' },
              ...STATUS_OPTIONS,
            ]}
            placeholder="สถานะ"
          />
          {hasActiveFilters && (
            <button
              onClick={() => {
                setSearchInput('');
                router.replace('/promotions', { scroll: false });
              }}
              className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <FilterX className="w-4 h-4" />
              ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* Card list */}
      {loading && <LoadingCard />}

      {!loading && promotions.length === 0 && (
        <EmptyCard title={hasActiveFilters ? 'ไม่พบโปรโมชั่นที่ตรงกับเงื่อนไข' : 'ยังไม่มีโปรโมชั่น'} />
      )}

      {!loading && promotions.length > 0 && (
        <div className="space-y-3">
          {promotions.map(promo => (
            <PromotionCard
              key={promo.id}
              promo={promo}
              onEdit={() => router.push(`/promotions/${promo.id}/edit`)}
              onDelete={() => handleDeleteClick(promo)}
              showMarketplace={features.marketplace_sync}
              onPush={
                features.marketplace_sync
                && (promo.status === 'active' || promo.status === 'scheduled')
                && promo.start_date && promo.end_date
                  ? () => setPushModalPromo(promo)
                  : undefined
              }
              onImageClick={(url) => setLightboxUrl(url)}
            />
          ))}
        </div>
      )}

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
          onLimitChange={(limit) => setParams({ limit: String(limit) })}
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

      {/* Image Lightbox */}
      {lightboxUrl && (
        <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />
      )}

      {/* Delete Confirm Dialog */}
      <Modal
        open={!!deleteTarget}
        onClose={() => !deletingShopee && setDeleteTarget(null)}
        title="ลบโปรโมชั่น"
        size="md"
        disableBackdropClose={deletingShopee}
      >
        {deleteTarget && (
          <>
            <p className="text-sm text-gray-600 dark:text-slate-400 mb-4">
              ต้องการลบ <span className="font-medium text-gray-900 dark:text-white">&quot;{deleteTarget.name}&quot;</span> ?
            </p>

            {(() => {
              const deals = dealsOf(deleteTarget);
              const ongoingDeals = deals.filter(d => d.status === 'ongoing');
              const hasOngoing = ongoingDeals.length > 0;
              if (deals.length === 0) return null;
              return (
                <div className={`border rounded-lg p-3 mb-4 ${hasOngoing ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'}`}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${hasOngoing ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`} />
                    <div>
                      <p className={`text-sm font-medium ${hasOngoing ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'}`}>
                        {hasOngoing
                          ? `โปรโมชั่นนี้กำลัง active อยู่บน Shopee ${ongoingDeals.length} ร้าน — ลบแล้ว deal จะถูกปิดทันที`
                          : `โปรโมชั่นนี้ sync กับ Shopee ${deals.length} ร้าน`
                        }
                      </p>
                      <div className="mt-1 space-y-0.5">
                        {deals.map((d, i) => (
                          <div key={i} className={`flex items-center gap-1.5 text-xs ${hasOngoing ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${d.status === 'ongoing' ? 'bg-red-500' : 'bg-amber-500'}`} />
                            {d.shop_name}
                            {d.status === 'ongoing' && <span className="text-red-500 font-medium">(กำลัง active)</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-col gap-2">
              {dealsOf(deleteTarget).length > 0 && (
                <Button
                  variant="danger"
                  fullWidth
                  loading={deletingShopee}
                  onClick={() => handleDeleteConfirm(true)}
                >
                  {deletingShopee ? 'กำลังลบจาก Shopee...' : 'ลบทั้งหมด (รวม Shopee)'}
                </Button>
              )}
              <Button
                variant={dealsOf(deleteTarget).length > 0 ? 'secondary' : 'danger'}
                fullWidth
                disabled={deletingShopee}
                onClick={() => handleDeleteConfirm(false)}
              >
                {dealsOf(deleteTarget).length > 0 ? 'ลบเฉพาะในระบบ (เก็บ Shopee ไว้)' : 'ยืนยันลบ'}
              </Button>
              <Button
                variant="ghost"
                fullWidth
                disabled={deletingShopee}
                onClick={() => setDeleteTarget(null)}
              >
                ยกเลิก
              </Button>
            </div>
          </>
        )}
      </Modal>
    </Container>
  );
}

export default function PromotionsPage() {
  return (
    <Layout>
      <Suspense fallback={<LoadingCard />}>
        <PromotionsPageContent />
      </Suspense>
    </Layout>
  );
}
