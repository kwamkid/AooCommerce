// Path: app/products/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuthGuard } from '@/lib/useAuthGuard';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { LoadingCard } from '@/components/ui/StateCard';
import Alert from '@/components/ui/Alert';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import SearchInput from '@/components/ui/SearchInput';
import StatusTabs from '@/components/ui/StatusTabs';
import BulkActionBar from '@/components/ui/BulkActionBar';
import HelpHint from '@/components/ui/HelpHint';
import Tooltip from '@/components/ui/Tooltip';
import { ExportButton } from '@/components/ui/ExportImportButton';
import { useAuth } from '@/lib/auth-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { getImageUrl } from '@/lib/utils/image';
import { formatNumber } from '@/lib/utils/format';
import { useFeatures } from '@/lib/features-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import {
  Plus,
  Edit2,
  Trash2,
  Copy,
  Package2,
  Loader2,
  Award,
  Pencil,
  SlidersHorizontal,
  X,
  ChevronDown,
  Warehouse,
} from 'lucide-react';
import SharedActionMenu from '@/components/ui/ActionMenu';
import SearchableDropdown, { DropdownOption } from '@/components/ui/SearchableDropdown';
import FormSelect from '@/components/ui/FormSelect';
import Toggle from '@/components/ui/Toggle';
import PageHeader from '@/components/ui/PageHeader';
import { downloadBlob } from '@/lib/utils/download';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { COMPOSITE_COLUMN_HEADER, COMPOSITE_TYPE_LABEL, PRICE_LOCKED_HEADER, PRICE_LOCKED_YES } from '@/lib/bulk/composite-ref';

// ── Types ──

interface Variation {
  variation_id?: string;
  variation_label: string;
  sku?: string;
  barcode?: string;
  default_price: number;
  discount_price: number;
  cost_price?: number | null;
  is_active: boolean;
  image_url?: string | null;
  min_stock?: number | null;
  /** พร้อมขาย (on hand − reserved) — only when the list is fetched with include_stock */
  available?: number;
  /** ในคลัง — only with include_stock */
  on_hand?: number;
}

// Product interface (from API view)
interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  description?: string;
  image?: string;
  main_image_url?: string;
  product_type: 'simple' | 'variation';
  /** สินค้าชุด — combos of other products (product_type stays 'variation') */
  is_composite?: boolean;
  category_id?: string;
  brand_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  simple_variation_label?: string;
  simple_sku?: string;
  simple_barcode?: string;
  simple_default_price?: number;
  simple_discount_price?: number;
  variations: Variation[];
  /** Σ available of active variations (non-composite, include_stock only) */
  stock_available?: number;
  /** Composite: active combos with available > 0 / active combos (include_stock only) */
  stock_combos_in_stock?: number;
  stock_combos_total?: number;
}

/** Table row: a product, or one of its variations shown as a sub-row */
type ProductRow =
  | { kind: 'product'; product: ProductItem }
  | { kind: 'variation'; product: ProductItem; v: Variation };

type StatusCounts = { active: number; inactive: number; all: number };

interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
  children?: CategoryOption[];
}

interface BrandOption {
  id: string;
  name: string;
}

interface WarehouseOption {
  id: string;
  name: string;
  warehouse_type?: 'internal' | 'consignment' | string;
  customer?: { id: string; name: string } | null;
}

/** GET /api/products/[id]/stock */
interface WarehouseStock {
  warehouse_id: string;
  name: string;
  type: 'internal' | 'consignment';
  customer_name: string | null;
  is_default: boolean;
  quantity: number;
  available: number;
  variations: { variation_id: string; quantity: number; available: number }[];
}

type BreakdownEntry =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; warehouses: WarehouseStock[] };

// ── Helpers ──

const DASH = <span className="text-gray-400 dark:text-slate-500">-</span>;

const variationKey = (product: ProductItem, v: Variation) =>
  v.variation_id || `${product.product_id}-${v.variation_label}`;

const activeVariations = (product: ProductItem) => product.variations.filter(v => v.is_active !== false);

/** Price the customer pays — discount when set, otherwise the normal price */
const effectivePrice = (v: Pick<Variation, 'default_price' | 'discount_price'>) =>
  (v.discount_price > 0 ? v.discount_price : v.default_price) ?? 0;

/** `฿199 – ฿249` · single value when equal · null when empty */
function moneyRange(values: number[]): string | null {
  if (values.length === 0) return null;
  const lo = formatNumber(Math.min(...values));
  const hi = formatNumber(Math.max(...values));
  return lo === hi ? `฿${lo}` : `฿${lo} – ฿${hi}`;
}

/** Effective-price range over ACTIVE variations of a variation-type product */
const priceRangeOf = (product: ProductItem) => moneyRange(activeVariations(product).map(effectivePrice));

const optionCountLabel = (product: ProductItem, count: number) =>
  `${count} ${product.is_composite ? 'ชุดย่อย' : 'ตัวเลือก'}`;

/** ประเภทสินค้า — table column + mobile card */
function ProductTypeBadge({ product }: { product: Pick<ProductItem, 'product_type' | 'is_composite'> }) {
  if (product.is_composite) return <Badge tone="purple" shape="square" size="sm">ชุด</Badge>;
  return (
    <Badge tone={product.product_type === 'simple' ? 'blue' : 'amber'} shape="square" size="sm">
      {product.product_type === 'simple' ? 'ปกติ' : 'มีตัวเลือก'}
    </Badge>
  );
}

/** Normal price struck through + red discount price */
function PriceText({ def, disc }: { def: number | null | undefined; disc: number | null | undefined }) {
  const hasDiscount = disc != null && disc > 0;
  return (
    <div className="text-base flex items-center gap-1 whitespace-nowrap">
      <span className="text-gray-400 font-medium">฿</span>
      <span className={hasDiscount ? 'text-gray-400 line-through dark:text-slate-500' : ''}>
        {formatNumber(def)}
      </span>
      {hasDiscount && (
        <span className="text-red-600 dark:text-red-400 font-medium">(฿{formatNumber(disc)})</span>
      )}
    </div>
  );
}

/** พร้อมขาย: ≤ 0 red (exactly 0 = "หมด") · at/below min stock amber · else normal */
function StockNumber({ available, minStock = 0 }: { available: number; minStock?: number }) {
  const tone = available <= 0
    ? 'text-red-600 dark:text-red-400 font-medium'
    : minStock > 0 && available <= minStock
      ? 'text-amber-600 dark:text-amber-400 font-medium'
      : 'text-gray-900 dark:text-slate-100';
  return (
    <span className={`tabular-nums ${tone}`}>
      {available === 0 ? 'หมด' : formatNumber(available)}
    </span>
  );
}

