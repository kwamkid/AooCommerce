'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SquarePen } from 'lucide-react';
import { ChecklistIcon, CloseIcon, EditIcon, LoadingIcon, ProductIcon, WarehouseIcon } from '@/lib/icons';
import DataTable, { type DataTableColumn, type SortDir } from '@/components/ui/DataTable';
import StatusTabs from '@/components/ui/StatusTabs';
import SearchInput from '@/components/ui/SearchInput';
import FormSelect from '@/components/ui/FormSelect';
import Button from '@/components/ui/Button';
import NumberInput from '@/components/ui/NumberInput';
import BulkActionBar from '@/components/ui/BulkActionBar';
import HelpHint from '@/components/ui/HelpHint';
import StatusBadge from '@/components/ui/StatusBadge';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import ActionMenu from '@/components/ui/ActionMenu';
import Tooltip from '@/components/ui/Tooltip';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useFeatures } from '@/lib/features-context';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { formatNumber } from '@/lib/utils/format';
import { cleanVariationLabel } from '@/lib/product-display';
import AdjustStockModal from './AdjustStockModal';
import type {
  StockRow, StockStatusCounts, StockTransitRow, StockWarehouseRow, WarehouseItem,
} from './types';

interface StockTabProps {
  warehouses: WarehouseItem[];
  onViewHistory?: (variationId: string, productLabel: string) => void;
}

interface FilterOption { id: string; label: string; subtitle?: string }

/** คีย์คอลัมน์ที่เรียงได้ → ชื่อที่ RPC รู้จัก */
const SORT_MAP: Record<string, string> = {
  product: 'name',
  quantity: 'quantity',
  available: 'available',
  min: 'min_stock',
  updated: 'updated',
};

const DEFAULT_SORT = 'product';
const DEFAULT_STATUS = 'stocked';

const DASH = <span className="text-gray-400 dark:text-slate-500">-</span>;

