// Path: app/products/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ImageLightbox from '@/components/ui/ImageLightbox';
import { LoadingCard } from '@/components/ui/StateCard';
import Alert from '@/components/ui/Alert';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import SearchInput from '@/components/ui/SearchInput';
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
  Wine,
  Loader2,
  Award,
  Pencil,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import SharedActionMenu from '@/components/ui/ActionMenu';
import SearchableDropdown, { DropdownOption } from '@/components/ui/SearchableDropdown';
import FormSelect from '@/components/ui/FormSelect';
import Toggle from '@/components/ui/Toggle';

// Product interface (from API view)
interface ProductItem {
  product_id: string;
  code: string;
  name: string;
  description?: string;
  image?: string;
  main_image_url?: string;
  product_type: 'simple' | 'variation';
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
  variations: {
    variation_id?: string;
    variation_label: string;
    sku?: string;
    barcode?: string;
    default_price: number;
    discount_price: number;
    cost_price?: number | null;
    is_active: boolean;
  }[];
}

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
  const currentPage = parseInt(searchParams.get('page') || '1', 10);
  const rowsPerPage = parseInt(searchParams.get('limit') || '20', 10);
  const debouncedSearch = searchParams.get('q') || '';

  // Local search input state (for immediate keystroke feedback)
  const [searchInput, setSearchInput] = useState(debouncedSearch);
  // Mobile: collapse non-search filters by default
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

  // Sync search input when URL param changes externally (e.g. browser back)
  useEffect(() => { setSearchInput(debouncedSearch); }, [debouncedSearch]);

  // Helper to update URL params
  const setParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(searchParams.toString());
    const hasExplicitPage = 'page' in updates;
    let pageReset = false;
    for (const [k, v] of Object.entries(updates)) {
      if (k !== 'page') pageReset = true;
      const defaults: Record<string, string> = { type: '', cat: '', brand: '', shop: 'all', status: '', q: '', page: '1', limit: '20' };
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

  // Debounced search handler
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!val) {
      setParams({ q: '' });
      return;
    }
    debounceRef.current = setTimeout(() => setParams({ q: val }), 300);
  }, [setParams]);

  // Check if any filter is active
  const hasActiveFilters = !!(debouncedSearch || typeFilter || categoryFilter || brandFilter || statusFilter || (shopAccountFilter !== 'all'));

  const clearAllFilters = useCallback(() => {
    setSearchInput('');
    router.replace('/products', { scroll: false });
  }, [router]);

  const [productsList, setProductsList] = useState<ProductItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false); // loading indicator for page changes
  const [dataFetched, setDataFetched] = useState(false);
  const [shopOptions, setShopOptions] = useState<DropdownOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [error, setError] = useState('');

  // Load time
  const [loadTime, setLoadTime] = useState<number | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [bulkBrandId, setBulkBrandId] = useState('');
  const [bulkBrandSaving, setBulkBrandSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  // Total count from server
  const [totalProducts, setTotalProducts] = useState(0);

  // Fetch products with server-side pagination
  const fetchData = async () => {
    const t0 = Date.now();
    setFetching(true);
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(rowsPerPage), include_shop_options: '1' });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (categoryFilter !== '') params.set('category_id', categoryFilter);
      if (brandFilter !== '') params.set('brand_id', brandFilter);
      if (shopAccountFilter !== 'all') params.set('shop_account_id', shopAccountFilter);
      if (statusFilter) params.set('status', statusFilter);

      const response = await apiFetch(`/api/products?${params.toString()}`);
      const data = await response.json();
      setProductsList(data.products || []);
      setTotalProducts(data.total ?? data.products?.length ?? 0);
      // Update shop options on first load
      if (data.shopOptions) {
        setShopOptions(data.shopOptions.map((s: any) => ({
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

  // Re-fetch when URL-derived filter/pagination values change (after initial load)
  useEffect(() => {
    if (dataFetched) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, debouncedSearch, typeFilter, categoryFilter, brandFilter, shopAccountFilter, statusFilter]);

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
  useEffect(() => { setSelectedIds(new Set()); }, [debouncedSearch, typeFilter, categoryFilter, brandFilter, shopAccountFilter, currentPage]);

  // Client-side filter (only type filter — rest is server-side)
  const filteredProducts = productsList.filter(product => {
    if (typeFilter !== '' && product.product_type !== typeFilter) return false;
    return true;
  });

  // Pagination — server provides total count, products are already paginated
  const totalFiltered = typeFilter === '' ? totalProducts : filteredProducts.length;
  const totalPages = Math.ceil(totalFiltered / rowsPerPage);
  // Products are already paginated from server — no need to slice again
  const paginatedProducts = filteredProducts;

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
          shop_account_id: shopAccountFilter !== 'all' ? shopAccountFilter : undefined,
        }),
      });
      const exportData = await exportRes.json();
      const allProducts: ProductItem[] = exportData.products || [];
      const activeShops: { id: string; shop_name: string; platform: string }[] = exportData.shops || [];
      const canViewCost: boolean = exportData.can_view_cost === true;

      type LinkInfo = { variation_id: string; account_id: string; platform_price: number | null; platform_discount_price: number | null };
      const linkMap = new Map<string, Map<string, LinkInfo>>();
      for (const link of (exportData.links || []) as LinkInfo[]) {
        if (!linkMap.has(link.variation_id)) linkMap.set(link.variation_id, new Map());
        linkMap.get(link.variation_id)!.set(link.account_id, link);
      }

      const filtered = typeFilter
        ? allProducts.filter(p => p.product_type === typeFilter)
        : allProducts;

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('สินค้า');

      // Build dynamic headers: base columns + (cost if allowed) + marketplace shop columns
      const baseHeaders = [
        'product_id', 'variation_id', 'รหัสสินค้า', 'ชื่อสินค้า', 'ประเภท', 'ตัวเลือก',
        'SKU', 'Barcode', 'ราคาปกติ', 'ราคาขาย',
        ...(canViewCost ? ['ราคาทุน'] : []),
        'สถานะ',
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
        const isMulti = product.variations.length > 1;
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
              `สินค้าย่อย (${product.variations.length})`, '',
              '', '', '', '',
              ...(canViewCost ? [''] : []),
              product.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน',
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
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10);
      const filterLabel = hasActiveFilters ? 'filter' : 'all';
      link.download = `${filterLabel}-product-${dataRows.length}-${date}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(`ส่งออกสินค้า ${filtered.length} รายการสำเร็จ`);
    } catch (err) {
      console.error('Export error:', err);
      showToast('ส่งออกไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  // ── Column definitions for DataTable ──
  const columns: DataTableColumn<ProductItem>[] = [
    {
      key: 'image',
      label: 'รูป',
      defaultWidth: 72,
      hideMobile: true,
      headerClassName: '!px-1',
      cellClassName: '!px-1 !py-1.5',
      render: (product) => (
        (product.main_image_url || product.image) ? (
          <img
            src={product.main_image_url || getImageUrl(product.image)}
            alt={product.name}
            style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}
            className="object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              setLightboxImage(product.main_image_url || getImageUrl(product.image));
            }}
          />
        ) : (
          <div
            style={{ width: '56px', height: '56px', minWidth: '56px', minHeight: '56px' }}
            className="bg-gray-200 dark:bg-slate-700 rounded flex items-center justify-center"
          >
            <Package2 className="w-7 h-7 text-gray-400" />
          </div>
        )
      ),
    },
    {
      key: 'nameCode',
      label: 'ชื่อ/รหัส',
      alwaysVisible: true,
      defaultWidth: 340,
      reorderable: true,
      resizable: true,
      render: (product) => (
        <div>
          <div className="data-primary text-gray-900 dark:text-slate-100 text-base line-clamp-2">
            {product.name}
          </div>
          <div className="code-text text-gray-400 dark:text-slate-500">{product.code}</div>
        </div>
      ),
    },
    {
      key: 'option',
      label: 'ตัวเลือก',
      defaultWidth: 120,
      reorderable: true,
      resizable: true,
      render: (product) => {
        if (product.product_type === 'simple') {
          return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
        }
        if (!product.variations || product.variations.length === 0) {
          return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
        }
        return (
          <div className="space-y-1">
            {product.variations.map((v) => (
              <div
                key={v.variation_id || `${product.product_id}-${v.variation_label}`}
                className={`text-base whitespace-nowrap flex items-center gap-1.5 ${v.is_active ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'}`}
              >
                <span>{v.variation_label}</span>
                {!v.is_active && (
                  <Badge tone="gray" shape="square" size="sm">ปิด</Badge>
                )}
              </div>
            ))}
          </div>
        );
      },
    },
    {
      key: 'price',
      label: 'ราคา',
      defaultWidth: 160,
      reorderable: true,
      resizable: true,
      render: (product) => {
        const renderPrice = (def: number | null | undefined, disc: number | null | undefined, key: string, dimmed = false) => {
          const hasDiscount = disc != null && disc > 0;
          return (
            <div key={key} className={`text-base flex items-center space-x-1 whitespace-nowrap ${dimmed ? 'opacity-50' : ''}`}>
              <span className="text-gray-400 font-medium">฿</span>
              <span className={hasDiscount ? 'text-gray-400 line-through dark:text-slate-500' : ''}>
                {formatNumber(def)}
              </span>
              {hasDiscount && (
                <span className="text-red-600 dark:text-red-400 font-medium">(฿{formatNumber(disc)})</span>
              )}
            </div>
          );
        };
        if (product.product_type === 'simple') {
          return renderPrice(product.simple_default_price, product.simple_discount_price, 'simple');
        }
        if (!product.variations || product.variations.length === 0) {
          return <span className="data-muted text-gray-400 dark:text-slate-500 text-base">ไม่มีสินค้าย่อย</span>;
        }
        return (
          <div className="space-y-1">
            {product.variations.map((v) =>
              renderPrice(v.default_price, v.discount_price, v.variation_id || `${product.product_id}-${v.variation_label}`, !v.is_active)
            )}
          </div>
        );
      },
    },
    ...(canViewCost ? [{
      key: 'cost',
      label: 'ราคาทุน',
      defaultVisible: false,
      defaultWidth: 120,
      reorderable: true,
      resizable: true,
      render: (product: ProductItem) => {
        if (product.product_type === 'simple') {
          const cost = product.variations?.[0]?.cost_price;
          if (cost == null) return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
          return (
            <div className="text-base flex items-center space-x-1 whitespace-nowrap">
              <span className="text-gray-400 font-medium">฿</span>
              <span>{formatNumber(cost)}</span>
            </div>
          );
        }
        if (!product.variations || product.variations.length === 0) {
          return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
        }
        return (
          <div className="space-y-1">
            {product.variations.map((v) => (
              <div key={v.variation_id || `${product.product_id}-${v.variation_label}`} className={`text-base flex items-center space-x-1 whitespace-nowrap ${v.is_active ? '' : 'opacity-50'}`}>
                <span className="text-gray-400 font-medium">฿</span>
                <span>{v.cost_price != null ? formatNumber(v.cost_price) : '-'}</span>
              </div>
            ))}
          </div>
        );
      },
    } as DataTableColumn<ProductItem>] : []),
    {
      key: 'sku',
      label: 'SKU',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (product) => {
        if (product.product_type === 'simple') {
          if (!product.simple_sku) return <span className="data-muted text-gray-400">-</span>;
          return <div className="code-text">{product.simple_sku}</div>;
        }
        const skuRows = product.variations.filter(v => v.sku);
        if (!skuRows.length) return <span className="data-muted text-gray-400">-</span>;
        return (
          <div className="space-y-0.5">
            {skuRows.map((v, i) => (
              <div key={v.variation_id || i} className={`code-text ${v.is_active ? '' : 'opacity-50'}`}>{v.sku}</div>
            ))}
          </div>
        );
      },
    },
    {
      key: 'barcode',
      label: 'Barcode',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (product) => {
        if (product.product_type === 'simple') {
          if (!product.simple_barcode) return <span className="data-muted text-gray-400">-</span>;
          return <div className="code-text">{product.simple_barcode}</div>;
        }
        const bcRows = product.variations.filter(v => v.barcode);
        if (!bcRows.length) return <span className="data-muted text-gray-400">-</span>;
        return (
          <div className="space-y-0.5">
            {bcRows.map((v, i) => (
              <div key={v.variation_id || i} className={`code-text ${v.is_active ? '' : 'opacity-50'}`}>{v.barcode}</div>
            ))}
          </div>
        );
      },
    },
    {
      key: 'category',
      label: 'หมวดหมู่',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (product) => {
        if (!product.category_id) return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
        // Walk flat: check parents and children for a matching id
        for (const parent of categories) {
          if (parent.id === product.category_id) return <span className="text-base">{parent.name}</span>;
          if (parent.children) {
            const child = parent.children.find(c => c.id === product.category_id);
            if (child) return <span className="text-base">{child.name}<span className="text-gray-400 dark:text-slate-500"> · {parent.name}</span></span>;
          }
        }
        return <span className="data-muted text-gray-400 dark:text-slate-500">-</span>;
      },
    },
    {
      key: 'brand',
      label: 'Brand',
      defaultVisible: false,
      defaultWidth: 140,
      reorderable: true,
      resizable: true,
      render: (product) => (
        product.brand_id ? (
          <Badge tone="blue" size="sm" icon={<Award className="w-3 h-3" />}>
            {brands.find(b => b.id === product.brand_id)?.name || '-'}
          </Badge>
        ) : (
          <span className="data-muted text-gray-400 dark:text-slate-500">-</span>
        )
      ),
    },
    {
      key: 'type',
      label: 'ประเภท',
      defaultWidth: 90,
      reorderable: true,
      render: (product) => (
        <Badge
          tone={product.product_type === 'simple' ? 'blue' : 'amber'}
          shape="square"
          size="sm"
        >
          {product.product_type === 'simple' ? 'ปกติ' : 'ย่อย'}
        </Badge>
      ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      defaultWidth: 80,
      stopPropagation: true,
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (product) => (
        <Toggle
          checked={product.is_active}
          onChange={(v) => handleToggleActive(product, v)}
          aria-label={product.is_active ? 'ปิดการใช้งาน' : 'เปิดการใช้งาน'}
        />
      ),
    },
    {
      key: 'actions',
      label: 'จัดการ',
      alwaysVisible: true,
      stopPropagation: true,
      defaultWidth: 60,
      headerClassName: 'text-center',
      cellClassName: 'text-center',
      render: (product) => (
        <ProductActionMenu
          onEdit={() => window.open(`/products/${product.product_id}/edit`, '_blank')}
          onDuplicate={() => router.push(`/products/new?duplicate=${product.product_id}`)}
          onDelete={() => handleDelete(product)}
        />
      ),
    },
  ];

  // Mobile card renderer
  const mobileCardRender = (product: ProductItem) => (
    <div className="flex gap-3">
      <div className="flex-shrink-0">
        {(product.main_image_url || product.image) ? (
          <img
            src={product.main_image_url || getImageUrl(product.image)}
            alt={product.name}
            className="w-14 h-14 object-cover rounded"
          />
        ) : (
          <div className="w-14 h-14 bg-gray-200 dark:bg-slate-700 rounded flex items-center justify-center">
            <Package2 className="w-6 h-6 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white text-[15px] line-clamp-2">{product.name}</p>
            <p className="text-xs text-gray-400 dark:text-slate-500 font-mono">{product.code}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
            <Badge
              tone={product.product_type === 'simple' ? 'blue' : 'amber'}
              shape="square"
              size="sm"
            >
              {product.product_type === 'simple' ? 'ปกติ' : 'ย่อย'}
            </Badge>
            <ProductActionMenu
              onEdit={() => window.open(`/products/${product.product_id}/edit`, '_blank')}
              onDuplicate={() => router.push(`/products/new?duplicate=${product.product_id}`)}
              onDelete={() => handleDelete(product)}
            />
          </div>
        </div>

        <div className="mt-1.5">
          {product.product_type === 'simple' ? (
            <div>
              {product.simple_discount_price != null && product.simple_discount_price > 0 ? (
                <>
                  <span className="text-base text-gray-400 dark:text-slate-500 line-through">
                    ฿{formatNumber(product.simple_default_price)}
                  </span>
                  <span className="text-base font-semibold text-red-600 dark:text-red-400 ml-1">
                    ฿{formatNumber(product.simple_discount_price)}
                  </span>
                </>
              ) : (
                <span className="text-base font-semibold text-gray-900 dark:text-white">
                  ฿{formatNumber(product.simple_default_price)}
                </span>
              )}
              {product.simple_sku && (
                <span className="text-xs text-gray-400 dark:text-slate-500 ml-2">SKU: {product.simple_sku}</span>
              )}
            </div>
          ) : (
            <div className="space-y-0.5">
              {product.variations && product.variations.length > 0 ? (
                product.variations.slice(0, 3).map((v) => (
                  <div key={v.variation_id || `${product.product_id}-${v.variation_label}`} className="flex items-center gap-1.5 text-sm">
                    <Wine className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-500 dark:text-slate-400">{v.variation_label}</span>
                    {v.discount_price > 0 ? (
                      <>
                        <span className="text-gray-400 dark:text-slate-500 line-through">฿{formatNumber(v.default_price)}</span>
                        <span className="text-red-600 dark:text-red-400 font-medium">฿{formatNumber(v.discount_price)}</span>
                      </>
                    ) : (
                      <span className="text-gray-900 dark:text-white font-medium">฿{formatNumber(v.default_price)}</span>
                    )}
                  </div>
                ))
              ) : (
                <span className="text-sm text-gray-400 dark:text-slate-500">ไม่มีสินค้าย่อย</span>
              )}
              {product.variations && product.variations.length > 3 && (
                <p className="text-xs text-gray-400 dark:text-slate-500">+{product.variations.length - 3} รายการ</p>
              )}
            </div>
          )}
        </div>

        {product.brand_id && (
          <div className="mt-1">
            <Badge tone="blue" size="sm" icon={<Award className="w-3 h-3" />}>
              {brands.find(b => b.id === product.brand_id)?.name || '-'}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );

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
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="heading-1">สินค้า</h1>
            <p className="page-subtitle">จัดการสินค้า (สินค้าปกติ หรือ สินค้าย่อย)</p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>

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
                  { id: 'variation', label: 'สินค้าย่อย' },
                ]}
                clearLabel="ทั้งหมด"
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
            {shopOptions.length > 0 && (
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
            <div role="radiogroup" aria-label="สถานะสินค้า" className="w-full md:w-auto flex h-10 items-stretch rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 p-0.5 overflow-hidden md:flex-shrink-0">
              {[
                { id: '', label: 'เปิด' },
                { id: 'inactive', label: 'ปิด' },
                { id: 'all', label: 'ทั้งหมด' },
              ].map(opt => {
                const active = statusFilter === opt.id;
                return (
                  <button
                    key={opt.id || 'active'}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setParams({ status: opt.id })}
                    className={`flex-1 md:flex-none px-3 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[#F4511E] text-white shadow-sm'
                        : 'text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={clearAllFilters}
              aria-label="ล้างตัวกรอง"
              title="ล้างตัวกรอง"
              className="h-10 w-10 flex items-center justify-center rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-500 hover:text-red-600 hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors md:flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
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
          <DataTable<ProductItem>
            storageKey="products"
            columns={columns}
            data={paginatedProducts}
            getRowId={(p) => p.product_id}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            mobileCardRender={mobileCardRender}
            onRowClick={(p) => window.open(`/products/${p.product_id}/edit`, '_blank')}
            currentPage={currentPage}
            totalPages={totalPages}
            totalRecords={totalFiltered}
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
        {selectedIds.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shadow-lg px-6 py-3">
            <div className="max-w-screen-xl mx-auto flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                clear all
              </Button>
              <div className="flex items-center gap-2">
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
              </div>
            </div>
          </div>
        )}
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

      <ImageLightbox src={lightboxImage} onClose={() => setLightboxImage(null)} alt="Product" />

      {confirmDialog}
    </Layout>
  );
}

export default function ProductsPage() {
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