/** Composite: combos in stock / combos — muted when none */
function ComboStock({ inStock, total }: { inStock: number; total: number }) {
  return (
    <span className={`tabular-nums ${inStock === 0 ? 'text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-slate-100'}`}>
      {inStock}/{total} ชุด
    </span>
  );
}

/** พร้อมขาย of a product row (all product types) — dash when stock wasn't loaded */
function ProductStockValue({ product }: { product: ProductItem }) {
  if (product.is_composite) {
    if (product.stock_combos_total == null) return DASH;
    return <ComboStock inStock={product.stock_combos_in_stock ?? 0} total={product.stock_combos_total} />;
  }
  if (product.product_type === 'simple') {
    const v = product.variations.find(x => x.is_active !== false) ?? product.variations[0];
    if (v?.available == null) return DASH;
    return <StockNumber available={v.available} minStock={v.min_stock ?? 0} />;
  }
  if (product.stock_available == null) return DASH;
  // The number is the sum over active variations → compare with the summed minimum
  const minSum = activeVariations(product).reduce((sum, v) => sum + (v.min_stock ?? 0), 0);
  return <StockNumber available={product.stock_available} minStock={minSum} />;
}

/**
 * Popover content: พร้อมขายแยกตามคลัง.
 * - `variationId` → that variation only (sub-row)
 * - `comboIds` → composite product row: combos in stock / combos per warehouse
 *   (summing combos double-counts shared components)
 * - neither → product totals per warehouse
 */