/** เนื้อในกล่อง HelpHint — พื้นเข้ม ตัวหนังสือสว่าง */
function WarehouseBreakdown({ rows }: { rows: StockWarehouseRow[] }) {
  return (
    <div className="min-w-[240px] space-y-1.5">
      <div className="font-semibold text-white">แยกตามคลัง</div>
      {rows.length === 0 ? (
        <div className="text-gray-300">ไม่มีของในคลังใด</div>
      ) : (
        <ul className="space-y-2">
          {rows.map(w => (
            <li key={w.warehouse_id} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div>{w.name}</div>
                {w.type === 'consignment' && (
                  <div className="text-gray-400">
                    {w.customer_name ? `${w.customer_name} · ฝากขาย` : 'ฝากขาย'}
                  </div>
                )}
              </div>
              <div className="text-right whitespace-nowrap tabular-nums">
                <div><span className="font-semibold">{formatNumber(w.available)}</span> พร้อมขาย</div>
                <div className="text-gray-400">
                  จำนวน {formatNumber(w.quantity)} · จอง {formatNumber(w.reserved)}
                </div>
                {w.in_transit > 0 && (
                  <div className="text-gray-400">กำลังส่ง {formatNumber(w.in_transit)}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** รายชื่อ + จำนวน (ใช้กับ กำลังส่ง / ฝากขาย) */
function QtyList({ title, rows, empty }: { title: string; rows: { key: string; name: string; qty: number }[]; empty: string }) {
  return (
    <div className="min-w-[200px] space-y-1.5">
      <div className="font-semibold text-white">{title}</div>
      {rows.length === 0 ? (
        <div className="text-gray-300">{empty}</div>
      ) : (
        <ul className="space-y-1">
          {rows.map(r => (
            <li key={r.key} className="flex items-center justify-between gap-4">
              <span className="truncate">{r.name}</span>
              <span className="font-semibold tabular-nums flex-shrink-0">{formatNumber(r.qty)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StockTab({ warehouses, onViewHistory }: StockTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { features } = useFeatures();
  const { confirmDialog, confirm } = useConfirmDialog();

  // ── สถานะทั้งหมดอยู่ใน URL (refresh / ปุ่มย้อนกลับแล้วยังอยู่ที่เดิม) ──
  const search = searchParams.get('q') || '';
  const warehouseFilter = searchParams.get('wh') || '';
  const dealerFilter = searchParams.get('dealer') || '';
  const categoryFilter = searchParams.get('cat') || '';
  const brandFilter = searchParams.get('brand') || '';
  const supplierFilter = searchParams.get('sup') || '';
  const status = searchParams.get('status') || DEFAULT_STATUS;
  const sortKey = searchParams.get('sort') || DEFAULT_SORT;
  const sortDir = (searchParams.get('dir') === 'desc' ? 'desc' : 'asc') as SortDir;
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const recordsPerPage = parseInt(searchParams.get('limit') || '20', 10) || 20;

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    const defaults: Record<string, string> = {
      q: '', wh: '', dealer: '', cat: '', brand: '', sup: '',
      status: DEFAULT_STATUS, sort: DEFAULT_SORT, dir: 'asc', page: '1', limit: '20',
    };
    for (const [key, val] of Object.entries(updates)) {
      if (val === null || val === '' || val === defaults[key]) params.delete(key);
      else params.set(key, val);
    }
    // เปลี่ยนตัวกรองแล้วต้องกลับหน้า 1 เสมอ (ยกเว้นตอนสั่งเปลี่ยนหน้าเอง)
    if (!('page' in updates)) params.delete('page');
    const qs = params.toString();
    router.replace(`/inventory${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router]);

  const hasActiveFilters = !!(search || warehouseFilter || dealerFilter || categoryFilter || brandFilter || supplierFilter);

  const clearAllFilters = () => {
    setParams({ q: null, wh: null, dealer: null, cat: null, brand: null, sup: null });
  };

  // ── ช่องค้นหา (พิมพ์เห็นทันที · ยิง 400ms หลังหยุดพิมพ์) ──
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => { setSearchInput(search); }, [search]);
  const debouncedSearch = useDebouncedCallback((val: string) => setParams({ q: val }), 400);
  const handleSearchChange = (val: string) => {
    setSearchInput(val);
    if (!val) { debouncedSearch.cancel(); setParams({ q: null }); return; }
    debouncedSearch(val);
  };

  // ── ข้อมูล ──
  const [rows, setRows] = useState<StockRow[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<StockStatusCounts | null>(null);
  /** มูลค่าสต็อกแยกของเรา/ของ supplier ฝากขาย — ของฝากขายไม่ใช่สินทรัพย์เรา จึงห้ามรวมเป็นก้อนเดียว */
  const [valuation, setValuation] = useState<{
    own: { quantity: number; value: number | null };
    consignment: { quantity: number; value: number | null; unpriced_quantity: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  // ── ตัวเลือกของตัวกรอง ──
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [brands, setBrands] = useState<FilterOption[]>([]);
  const [suppliers, setSuppliers] = useState<FilterOption[]>([]);
  const [dealers, setDealers] = useState<FilterOption[]>([]);

  const filtersFetchedRef = useRef(false);
  useEffect(() => {
    if (filtersFetchedRef.current) return;
    filtersFetchedRef.current = true;
    (async () => {
      try {
        const res = await apiFetch('/api/products/form-options');
        if (!res.ok) return;
        const data = await res.json();
        const cats: FilterOption[] = [];
        for (const parent of (data.categories || [])) {
          cats.push({ id: parent.id, label: parent.name });
          for (const child of (parent.children || [])) {
            cats.push({ id: child.id, label: child.name, subtitle: parent.name });
          }
        }
        setCategories(cats);
        setBrands((data.brands || []).map((b: { id: string; name: string }) => ({ id: b.id, label: b.name })));
        const supMap = new Map<string, string>();
        for (const b of (data.brands || [])) {
          if (b.supplier?.id) supMap.set(b.supplier.id, b.supplier.name);
        }
        setSuppliers(Array.from(supMap, ([id, label]) => ({ id, label })));
      } catch { /* ตัวกรองโหลดไม่ได้ = ไม่ต้องขึ้น error ทั้งหน้า */ }
    })();
  }, []);

  const dealersFetchedRef = useRef(false);
  useEffect(() => {
    if (!features.consignment || dealersFetchedRef.current) return;
    dealersFetchedRef.current = true;
    (async () => {
      try {
        const res = await apiFetch('/api/customers?type=consignment_dealer&limit=200');
        if (!res.ok) return;
        const data = await res.json();
        setDealers((data.customers || []).map((c: { id: string; name: string }) => ({ id: c.id, label: c.name })));
      } catch { /* เงียบ */ }
    })();
  }, [features.consignment]);

  // ── โหลดรายการ — 1 request ต่อการเปลี่ยนตัวกรองหนึ่งครั้ง ──
  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setFetching(true);
    try {
      const params = new URLSearchParams({
        view: 'list',
        page: String(page),
        limit: String(recordsPerPage),
        status,
        sort_by: SORT_MAP[sortKey] || 'name',
        sort_asc: sortDir === 'desc' ? '0' : '1',
      });
      if (search) params.set('search', search);
      if (dealerFilter) params.set('dealer_id', dealerFilter);
      else if (warehouseFilter) params.set('warehouse_id', warehouseFilter);
      if (categoryFilter) params.set('category_id', categoryFilter);
      if (brandFilter) params.set('brand_id', brandFilter);
      if (supplierFilter) params.set('supplier_id', supplierFilter);

      const res = await apiFetch(`/api/inventory?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRows(data.items || []);
      setTotal(data.total || 0);
      setCounts(data.status_counts ?? null);

      // มูลค่าสต็อกเป็นยอดรวมของทั้งคลัง ไม่ขึ้นกับหน้า/ตัวกรองอื่น — ยิงแยกและล้มได้เงียบ ๆ
      apiFetch(`/api/inventory/valuation${warehouseFilter ? `?warehouse_id=${warehouseFilter}` : ''}`)
        .then(async r => { if (r.ok) setValuation(await r.json()); })
        .catch(() => { /* ไม่มีการ์ดมูลค่า ก็ยังใช้หน้านี้ได้ปกติ */ });
    } catch (error) {
      console.error('Error fetching inventory list:', error);
      if (!quiet) showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      if (!quiet) setFetching(false);
    }
  }, [page, recordsPerPage, status, sortKey, sortDir, search, dealerFilter, warehouseFilter, categoryFilter, brandFilter, supplierFilter, showToast]);

  // ยิงครั้งแรก + ทุกครั้งที่ค่าใน URL เปลี่ยนจริง (กัน re-render ซ้ำไม่ให้ยิงซ้ำ)
  const depsKey = `${page}|${recordsPerPage}|${status}|${sortKey}|${sortDir}|${search}|${warehouseFilter}|${dealerFilter}|${categoryFilter}|${brandFilter}|${supplierFilter}`;
  const fetchedRef = useRef(false);
  const prevDepsRef = useRef(depsKey);
  const fetchRef = useRef(fetchData);
  useEffect(() => { fetchRef.current = fetchData; }, [fetchData]);
  useEffect(() => {
    const changed = prevDepsRef.current !== depsKey;
    prevDepsRef.current = depsKey;
    if (fetchedRef.current && !changed) return;
    fetchedRef.current = true;
    void fetchRef.current();
  }, [depsKey]);

  // ── เลือกหลายรายการ ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => { setSelectedIds(new Set()); }, [depsKey]);

  const [bulkMin, setBulkMin] = useState(0);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkAllSaving, setBulkAllSaving] = useState(false);

  const saveMinStock = async (items: { variation_id: string; min_stock: number }[]) => {
    const res = await apiFetch('/api/inventory/min-stock', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'บันทึกไม่สำเร็จ');
    }
  };

  const handleBulkMin = async () => {
    if (selectedIds.size === 0) return;
    if (bulkMin < 0) { showToast('Min Stock ต้องไม่ติดลบ', 'error'); return; }
    setBulkSaving(true);
    try {
      await saveMinStock([...selectedIds].map(id => ({ variation_id: id, min_stock: bulkMin })));
      showToast(`ตั้ง Min Stock = ${formatNumber(bulkMin)} ให้ ${selectedIds.size} รายการสำเร็จ`, 'success');
      setSelectedIds(new Set());
      await fetchData(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  const handleBulkMinAll = async () => {
    if (bulkMin < 0) { showToast('Min Stock ต้องไม่ติดลบ', 'error'); return; }
    const ok = await confirm({
      title: `ตั้ง Min Stock = ${formatNumber(bulkMin)} ให้สินค้าทุกรายการ?`,
      description: 'มีผลกับสินค้าทุกตัวเลือกในร้าน ไม่ใช่เฉพาะที่เลือกไว้',
    });
    if (!ok) return;
    setBulkAllSaving(true);
    try {
      const res = await apiFetch('/api/inventory/min-stock', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true, min_stock: bulkMin }),
      });
      if (!res.ok) throw new Error('บันทึกไม่สำเร็จ');
      const data = await res.json();
      showToast(`ตั้ง Min Stock = ${formatNumber(bulkMin)} ทุกรายการสำเร็จ (${formatNumber(data.updated ?? 0)} รายการ)`, 'success');
      setSelectedIds(new Set());
      await fetchData(true);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setBulkAllSaving(false);
    }
  };

  // ── ปรับสต็อก ──
  const [adjustRow, setAdjustRow] = useState<StockRow | null>(null);

  const initialWarehouseFor = (row: StockRow) => {
    if (warehouseFilter) return warehouseFilter;
    if (warehouses.length === 1) return warehouses[0].id;
    const internal = row.by_warehouse.find(w => w.type === 'internal');
    return internal?.warehouse_id || '';
  };

  const openProduct = (productId: string) => window.open(`/products/${productId}/edit`, '_blank');

  // ── ตัวเลือกคลัง: คลังในบริษัทก่อน แล้วค่อยคลังของตัวแทน ──
  const warehouseOptions = useMemo(() => [
    ...warehouses.filter(w => w.warehouse_type !== 'consignment').map(w => ({ id: w.id, label: w.name })),
    ...warehouses.filter(w => w.warehouse_type === 'consignment').map(w => ({ id: w.id, label: `[ตัวแทน] ${w.name}` })),
  ], [warehouses]);

  const subtitleOf = (row: StockRow) => {
    const parts: string[] = [];
    if (row.product_code) parts.push(row.product_code);
    if (row.sku && row.sku !== row.product_code) parts.push(`SKU: ${row.sku}`);
    if (!row.is_simple) {
      const label = cleanVariationLabel({
        variation_label: row.variation_label,
        sku: row.sku,
        barcode: row.barcode,
        product_code: row.product_code,
        attributes: row.attributes,
      });
      if (label) parts.push(label);
    }
    return parts.join(' · ');
  };

  const labelOf = (row: StockRow) => {
    const sub = row.is_simple ? '' : cleanVariationLabel({
      variation_label: row.variation_label,
      sku: row.sku,
      barcode: row.barcode,
      product_code: row.product_code,
      attributes: row.attributes,
    });
    return sub ? `${row.product_name} - ${sub}` : row.product_name;
  };

  const transitRowsOf = (row: StockRow) => (row.in_transit_breakdown as StockTransitRow[]).map(t => ({
    key: t.customer_id, name: t.customer_name, qty: t.qty,
  }));

  const consignRowsOf = (row: StockRow) => row.by_warehouse
    .filter(w => w.type === 'consignment')
    .map(w => ({ key: w.warehouse_id, name: w.customer_name || w.name, qty: w.quantity }));

  /** แก้ Min แล้วเขียนทับแถวในหน้าทันที จากนั้นดึงใหม่เงียบ ๆ ให้สถานะ/ตัวนับตรง */
  const patchMinStock = (variationId: string, value: number) => {
    setRows(prev => prev.map(r => r.variation_id === variationId ? { ...r, min_stock: value } : r));
  };

  const columns: DataTableColumn<StockRow>[] = [
    {
      key: 'image',
      label: 'รูป',
      defaultWidth: 72,
      hideMobile: true,
      headerClassName: '!px-1',
      cellClassName: '!px-1 !py-1.5',
      render: (row) => (
        <ProductImageThumb
          src={row.image_url}
          alt={row.product_name}
          size="lg"
          ratio="auto"
          fallbackIcon={<ProductIcon className="w-7 h-7 text-gray-400" />}
        />
      ),
    },
    {
      key: 'product',
      label: 'ชื่อสินค้า',
      alwaysVisible: true,
      grow: true,
      defaultWidth: 320,
      sortable: true,
      reorderable: true,
      render: (row) => (
        <div>
          <a
            href={`/products/${row.product_id}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="data-primary text-base text-gray-900 dark:text-white line-clamp-2 hover:text-primary hover:underline"
          >
            {row.product_name}
          </a>
          <div className="text-sm text-gray-400 dark:text-slate-500">{subtitleOf(row)}</div>
        </div>
      ),
    },
    {
      key: 'quantity',
      label: 'จำนวน',
      align: 'right',
      defaultWidth: 100,
      sortable: true,
      resizable: true,
      reorderable: true,
      render: (row) => <span className="tabular-nums">{formatNumber(row.quantity)}</span>,
    },
    {
      key: 'reserved',
      label: 'จอง',
      align: 'right',
      defaultWidth: 90,
      resizable: true,
      reorderable: true,
      render: (row) => row.reserved > 0
        ? <span className="tabular-nums text-amber-600 dark:text-amber-400">{formatNumber(row.reserved)}</span>
        : DASH,
    },
    {
      key: 'available',
      label: 'พร้อมขาย',
      align: 'right',
      defaultWidth: 130,
      sortable: true,
      resizable: true,
      reorderable: true,
      render: (row) => (
        <span className="inline-flex items-center justify-end whitespace-nowrap">
          <span className="tabular-nums font-semibold">{formatNumber(row.available)}</span>
          <HelpHint
            portal
            align="right"
            ariaLabel="ดูแยกตามคลัง"
            trigger={<WarehouseIcon className="w-4 h-4" />}
          >
            <WarehouseBreakdown rows={row.by_warehouse} />
          </HelpHint>
        </span>
      ),
    },
    ...(features.consignment ? [{
      key: 'in_transit',
      label: 'กำลังส่ง',
      align: 'right' as const,
      defaultWidth: 110,
      resizable: true,
      reorderable: true,
      render: (row: StockRow) => row.in_transit > 0 ? (
        <span className="inline-flex items-center justify-end whitespace-nowrap">
          <span className="tabular-nums font-medium text-blue-600 dark:text-blue-400">{formatNumber(row.in_transit)}</span>
          <HelpHint portal align="right" ariaLabel="ดูรายตัวแทน" trigger={<WarehouseIcon className="w-4 h-4" />}>
            <QtyList title="กำลังส่งไปตัวแทน" rows={transitRowsOf(row)} empty="ไม่มีของกำลังส่ง" />
          </HelpHint>
        </span>
      ) : DASH,
    }] : []),
    ...(features.consignment ? [{
      key: 'consign',
      label: 'ฝากขาย',
      align: 'right' as const,
      defaultWidth: 110,
      resizable: true,
      reorderable: true,
      render: (row: StockRow) => row.consign_qty > 0 ? (
        <span className="inline-flex items-center justify-end whitespace-nowrap">
          <span className="tabular-nums font-medium text-purple-600 dark:text-purple-400">{formatNumber(row.consign_qty)}</span>
          <HelpHint portal align="right" ariaLabel="ดูรายตัวแทน" trigger={<WarehouseIcon className="w-4 h-4" />}>
            <QtyList title="ฝากขายที่ตัวแทน" rows={consignRowsOf(row)} empty="ไม่มีของฝากขาย" />
          </HelpHint>
        </span>
      ) : DASH,
    }] : []),
    {
      key: 'min',
      label: 'Min',
      align: 'right',
      defaultWidth: 90,
      sortable: true,
      resizable: true,
      reorderable: true,
      render: (row) => row.min_stock > 0
        ? <span className="tabular-nums text-gray-500 dark:text-slate-400">{formatNumber(row.min_stock)}</span>
        : DASH,
      edit: {
        type: 'number',
        getValue: (row) => row.min_stock,
        validate: (v) => (Number(v) < 0 ? 'ต้องไม่ติดลบ' : null),
        onSave: async (row, v) => {
          const value = Math.floor(Number(v) || 0);
          await saveMinStock([{ variation_id: row.variation_id, min_stock: value }]);
          patchMinStock(row.variation_id, value);
          void fetchData(true);
        },
      },
    },
    {
      key: 'status',
      label: 'สถานะ',
      align: 'center',
      defaultWidth: 110,
      reorderable: true,
      render: (row) => <StatusBadge domain="stockLevel" status={row.status} />,
    },
    {
      key: 'actions',
      label: 'จัดการ',
      alwaysVisible: true,
      stopPropagation: true,
      align: 'center',
      defaultWidth: 150,
      render: (row) => (
        <div className="flex items-center justify-center gap-1">
          <Button
            variant="secondary"
            size="sm"
            icon={<EditIcon className="w-4 h-4" />}
            onClick={() => setAdjustRow(row)}
            aria-label="ปรับสต็อก"
          >
            <span className="hidden lg:inline">ปรับสต็อก</span>
          </Button>
          <ActionMenu
            placement="auto"
            items={[
              {
                key: 'history',
                label: 'ประวัติการเคลื่อนไหว',
                icon: <ChecklistIcon className="w-3.5 h-3.5" />,
                onClick: () => onViewHistory?.(row.variation_id, labelOf(row)),
              },
              {
                key: 'edit',
                label: 'แก้ไขสินค้า',
                icon: <SquarePen className="w-3.5 h-3.5" />,
                onClick: () => openProduct(row.product_id),
              },
            ]}
          />
        </div>
      ),
    },
  ];

  const mobileCardRender = (row: StockRow) => (
    <div className="flex gap-3">
      <ProductImageThumb
        src={row.image_url}
        alt={row.product_name}
        size="lg"
        ratio="auto"
        fallbackIcon={<ProductIcon className="w-6 h-6 text-gray-400" />}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <a
              href={`/products/${row.product_id}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="body-text font-semibold text-gray-900 dark:text-white line-clamp-2 hover:text-primary hover:underline"
            >
              {row.product_name}
            </a>
            <p className="text-sm text-gray-400 dark:text-slate-500">{subtitleOf(row)}</p>
          </div>
          <div className="flex-shrink-0"><StatusBadge domain="stockLevel" status={row.status} /></div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="helper-text text-gray-400 dark:text-slate-500">จำนวน</p>
            <p className="text-base font-medium text-gray-900 dark:text-white tabular-nums">{formatNumber(row.quantity)}</p>
          </div>
          <div>
            <p className="helper-text text-gray-400 dark:text-slate-500">จอง</p>
            <p className={`text-base font-medium tabular-nums ${row.reserved > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-300 dark:text-slate-600'}`}>
              {row.reserved > 0 ? formatNumber(row.reserved) : '-'}
            </p>
          </div>
          <div>
            <p className="helper-text text-gray-400 dark:text-slate-500">พร้อมขาย</p>
            <p className="text-base font-bold text-gray-900 dark:text-white tabular-nums">{formatNumber(row.available)}</p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
          <Button
            variant="secondary"
            size="sm"
            icon={<EditIcon className="w-4 h-4" />}
            onClick={() => setAdjustRow(row)}
            className="flex-1 justify-center"
          >
            ปรับสต็อก
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<ChecklistIcon className="w-4 h-4" />}
            onClick={() => onViewHistory?.(row.variation_id, labelOf(row))}
            className="flex-1 justify-center"
          >
            ประวัติ
          </Button>
        </div>
      </div>
    </div>
  );

  const totalPages = Math.max(1, Math.ceil(total / recordsPerPage));

  return (
    <>
      {/* มูลค่าสต็อก — แยกสองก้อนเสมอ ⛔ ห้ามรวมเป็นตัวเลขเดียว
          ของเรา = ต้นทุนที่จ่ายไปแล้ว · ของ supplier = เงินที่ต้องจ่ายถ้าขายได้หมด (ยังไม่ใช่ของเรา) */}
      {valuation && (valuation.own.quantity > 0 || valuation.consignment.quantity > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="card card-p-md">
            <div className="flex items-center justify-between gap-2">
              <span className="subtitle-text text-gray-500 dark:text-slate-400">สต็อกของเรา</span>
              <ProductIcon className="w-4 h-4 text-gray-400" />
            </div>
            <p className="heading-3 mt-1 text-gray-900 dark:text-white">
              {valuation.own.value == null
                ? `${formatNumber(valuation.own.quantity)} ชิ้น`
                : `฿${formatNumber(Math.round(valuation.own.value))}`}
            </p>
            {valuation.own.value != null && (
              <p className="helper-text">{formatNumber(valuation.own.quantity)} ชิ้น · ต้นทุนที่จ่ายไปแล้ว</p>
            )}
          </div>
          {valuation.consignment.quantity > 0 && (
            <div className="card card-p-md">
              <div className="flex items-center justify-between gap-2">
                <span className="subtitle-text text-gray-500 dark:text-slate-400">ของ Supplier (ฝากขาย)</span>
                <HelpHint ariaLabel="ของฝากขายคิดมูลค่ายังไง">
                  ของฝากขายอยู่ในคลังเราและขายได้ แต่ยังเป็นของ supplier — ตัวเลขนี้คือ
                  <b> เงินที่ต้องจ่ายคืนถ้าขายได้หมด</b> ไม่ใช่สินทรัพย์ของร้าน จึงไม่รวมกับสต็อกของเรา
                </HelpHint>
              </div>
              <p className="heading-3 mt-1 text-gray-900 dark:text-white">
                {valuation.consignment.value == null
                  ? `${formatNumber(valuation.consignment.quantity)} ชิ้น`
                  : `฿${formatNumber(Math.round(valuation.consignment.value))}`}
              </p>
              <p className="helper-text">
                {formatNumber(valuation.consignment.quantity)} ชิ้น
                {valuation.consignment.value != null ? ' · เงินที่ต้องจ่ายถ้าขายได้หมด' : ''}
                {valuation.consignment.unpriced_quantity > 0
                  ? ` · ${formatNumber(valuation.consignment.unpriced_quantity)} ชิ้นยังไม่ได้ตั้งส่วนแบ่ง`
                  : ''}
              </p>
            </div>
          )}
        </div>
      )}

      <StatusTabs
        activeKey={status}
        onSelect={(key) => setParams({ status: key })}
        tabs={[
          { key: 'stocked', label: 'มีสต็อก', colorKey: 'all', count: counts?.stocked },
          { key: 'ok', label: 'ปกติ', colorKey: 'completed', count: counts?.ok },
          { key: 'near_low', label: 'ใกล้หมด', colorKey: 'partially_paid', count: counts?.near_low },
          { key: 'low', label: 'ต่ำกว่า Min', colorKey: 'ready_to_ship', count: counts?.low },
          { key: 'out', label: 'หมด', colorKey: 'overdue', count: counts?.out },
          { key: 'negative', label: 'ติดลบ', colorKey: 'overdue', count: counts?.negative },
          { key: 'none', label: 'ยังไม่มีสต็อก', colorKey: 'cancelled', count: counts?.none },
        ]}
      />

      {/* ตัวกรอง */}
      <div className="data-filter-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full md:flex-1 md:min-w-[220px]">
            <SearchInput
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="ค้นหาชื่อ, รหัส, SKU, บาร์โค้ด..."
            />
          </div>
          {warehouses.length > 1 && (
            <div className="w-full md:w-48">
              <FormSelect
                value={warehouseFilter}
                onChange={v => setParams({ wh: v || null, dealer: null })}
                options={warehouseOptions}
                clearLabel="ทุกคลัง"
                placeholder="คลัง"
                icon={<WarehouseIcon className="w-4 h-4" />}
                searchPlaceholder="ค้นหาคลัง..."
              />
            </div>
          )}
          {features.consignment && dealers.length > 0 && (
            <div className="w-full md:w-44">
              <FormSelect
                value={dealerFilter}
                onChange={v => setParams({ dealer: v || null, wh: null })}
                options={dealers}
                clearLabel="ทุกตัวแทน"
                placeholder="ตัวแทน"
                searchPlaceholder="ค้นหาตัวแทน..."
              />
            </div>
          )}
          {categories.length > 0 && (
            <div className="w-full md:w-44">
              <FormSelect
                value={categoryFilter}
                onChange={v => setParams({ cat: v || null })}
                options={categories}
                clearLabel="ทุกหมวดหมู่"
                placeholder="หมวดหมู่"
                searchPlaceholder="ค้นหาหมวดหมู่..."
              />
            </div>
          )}
          {features.product_brand && brands.length > 0 && (
            <div className="w-full md:w-44">
              <FormSelect
                value={brandFilter}
                onChange={v => setParams({ brand: v || null })}
                options={brands}
                clearLabel="ทุกแบรนด์"
                placeholder="แบรนด์"
                searchPlaceholder="ค้นหาแบรนด์..."
              />
            </div>
          )}
          {suppliers.length > 0 && (
            <div className="w-full md:w-44">
              <FormSelect
                value={supplierFilter}
                onChange={v => setParams({ sup: v || null })}
                options={suppliers}
                clearLabel="ทุก Supplier"
                placeholder="Supplier"
                searchPlaceholder="ค้นหา Supplier..."
              />
            </div>
          )}
          {hasActiveFilters && (
            <Tooltip text="ล้างตัวกรอง">
              <Button
                variant="ghost"
                icon={<CloseIcon className="w-4 h-4" />}
                onClick={clearAllFilters}
                aria-label="ล้างตัวกรอง"
              >
                <span className="hidden md:inline">ล้างตัวกรอง</span>
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingCard />
      ) : rows.length === 0 ? (
        <EmptyCard
          icon={<ProductIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          title={hasActiveFilters ? 'ไม่พบสินค้าที่ตรงกับตัวกรอง' : 'ยังไม่มีสินค้าในแท็บนี้'}
          subtitle={hasActiveFilters ? 'ลองล้างตัวกรองแล้วค้นใหม่' : undefined}
          actions={hasActiveFilters
            ? <Button variant="secondary" icon={<CloseIcon className="w-4 h-4" />} onClick={clearAllFilters}>ล้างตัวกรอง</Button>
            : undefined}
        />
      ) : (
        <div className="relative">
          {fetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60 pointer-events-none">
              <LoadingIcon className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          <DataTable<StockRow>
            storageKey="inventory-v2"
            columns={columns}
            data={rows}
            getRowId={(r) => r.variation_id}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            mobileCardRender={mobileCardRender}
            sortBy={sortKey}
            sortDir={sortDir}
            onSort={(key, dir) => setParams(dir === null
              ? { sort: null, dir: null }
              : { sort: key, dir })}
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            recordsPerPage={recordsPerPage}
            onPageChange={(p) => setParams({ page: String(p) })}
            onRecordsPerPageChange={(l) => setParams({ limit: String(l), page: '1' })}
            onLimitChange={(l, p) => setParams({ limit: String(l), page: String(p) })}
            emptyMessage="ไม่พบสินค้า"
            emptyIcon={<ProductIcon className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          />
        </div>
      )}

      <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
        <NumberInput
          min="0"
          value={bulkMin}
          onChange={setBulkMin}
          placeholder="Min"
          aria-label="ค่า Min Stock"
          className="w-28 form-control-md px-3 text-right bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg border border-gray-300 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
        />
        <Button variant="primary" loading={bulkSaving} onClick={handleBulkMin}>
          ตั้ง Min Stock ให้ {selectedIds.size} รายการ
        </Button>
        <Button variant="secondary" loading={bulkAllSaving} onClick={handleBulkMinAll}>
          ตั้งทุกรายการ…
        </Button>
      </BulkActionBar>

      {adjustRow && (
        <AdjustStockModal
          row={adjustRow}
          warehouses={warehouses}
          initialWarehouseId={initialWarehouseFor(adjustRow)}
          onClose={() => setAdjustRow(null)}
          onSaved={() => { setAdjustRow(null); void fetchData(true); }}
        />
      )}

      {confirmDialog}
    </>
  );
}