function WarehouseBreakdown({ entry, variationId, comboIds }: {
  entry?: BreakdownEntry;
  variationId?: string;
  comboIds?: string[];
}) {
  let body: React.ReactNode;
  if (!entry || entry.status === 'loading') {
    body = (
      <div className="flex items-center gap-2 text-gray-300">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        กำลังโหลด...
      </div>
    );
  } else if (entry.status === 'error') {
    body = <div className="text-red-300">โหลดข้อมูลไม่สำเร็จ</div>;
  } else {
    const rows = entry.warehouses.flatMap(w => {
      if (variationId) {
        const x = w.variations.find(v => v.variation_id === variationId);
        return x ? [{ w, value: <>{formatNumber(x.available)}</>, onHand: x.quantity, available: x.available }] : [];
      }
      if (comboIds) {
        const inStock = w.variations.filter(v => comboIds.includes(v.variation_id) && v.available > 0).length;
        return [{ w, value: <>{inStock}/{comboIds.length} ชุด</>, onHand: 0, available: 0 }];
      }
      return [{ w, value: <>{formatNumber(w.available)}</>, onHand: w.quantity, available: w.available }];
    });
    body = rows.length === 0 ? (
      <div className="text-gray-300">ยังไม่มีสต็อกในคลังใด</div>
    ) : (
      <ul className="space-y-1.5">
        {rows.map(({ w, value, onHand, available }) => (
          <li key={w.warehouse_id} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span>{w.name}</span>
                {w.type === 'consignment' && <Badge tone="amber" size="sm">ฝากขาย</Badge>}
              </div>
              {w.type === 'consignment' && w.customer_name && (
                <div className="text-gray-400">{w.customer_name}</div>
              )}
            </div>
            <div className="text-right whitespace-nowrap tabular-nums">
              <span className="font-semibold">{value}</span>
              {onHand !== available && (
                <div className="text-gray-400">(ในคลัง {formatNumber(onHand)})</div>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="min-w-[220px] space-y-1.5">
      <div className="font-semibold text-white">พร้อมขายแยกตามคลัง</div>
      {body}
    </div>
  );
}

function ProductActionMenu({ onEdit, onDuplicate, onDelete }: {
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <SharedActionMenu items={[
      { key: 'edit', label: 'แก้ไข', icon: <Edit2 className="w-3.5 h-3.5" />, onClick: onEdit },
      { key: 'duplicate', label: 'คัดลอก', icon: <Copy className="w-3.5 h-3.5" />, onClick: onDuplicate },
      { key: 'delete', label: 'ลบ', icon: <Trash2 className="w-3.5 h-3.5" />, danger: true, onClick: onDelete },
    ]} />
  );
}

function ProductsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile, loading: authLoading } = useAuth();
  const canViewCost = userProfile?.canViewCost === true;
  const { features } = useFeatures();
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  // Derive filter values from URL search params
  const typeFilter = searchParams.get('type') || '';
  const categoryFilter = searchParams.get('cat') || '';
  const brandFilter = searchParams.get('brand') || '';
  const shopAccountFilter = searchParams.get('shop') || 'all';
  const statusFilter = searchParams.get('status') || '';
  const warehouseFilter = searchParams.get('wh') || '';
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const rowsPerPage = parseInt(searchParams.get('limit') || '20', 10);
  const debouncedSearch = searchParams.get('q') || '';

  // Local search input state (for immediate keystroke feedback)
  const [searchInput, setSearchInput] = useState(debouncedSearch);
  // Mobile: collapse non-search filters by default
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Sync search input when URL param changes externally (e.g. browser back)
  useEffect(() => { setSearchInput(debouncedSearch); }, [debouncedSearch]);

  // Helper to update URL params
  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    const hasExplicitPage = 'page' in updates;
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      const defaults: Record<string, string> = { type: '', cat: '', brand: '', shop: 'all', status: '', wh: '', q: '', page: '1', limit: '20' };
      if (v === defaults[k] || v === '') params.delete(k);
      else params.set(k, v);
    }
    // Auto-reset page to 1 when filters change, but only if page wasn't explicitly passed
    if (pageReset && !hasExplicitPage) params.delete('page');
    // Always keep page param so API paginates (page=1 means "page 1", not "no pagination")
    if (!params.has('page')) params.set('page', '1');
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '/products', { scroll: false });
  }, [searchParams, router]);

  // Debounced search handler — ค่าว่าง = เคลียร์ทันที ไม่ต้องรอ debounce
  const debouncedSetQ = useDebouncedCallback((val: string) => setParams({ q: val }), 300);
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (!val) {
      setParams({ q: '' });
      return;
    }
    debouncedSetQ(val);
  }, [setParams, debouncedSetQ]);

  // Check if any filter is active (status is a tab, not a filter)
  const hasActiveFilters = !!(
    debouncedSearch || typeFilter || categoryFilter || brandFilter
    || (features.stock && warehouseFilter) || (shopAccountFilter !== 'all')
  );

  // Clears the filter card; keeps the selected status tab
  const clearAllFilters = useCallback(() => {
    setSearchInput('');
    router.replace(statusFilter ? `/products?status=${statusFilter}` : '/products', { scroll: false });
  }, [router, statusFilter]);

  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false); // loading indicator for page changes
  const [dataFetched, setDataFetched] = useState(false);
  const [shopOptions, setShopOptions] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [error, setError] = useState('');

  // Load time
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Bulk selection (product ids only — variation sub-rows aren't selectable)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [bulkBrandId, setBulkBrandId] = useState('');
  const [bulkBrandSaving, setBulkBrandSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Mobile cards: products whose option list is expanded
  const [mobileExpanded, setMobileExpanded] = useState<Set<string>>(() => new Set());
  const toggleMobileExpanded = (productId: string) => {
    setMobileExpanded(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId); else next.add(productId);
      return next;
    });
  };

  // Warehouse breakdown popover — fetched once per product, cleared on list refetch
  const [breakdowns, setBreakdowns] = useState<Map<string, BreakdownEntry>>(() => new Map());
  const breakdownRequested = useRef<Set<string>>(new Set());
  const breakdownGen = useRef(0);
  const resetBreakdowns = () => {
    breakdownGen.current += 1;
    breakdownRequested.current = new Set();
    setBreakdowns(new Map());
  };
  const loadBreakdown = async (productId: string) => {
    if (breakdownRequested.current.has(productId)) return;
    breakdownRequested.current.add(productId);
    const gen = breakdownGen.current;
    setBreakdowns(prev => new Map(prev).set(productId, { status: 'loading' }));
    let entry: BreakdownEntry;
    try {
      const res = await apiFetch(`/api/products/${productId}/stock`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      entry = { status: 'ready', warehouses: data.warehouses || [] };
    } catch (err) {
      console.error('Failed to load stock by warehouse:', err);
      breakdownRequested.current.delete(productId); // reopen = retry
      entry = { status: 'error' };
    }
    if (gen !== breakdownGen.current) return; // list was refetched meanwhile
    setBreakdowns(prev => new Map(prev).set(productId, entry));
  };

  // Total count from server
  const [totalProducts, setTotalProducts] = useState(0);

  // Fetch products with server-side pagination
  const fetchData = async () => {
    const t0 = Date.now();
    setFetching(true);
    try {
      // view=list → one RPC: page + variations + images + stock + tab counts + shop options
      const params = new URLSearchParams({
        view: 'list',
        page: String(currentPage),
        limit: String(rowsPerPage),
        include_shop_options: '1',
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (typeFilter) params.set('type', typeFilter);
      if (categoryFilter !== '') params.set('category_id', categoryFilter);
      if (brandFilter !== '') params.set('brand_id', brandFilter);
      // ตัวกรองร้านถูกซ่อนเมื่อปิด marketplace — ค่าที่ค้างใน URL ก็ต้องไม่ถูกใช้ต่อ
      if (features.marketplace_sync && shopAccountFilter !== 'all') params.set('shop_account_id', shopAccountFilter);
      if (statusFilter) params.set('status', statusFilter);
      // Real stock only when the company uses the stock system
      if (features.stock) {
        params.set('include_stock', '1');
        if (warehouseFilter) params.set('warehouse_id', warehouseFilter);
      }

      const response = await apiFetch(`/api/products?${params.toString()}`);
      const data = await response.json();
      setProductsList(data.products || []);
      setTotalProducts(data.total ?? data.products?.length ?? 0);
      setStatusCounts(data.status_counts ?? null);
      resetBreakdowns();
      // Update shop options on first load
      if (data.shopOptions) {
        setShopOptions((data.shopOptions as { id: string; name: string; platform: string; icon?: string | null }[]).map(s => ({
          id: s.id,
          label: s.name,
          icon: s.icon || undefined,
          platformIcon: s.platform === 'shopee' ? '/marketplace/shopee.svg' : undefined,
        })));
      }
      setDataFetched(true);
      setLoadTime((Date.now() - t0) / 1000);
    } catch (err) {
      console.error('Error fetching products:', err);
      setError('ไม่สามารถโหลดข้อมูลได้');
      setLoadTime(null);
    } finally {
      setLoading(false);
      setFetching(false);
    }
  };

  useFetchOnce(() => {
    fetchData();
    const fetchFilters = async () => {
      try {
        const res = await apiFetch('/api/products/form-options');
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
          setBrands(data.brands || []);
        }
      } catch (e) {
        console.error('Failed to fetch filters:', e);
      }
    };
    fetchFilters();
  }, !authLoading && !!userProfile);

  // Warehouse filter options — once, only for companies with the stock system
  const warehousesRequested = useRef(false);
  useEffect(() => {
    if (!features.stock || !userProfile || warehousesRequested.current) return;
    warehousesRequested.current = true;
    (async () => {
      try {
        const res = await apiFetch('/api/warehouses?include_consignment=true');
        if (res.ok) {
          const data = await res.json();
          setWarehouses(data.warehouses || []);
        }
      } catch (e) {
        console.error('Failed to fetch warehouses:', e);
      }
    })();
  }, [features.stock, userProfile]);

  // Re-fetch when URL-derived filter/pagination values change (after initial load)
  useEffect(() => {
    if (dataFetched) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, debouncedSearch, typeFilter, categoryFilter, brandFilter, shopAccountFilter, statusFilter, warehouseFilter, features.marketplace_sync, features.stock]);

  // Optimistic is_active toggle — filter-aware (remove from list if new state doesn't match current filter)
  const handleToggleActive = async (product: ProductItem, next: boolean) => {
    const filterMatchesNext = statusFilter === 'all' || (statusFilter === 'inactive' ? !next : next);
    if (filterMatchesNext) {
      setProductsList(prev => prev.map(p => p.product_id === product.product_id ? { ...p, is_active: next } : p));
    } else {
      setProductsList(prev => prev.filter(p => p.product_id !== product.product_id));
      setTotalProducts(t => Math.max(0, t - 1));
    }
    try {
      const response = await apiFetch('/api/products', {
        method: 'PUT',
        body: JSON.stringify({ id: product.product_id, is_active: next }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถเปลี่ยนสถานะได้');
      // Keep the status tab counts in step with the move
      setStatusCounts(c => c ? {
        ...c,
        active: Math.max(0, c.active + (next ? 1 : -1)),
        inactive: Math.max(0, c.inactive + (next ? -1 : 1)),
      } : c);
    } catch (err) {
      if (filterMatchesNext) {
        setProductsList(prev => prev.map(p => p.product_id === product.product_id ? { ...p, is_active: !next } : p));
      } else {
        fetchData();
      }
      showToast(err instanceof Error ? err.message : 'ไม่สามารถเปลี่ยนสถานะได้', 'error');
    }
  };

  // Handle delete
  const handleDelete = async (product: ProductItem) => {
    const ok = await confirm({ title: `ต้องการลบ "${product.name}"?`, variant: 'danger' }); if (!ok) return;
    try {
      const response = await apiFetch(`/api/products?id=${product.product_id}`, {
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถลบได้');
      showToast('ลบสินค้าสำเร็จ');
      setDataFetched(false);
      fetchData();
    } catch (err) {
      console.error('Error deleting:', err);
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    }
  };

  // Bulk delete
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirm({ title: `ต้องการลบสินค้า ${selectedIds.size} รายการ?`, variant: 'danger' }); if (!ok) return;
    setBulkDeleting(true);
    try {
      const ids = [...selectedIds].join(',');
      const response = await apiFetch(`/api/products?ids=${ids}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถลบได้');
      showToast(`ลบสินค้า ${selectedIds.size} รายการสำเร็จ`);
      setSelectedIds(new Set());
      setDataFetched(false);
      fetchData();
    } catch (err) {
      console.error('Bulk delete error:', err);
      showToast(err instanceof Error ? err.message : 'ไม่สามารถลบได้', 'error');
    } finally {
      setBulkDeleting(false);
    }
  };

  // Bulk assign brand
  const existingBrandCount = productsList.filter(p => selectedIds.has(p.product_id) && p.brand_id).length;

  const handleBulkAssignBrand = async () => {
    if (!bulkBrandId || selectedIds.size === 0) return;
    setBulkBrandSaving(true);
    try {
      const response = await apiFetch('/api/products/bulk-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_ids: [...selectedIds], brand_id: bulkBrandId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'ไม่สามารถกำหนด Brand ได้');
      const brandName = brands.find(b => b.id === bulkBrandId)?.name || '';
      showToast(`กำหนด Brand "${brandName}" ให้สินค้า ${selectedIds.size} รายการสำเร็จ`);
      setSelectedIds(new Set());
      setShowBrandModal(false);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ไม่สามารถกำหนด Brand ได้', 'error');
    } finally {
      setBulkBrandSaving(false);
    }
  };

  // Clear selection when filters/page change
  useEffect(() => { setSelectedIds(new Set()); }, [debouncedSearch, typeFilter, categoryFilter, brandFilter, shopAccountFilter, statusFilter, warehouseFilter, currentPage]);

  // Server filters + paginates (type included) — rows are exactly one page
  const totalPages = Math.ceil(totalProducts / rowsPerPage);
  const tableRows: ProductRow[] = productsList.map(product => ({ kind: 'product', product }));
  const subRowsOf = (row: ProductRow): ProductRow[] | null =>
    row.kind === 'product' && row.product.product_type === 'variation' && row.product.variations.length > 0
      ? row.product.variations.map(v => ({ kind: 'variation' as const, product: row.product, v }))
      : null;

  // Clear error alert
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => { setError(''); }, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;

      // Single RPC call: products + shops + marketplace links
      const exportRes = await apiFetch('/api/products/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search: debouncedSearch || undefined,
          category_id: categoryFilter || undefined,
          brand_id: brandFilter || undefined,
          shop_account_id: features.marketplace_sync && shopAccountFilter !== 'all' ? shopAccountFilter : undefined,
        }),
      });
      const exportData = await exportRes.json();
      // Composite products (สินค้าชุด) carry is_composite + per-combo components / price_locked
      type ExportProduct = ProductItem & {
        is_composite?: boolean;
        variations: (ProductItem['variations'][number] & { components?: string; price_locked?: boolean })[];
      };
      const allProducts: ExportProduct[] = exportData.products || [];
      // คอลัมน์ "ราคา {ร้าน}" มีแต่ร้าน marketplace — ปิดฟีเจอร์แล้วไฟล์ที่ export
      // ต้องไม่มีคอลัมน์พวกนี้ (ไม่งั้นผู้ใช้เห็นชื่อ Shopee ในไฟล์ทั้งที่ปิดไปแล้ว)
      const activeShops: { id: string; shop_name: string; platform: string }[] =
        features.marketplace_sync ? (exportData.shops || []) : [];
      const canViewCost: boolean = exportData.can_view_cost === true;

      type LinkInfo = { variation_id: string; account_id: string; platform_price: number | null; platform_discount_price: number | null };
      const linkMap = new Map<string, Map<string, LinkInfo>>();
      for (const link of (exportData.links || []) as LinkInfo[]) {
        if (!linkMap.has(link.variation_id)) linkMap.set(link.variation_id, new Map());
        linkMap.get(link.variation_id)!.set(link.account_id, link);
      }

      // /api/products/export has no type param — filter here (same 3 types as the list)
      const matchesType = (p: ExportProduct) => {
        if (!typeFilter) return true;
        if (typeFilter === 'composite') return p.is_composite === true;
        if (typeFilter === 'variation') return p.product_type === 'variation' && !p.is_composite;
        return p.product_type === typeFilter;
      };
      const filtered = allProducts.filter(matchesType);

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('สินค้า');

      // Build dynamic headers: base columns + (cost if allowed) + marketplace shop columns
      const baseHeaders = [
        'product_id', 'variation_id', 'รหัสสินค้า', 'ชื่อสินค้า', 'ประเภท', 'ตัวเลือก',
        'SKU', 'Barcode', 'ราคาปกติ', 'ราคาขาย',
        ...(canViewCost ? ['ราคาทุน'] : []),
        'สถานะ',
        COMPOSITE_COLUMN_HEADER, PRICE_LOCKED_HEADER,
      ];
      const shopHeaders = activeShops.map(s => `ราคา ${s.shop_name || s.id}`);
      const headers = [...baseHeaders, ...shopHeaders];
      const headerRow = ws.addRow(headers);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } };
        cell.alignment = { horizontal: 'center' };
      });

      // ID column styles
      const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F0F0' } };
      const grayFont = { color: { argb: 'FF999999' }, size: 9 };

      // Data rows
      type RowData = { productId: string; variationId: string; isParent: boolean; values: (string | number)[] };
      const dataRows: RowData[] = [];

      // For simple products, if variation_label = SKU/code/barcode, show "-" instead
      const cleanVariationLabel = (label: string | undefined, sku?: string, barcode?: string, code?: string) => {
        if (!label || label === '-') return '-';
        if (label === sku || label === barcode || label === code) return '-';
        return label;
      };

      const getShopPrices = (varId?: string) =>
        activeShops.map(shop => {
          if (!varId) return '';
          const link = linkMap.get(varId)?.get(shop.id);
          if (!link) return '';
          return link.platform_discount_price || link.platform_price || '';
        });

      for (const product of filtered) {
        // A composite product is always parent row + one row per combo
        const isMulti = product.variations.length > 1 || product.is_composite === true;
        if (!isMulti) {
          const v = product.variations[0];
          dataRows.push({
            productId: product.product_id,
            variationId: v?.variation_id || '',
            isParent: true,
            values: [
              product.product_id, v?.variation_id || '',
              product.code || '', product.name,
              'สินค้าปกติ', cleanVariationLabel(v?.variation_label, v?.sku, v?.barcode, product.code),
              v?.sku || '', v?.barcode || '',
              v?.default_price ?? 0, v?.discount_price ?? 0,
              ...(canViewCost ? [v?.cost_price ?? 0] : []),
              product.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน',
              '', '',
              ...getShopPrices(v?.variation_id),
            ],
          });
        } else {
          dataRows.push({
            productId: product.product_id,
            variationId: '',
            isParent: true,
            values: [
              product.product_id, '',
              product.code || '', product.name,
              `${product.is_composite ? COMPOSITE_TYPE_LABEL : 'สินค้าย่อย'} (${product.variations.length})`, '',
              '', '', '', '',
              ...(canViewCost ? [''] : []),
              product.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน',
              '', '',
              ...activeShops.map(() => ''),
            ],
          });
          for (const v of product.variations) {
            dataRows.push({
              productId: product.product_id,
              variationId: v.variation_id || '',
              isParent: false,
              values: [
                product.product_id, v.variation_id || '',
                '', '',
                '', v.variation_label || '-',
                v.sku || '', v.barcode || '',
                v.default_price ?? 0, v.discount_price ?? 0,
                ...(canViewCost ? [v.cost_price ?? 0] : []),
                v.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน',
                v.components || '', v.price_locked ? PRICE_LOCKED_YES : '',
                ...getShopPrices(v.variation_id),
              ],
            });
          }
        }
      }

      for (const row of dataRows) {
        const excelRow = ws.addRow(row.values);
        // Lock + gray ID columns (A, B)
        excelRow.getCell(1).fill = grayFill;
        excelRow.getCell(1).font = grayFont;
        excelRow.getCell(1).protection = { locked: true };
        excelRow.getCell(2).fill = grayFill;
        excelRow.getCell(2).font = grayFont;
        excelRow.getCell(2).protection = { locked: true };

        if (row.isParent) {
          excelRow.getCell(4).font = { bold: true };
        }
      }

      // Column widths
      ws.columns = [
        { width: 12 }, // product_id
        { width: 12 }, // variation_id
        { width: 16 }, // รหัสสินค้า
        { width: 35 }, // ชื่อสินค้า
        { width: 14 }, // ประเภท
        { width: 20 }, // ตัวเลือก
        { width: 16 }, // SKU
        { width: 16 }, // Barcode
        { width: 12 }, // ราคาปกติ
        { width: 12 }, // ราคาขาย
        ...(canViewCost ? [{ width: 12 }] : []), // ราคาทุน
        { width: 10 }, // สถานะ
        { width: 36 }, // ส่วนประกอบ (สินค้าชุด)
        { width: 12 }, // ราคาตั้งเอง
        ...activeShops.map(() => ({ width: 14 })),
      ];

      // Protect sheet — only ID columns locked, rest editable
      ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: true,
        sort: true,
        autoFilter: true,
      });
      // Unlock all cells first, then lock only ID columns
      ws.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: false };
        });
        // Re-lock ID columns
        row.getCell(1).protection = { locked: true };
        row.getCell(2).protection = { locked: true };
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const date = new Date().toISOString().slice(0, 10);
      const filterLabel = hasActiveFilters ? 'filter' : 'all';
      downloadBlob(blob, `${filterLabel}-product-${dataRows.length}-${date}.xlsx`);
      showToast(`ส่งออกสินค้า ${filtered.length} รายการสำเร็จ`);
    } catch (err) {
      console.error('Export error:', err);
      showToast('ส่งออกไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ── Warehouse filter options: internal first, then consignment ──
  const warehouseOptions = [
    ...warehouses
      .filter(w => w.warehouse_type !== 'consignment')
      .map(w => ({ id: w.id, label: w.name })),
    ...warehouses
      .filter(w => w.warehouse_type === 'consignment')
      .map(w => ({ id: w.id, label: w.name, subtitle: w.customer?.name ? `${w.customer.name} · ฝากขาย` : 'ฝากขาย' })),
  ];

  /** Warehouse-breakdown trigger next to a พร้อมขาย number (variationId = sub-row) */
  const stockBreakdownTrigger = (product: ProductItem, variationId?: string) => (
    <HelpHint
      portal
      align="right"
      ariaLabel="ดูแยกตามคลัง"
      trigger={<Warehouse className="w-4 h-4" />}
      onOpenChange={(open) => { if (open) void loadBreakdown(product.product_id); }}
    >
      <WarehouseBreakdown
        entry={breakdowns.get(product.product_id)}
        variationId={variationId}
        comboIds={!variationId && product.is_composite
          ? activeVariations(product).map(v => v.variation_id).filter((id): id is string => !!id)
          : undefined}
      />
    </HelpHint>
  );

  const openEdit = (productId: string) => window.open(`/products/${productId}/edit`, '_blank');

  // ── Column definitions for DataTable ──
  const costColumns: DataTableColumn<ProductRow>[] = canViewCost ? [{
    key: 'cost',
    label: 'ราคาทุน',
    defaultVisible: false,
    defaultWidth: 120,
    reorderable: true,
    resizable: true,
    render: (row) => {
      if (row.kind === 'variation') {
        return row.v.cost_price != null
          ? <span className="text-base whitespace-nowrap">฿{formatNumber(row.v.cost_price)}</span>
          : DASH;
      }
      const { product } = row;
      if (product.product_type === 'simple') {
        const cost = product.variations?.[0]?.cost_price;
        return cost != null ? <span className="text-base whitespace-nowrap">฿{formatNumber(cost)}</span> : DASH;
      }
      const range = moneyRange(
        activeVariations(product).map(v => v.cost_price).filter((c): c is number => c != null),
      );
      return range ? <span className="text-base whitespace-nowrap">{range}</span> : DASH;
    },
  }] : [];

  const stockColumns: DataTableColumn<ProductRow>[] = features.stock ? [{
    key: 'stock',
    label: warehouseFilter ? 'พร้อมขาย (คลังนี้)' : 'พร้อมขาย',
    defaultWidth: 110,
    align: 'right',
    reorderable: true,
    resizable: true,
    render: (row) => {
      if (row.kind === 'variation') {
        const { v } = row;
        return (
          <span className="inline-flex items-center justify-end text-base whitespace-nowrap">
            {v.available == null ? DASH : <StockNumber available={v.available} minStock={v.min_stock ?? 0} />}
            {v.variation_id && stockBreakdownTrigger(row.product, v.variation_id)}
          </span>
        );
      }
      return (
        <span className="inline-flex items-center justify-end text-base whitespace-nowrap">
          <ProductStockValue product={row.product} />
          {stockBreakdownTrigger(row.product)}
        </span>
      );
    },
  }] : [];

  const columns: DataTableColumn<ProductRow>[] = [
    {
      key: 'image',
      label: 'รูป',
      defaultWidth: 72,
      hideMobile: true,
      headerClassName: '!px-1',
      cellClassName: '!px-1 !py-1.5',
      render: (row) => row.kind === 'variation' ? (
        <ProductImageThumb
          src={row.v.image_url || null}
          alt={row.v.variation_label}
          size="sm"
          className="mx-auto"
          fallbackIcon={<Package2 className="w-4 h-4 text-gray-400" />}
        />
      ) : (
        <ProductImageThumb
          src={row.product.main_image_url || getImageUrl(row.product.image)}
          alt={row.product.name}
          size="lg"
          fallbackIcon={<Package2 className="w-7 h-7 text-gray-400" />}
        />
      ),
    },
    {
      key: 'nameCode',
      label: 'ชื่อ/รหัส',
      alwaysVisible: true,
      grow: true,
      defaultWidth: 340,
      reorderable: true,
      render: (row) => {
        if (row.kind === 'variation') {
          const { v } = row;
          return (
            <div className="pl-4">
              <div className="flex items-center gap-1.5 text-base text-gray-700 dark:text-slate-300">
                <span className="line-clamp-2">{v.variation_label || '-'}</span>
                {!v.is_active && <Badge tone="gray" shape="square" size="sm">ปิด</Badge>}
              </div>
              {v.sku && <div className="code-text text-gray-400 dark:text-slate-500">{v.sku}</div>}
            </div>
          );
        }
        const { product } = row;
        const isVariationType = product.product_type === 'variation';
        return (
          <div>
            <div className="data-primary text-gray-900 dark:text-slate-100 text-base line-clamp-2">
              {product.name}
            </div>
            <div className="text-sm text-gray-400 dark:text-slate-500">
              {product.code && <span className="code-text">{product.code}</span>}
              {isVariationType && (
                <span>{product.code ? ' · ' : ''}{optionCountLabel(product, activeVariations(product).length)}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'price',
      label: 'ราคา',
      defaultWidth: 150,
      reorderable: true,
      resizable: true,
      render: (row) => {
        if (row.kind === 'variation') return <PriceText def={row.v.default_price} disc={row.v.discount_price} />;
        const { product } = row;
        if (product.product_type === 'simple') {
          return <PriceText def={product.simple_default_price} disc={product.simple_discount_price} />;
        }
        const range = priceRangeOf(product);
        return range ? <span className="text-base whitespace-nowrap">{range}</span> : DASH;
      },
    },
    ...stockColumns,
    ...costColumns,
    {
      key: 'sku',
      label: 'SKU',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (row) => {
        if (row.kind === 'variation') return row.v.sku ? <div className="code-text">{row.v.sku}</div> : DASH;
        if (row.product.product_type !== 'simple') return null;
        return row.product.simple_sku ? <div className="code-text">{row.product.simple_sku}</div> : DASH;
      },
    },
    {
      key: 'barcode',
      label: 'Barcode',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (row) => {
        if (row.kind === 'variation') return row.v.barcode ? <div className="code-text">{row.v.barcode}</div> : DASH;
        if (row.product.product_type !== 'simple') return null;
        return row.product.simple_barcode ? <div className="code-text">{row.product.simple_barcode}</div> : DASH;
      },
    },
    {
      key: 'category',
      label: 'หมวดหมู่',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (row) => {
        if (row.kind === 'variation') return null;
        const { product } = row;
        if (!product.category_id) return DASH;
        // Walk flat: check parents and children for a matching id
        for (const parent of categories) {
          if (parent.id === product.category_id) return <span className="text-base">{parent.name}</span>;
          if (parent.children) {
            const child = parent.children.find(c => c.id === product.category_id);
            if (child) return <span className="text-base">{child.name}<span className="text-gray-400 dark:text-slate-500"> · {parent.name}</span></span>;
          }
        }
        return DASH;
      },
    },
    {
      key: 'brand',
      label: 'Brand',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (row) => {
        if (row.kind === 'variation') return null;
        return row.product.brand_id ? (
          <Badge tone="blue" size="sm" icon={<Award className="w-3 h-3" />}>
            {brands.find(b => b.id === row.product.brand_id)?.name || '-'}
          </Badge>
        ) : DASH;
      },
    },
    {
      key: 'type',
      label: 'ประเภท',
      defaultWidth: 90,
      reorderable: true,
      render: (row) => row.kind === 'product' ? <ProductTypeBadge product={row.product} /> : null,
    },
    {
      key: 'status',
      label: 'สถานะ',
      defaultWidth: 80,
      align: 'center',
      stopPropagation: true,
      render: (row) => row.kind === 'product' ? (
        <Toggle
          checked={row.product.is_active}
          onChange={(v) => handleToggleActive(row.product, v)}
          aria-label={row.product.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
        />
      ) : null,
    },
    {
      key: 'actions',
      label: 'จัดการ',
      alwaysVisible: true,
      stopPropagation: true,
      defaultWidth: 56,
      align: 'center',
      render: (row) => row.kind === 'product' ? (
        <ProductActionMenu
          onEdit={() => openEdit(row.product.product_id)}
          onDuplicate={() => router.push(`/products/new?duplicate=${row.product.product_id}`)}
          onDelete={() => handleDelete(row.product)}
        />
      ) : null,
    },
  ];

  // Mobile card renderer (top-level product rows only)
  const mobileCardRender = (row: ProductRow) => {
    if (row.kind !== 'product') return null;
    const { product } = row;
    const isVariationType = product.product_type === 'variation';
    const expanded = mobileExpanded.has(product.product_id);
    const simpleDiscount = product.simple_discount_price != null && product.simple_discount_price > 0;

    return (
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <ProductImageThumb
            src={product.main_image_url || getImageUrl(product.image)}
            alt={product.name}
            size="lg"
            fallbackIcon={<Package2 className="w-6 h-6 text-gray-400" />}
          />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-gray-900 dark:text-white line-clamp-2">{product.name}</p>
              {product.code && <p className="text-sm text-gray-400 dark:text-slate-500 font-mono">{product.code}</p>}
            </div>
            <div className="flex-shrink-0" onClick={e => e.stopPropagation()}>
              <ProductActionMenu
                onEdit={() => openEdit(product.product_id)}
                onDuplicate={() => router.push(`/products/new?duplicate=${product.product_id}`)}
                onDelete={() => handleDelete(product)}
              />
            </div>
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {isVariationType ? (
              <span className="text-base font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                {priceRangeOf(product) ?? '-'}
              </span>
            ) : (
              <span className="text-base font-semibold whitespace-nowrap">
                {simpleDiscount ? (
                  <>
                    <span className="text-red-600 dark:text-red-400">฿{formatNumber(product.simple_discount_price)}</span>
                    <span className="ml-1 text-sm font-normal text-gray-400 dark:text-slate-500 line-through">
                      ฿{formatNumber(product.simple_default_price)}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-900 dark:text-white">฿{formatNumber(product.simple_default_price)}</span>
                )}
              </span>
            )}
            {features.stock && (
              <span className="text-base text-gray-500 dark:text-slate-400 whitespace-nowrap">
                พร้อมขาย <ProductStockValue product={product} />
              </span>
            )}
            <ProductTypeBadge product={product} />
          </div>

          {isVariationType && product.variations.length > 0 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleMobileExpanded(product.product_id); }}
                aria-expanded={expanded}
                className="mt-2 w-full flex items-center justify-between rounded-lg bg-gray-50 dark:bg-slate-700/50 px-3 py-2 text-sm text-gray-600 dark:text-slate-300"
              >
                <span>{optionCountLabel(product, product.variations.length)}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <ul className="mt-1 divide-y divide-gray-100 dark:divide-slate-700">
                  {product.variations.map(v => (
                    <li
                      key={variationKey(product, v)}
                      className={`flex items-center justify-between gap-3 py-2 text-sm ${v.is_active ? '' : 'opacity-60'}`}
                    >
                      <span className="min-w-0 flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
                        <span className="truncate">{v.variation_label || '-'}</span>
                        {!v.is_active && <Badge tone="gray" shape="square" size="sm">ปิด</Badge>}
                      </span>
                      <span className="flex-shrink-0 flex items-center gap-3 whitespace-nowrap">
                        <span className="font-medium text-gray-900 dark:text-white">฿{formatNumber(effectivePrice(v))}</span>
                        {features.stock && v.available != null && (
                          <span className="text-gray-500 dark:text-slate-400">
                            พร้อมขาย <StockNumber available={v.available} minStock={v.min_stock ?? 0} />
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    );
  }

  if (!userProfile) return null;

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          title="สินค้า"
          subtitle="จัดการสินค้า ราคา และสต็อกพร้อมขาย"
          icon={<Package2 />}
          actions={<>
            <ExportButton onClick={handleExport} loading={exporting} />
            <Button
              variant="secondary"
              icon={<Pencil className="w-4 h-4" />}
              onClick={() => router.push('/products/bulk')}
            >
              <span className="hidden md:inline">แก้ไขแบบชุด</span>
            </Button>
            <Button
              variant="primary"
              icon={<Plus className="w-5 h-5" />}
              onClick={() => router.push('/products/new')}
            >
              เพิ่ม<span className="hidden md:inline">สินค้า</span>
            </Button>
          </>}
        />

        {/* Status tabs — '' (default) = active */}
        <StatusTabs
          activeKey={statusFilter || 'active'}
          onSelect={(key) => setParams({ status: key === 'active' ? '' : key })}
          tabs={[
            { key: 'active', label: 'ขายอยู่', colorKey: 'active', count: statusCounts?.active },
            { key: 'inactive', label: 'ปิดขาย', colorKey: 'inactive', count: statusCounts?.inactive },
            { key: 'all', label: 'ทั้งหมด', colorKey: 'all', count: statusCounts?.all },
          ]}
        />

        {/* Alerts */}
        {error && (
          <Alert tone="danger" onClose={() => setError('')}>{error}</Alert>
        )}

        {/* Search + Filters */}
        <div className="data-filter-card">
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-full md:flex-1 md:min-w-0 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <SearchInput value={searchInput} onChange={handleSearchChange} placeholder="ค้นหาชื่อ, รหัส, SKU, Barcode..." className="py-2" />
              </div>
              <button
                type="button"
                onClick={() => setShowMobileFilters(v => !v)}
                className={`md:hidden relative h-10 w-10 flex-shrink-0 inline-flex items-center justify-center rounded-lg border transition-colors ${
                  showMobileFilters
                    ? 'border-[#F4511E] bg-[#F4511E] text-white'
                    : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-600 dark:text-slate-300'
                }`}
                aria-label="ตัวกรอง"
                aria-expanded={showMobileFilters}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {hasActiveFilters && !showMobileFilters && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#F4511E] ring-2 ring-white dark:ring-slate-800" />
                )}
              </button>
            </div>
            <div className={`${showMobileFilters ? 'flex flex-wrap items-center gap-2 w-full' : 'hidden'} md:contents`}>
            <div className="w-full md:flex-1 md:min-w-0">
              <FormSelect
                value={typeFilter}
                onChange={(v: string) => setParams({ type: v })}
                options={[
                  { id: 'simple', label: 'สินค้าปกติ' },
                  { id: 'variation', label: 'สินค้ามีตัวเลือก' },
                  { id: 'composite', label: 'สินค้าชุด' },
                ]}
                clearLabel="ทุกประเภท"
                placeholder="ประเภท"
                searchThreshold={99}
              />
            </div>
            <div className="w-full md:flex-1 md:min-w-0">
              <FormSelect
                value={categoryFilter}
                onChange={(v: string) => setParams({ cat: v })}
                options={categories.flatMap(parent =>
                  parent.children && parent.children.length > 0
                    ? [
                        { id: parent.id, label: parent.name },
                        ...parent.children.map(child => ({ id: child.id, label: child.name, subtitle: parent.name })),
                      ]
                    : [{ id: parent.id, label: parent.name }]
                )}
                clearLabel="ทุกหมวดหมู่"
                placeholder="หมวดหมู่"
                searchPlaceholder="ค้นหาหมวดหมู่..."
              />
            </div>
            {features.product_brand && (
              <div className="w-full md:flex-1 md:min-w-0">
                <FormSelect
                  value={brandFilter}
                  onChange={(v: string) => setParams({ brand: v })}
                  options={brands.map(b => ({ id: b.id, label: b.name }))}
                  clearLabel="ทุกแบรนด์"
                  placeholder="แบรนด์"
                  searchPlaceholder="ค้นหาแบรนด์..."
                />
              </div>
            )}
            {features.stock && warehouses.length > 1 && (
              <div className="w-full md:flex-1 md:min-w-0">
                <FormSelect
                  value={warehouseFilter}
                  onChange={(v: string) => setParams({ wh: v })}
                  options={warehouseOptions}
                  clearLabel="ทุกคลัง"
                  placeholder="คลัง"
                  searchPlaceholder="ค้นหาคลัง..."
                />
              </div>
            )}
            {features.marketplace_sync && shopOptions.length > 0 && (
              <div className="w-full md:w-auto md:flex-shrink-0">
                <SearchableDropdown
                  value={shopAccountFilter}
                  onChange={(v: string) => setParams({ shop: v })}
                  options={shopOptions}
                  placeholder="ร้านค้า"
                  searchPlaceholder="ค้นหาร้านค้า..."
                  allLabel="ทุกร้านค้า"
                />
              </div>
            )}
            {hasActiveFilters && (
              <Tooltip text="ล้างตัวกรอง">
                <Button
                  variant="secondary"
                  icon={<X className="w-4 h-4" />}
                  onClick={clearAllFilters}
                  aria-label="ล้างตัวกรอง"
                  className="md:flex-shrink-0"
                />
              </Tooltip>
            )}
            </div>
          </div>
        </div>

        {/* Products Table — wrapped in relative for fetching overlay */}
        <div className="relative">
          {fetching && !loading && (
            <div className="absolute inset-0 bg-white/60 dark:bg-slate-900/60 z-10 flex items-center justify-center rounded-xl pointer-events-none">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          <DataTable<ProductRow>
            storageKey="products-v2"
            columns={columns}
            data={tableRows}
            getRowId={(row) => row.kind === 'product' ? row.product.product_id : `v:${variationKey(row.product, row.v)}`}
            getSubRows={subRowsOf}
            rowClassName={(row) => row.kind === 'variation' && !row.v.is_active ? 'opacity-60' : ''}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            mobileCardRender={mobileCardRender}
            onRowClick={(row) => openEdit(row.product.product_id)}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalProducts}
            recordsPerPage={rowsPerPage}
            onPageChange={(p) => setParams({ page: String(p) })}
            onRecordsPerPageChange={(l) => setParams({ limit: String(l), page: '1' })}
            onLimitChange={(l, p) => setParams({ limit: String(l), page: String(p) })}
            loadTime={loadTime}
            emptyMessage="ไม่พบข้อมูลสินค้า"
            emptyIcon={<Package2 className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          />
        </div>

        {/* Bulk Action Bar — floating bottom */}
        <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          {features.product_brand && brands.length > 0 && (
            <Button
              variant="primary"
              icon={<Award className="w-4 h-4" />}
              onClick={() => { setBulkBrandId(''); setShowBrandModal(true); }}
              className="!bg-blue-600 hover:!bg-blue-700"
            >
              กำหนด Brand
            </Button>
          )}
          <Button
            variant="danger"
            icon={<Trash2 className="w-4 h-4" />}
            loading={bulkDeleting}
            onClick={handleBulkDelete}
          >
            {bulkDeleting ? 'กำลังลบ...' : `ลบ ${selectedIds.size} รายการ`}
          </Button>
        </BulkActionBar>
      </Container>

      {/* Bulk Assign Brand Modal */}
      <Modal
        open={showBrandModal}
        onClose={() => setShowBrandModal(false)}
        title={`กำหนด Brand ให้สินค้า ${selectedIds.size} รายการ`}
        size="md"
        footer={
          <div className="flex gap-2 justify-end p-4">
            <Button variant="secondary" onClick={() => setShowBrandModal(false)}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              loading={bulkBrandSaving}
              disabled={!bulkBrandId}
              onClick={handleBulkAssignBrand}
              className="!bg-blue-600 hover:!bg-blue-700"
            >
              {bulkBrandSaving ? 'กำลังบันทึก...' : 'ยืนยัน'}
            </Button>
          </div>
        }
      >
        <div className="p-5 space-y-4">
          {existingBrandCount > 0 && (
            <Alert tone="warning">
              สินค้า {selectedIds.size} รายการที่เลือก มี {existingBrandCount} รายการที่มี Brand อยู่แล้ว — จะถูกเปลี่ยนเป็น Brand ใหม่
            </Alert>
          )}
          <div>
            <label className="field-label">เลือก Brand</label>
            <FormSelect
              value={bulkBrandId}
              onChange={setBulkBrandId}
              options={brands.map(b => ({ id: b.id, label: b.name }))}
              placeholder="เลือกแบรนด์..."
            />
          </div>
        </div>
      </Modal>

      {confirmDialog}
    </Layout>
  );
}

export default function ProductsPage() {
  // ด่านสิทธิ์ระดับหน้า — เมนูใน Sidebar ซ่อนให้แล้ว แต่ URL ตรงยังเข้าได้
  const { allowed, loading: permLoading } = useAuthGuard('product.view');
  if (permLoading) return <Layout><LoadingCard /></Layout>;
  if (!allowed) return null;   // กำลังเด้งไป /dashboard

  return (
    <Suspense fallback={
      <Layout>
        <Container size="full">
          <LoadingCard />
        </Container>
      </Layout>
    }>
      <ProductsPageContent />
    </Suspense>
  );
}
