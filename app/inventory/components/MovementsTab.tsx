'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowDownUp, Loader2, Package2, Warehouse, X } from 'lucide-react';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import SearchInput from '@/components/ui/SearchInput';
import FormSelect from '@/components/ui/FormSelect';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import HelpHint from '@/components/ui/HelpHint';
import Tooltip from '@/components/ui/Tooltip';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import DateRangePicker from '@/components/ui/DateRangePicker';
import { EmptyCard, LoadingCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useDebouncedCallback } from '@/lib/useDebounce';
import { useLiveRefresh } from '@/lib/useLiveRefresh';
import { formatNumber, formatThaiDate } from '@/lib/utils/format';
import { cleanVariationLabel } from '@/lib/product-display';
import {
  CARD_STYLES, MOVEMENT_REFERENCE_LINK, MOVEMENT_TYPE_ORDER, NEGATIVE_TYPES,
  POSITIVE_TYPES, REFERENCE_TYPE_LABELS, TYPE_BADGE_TONE, TYPE_CONFIG, TYPE_ICONS,
  formatDateValue,
  type MovementRow, type MovementSummaryRow, type TransactionType, type WarehouseItem,
} from './types';

interface MovementsTabProps {
  warehouses: WarehouseItem[];
}

const DEFAULT_LIMIT = 50;
const DASH = <span className="text-gray-400 dark:text-slate-500">-</span>;

/** วันที่แบบ `YYYY-MM-DD` ของวันนี้ + N วัน (N ติดลบ = ย้อนหลัง) */
function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return formatDateValue(d);
}

const REFERENCE_OPTIONS = Object.entries(REFERENCE_TYPE_LABELS).map(([id, label]) => ({ id, label }));

export default function MovementsTab({ warehouses }: MovementsTabProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  // ── สถานะทั้งหมดอยู่ใน URL (refresh / ปุ่มย้อนกลับแล้วยังอยู่ที่เดิม) ──
  const urlFrom = searchParams.get('from') || '';
  const urlTo = searchParams.get('to') || '';
  const warehouseFilter = searchParams.get('wh') || '';
  const dealerFilter = searchParams.get('dealer') || '';
  const typeParam = searchParams.get('type') || '';
  const referenceFilter = searchParams.get('ref') || '';
  const search = searchParams.get('q') || '';
  const variationId = searchParams.get('variation') || '';
  const variationLabel = searchParams.get('label') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const recordsPerPage = parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;

  const setParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    const defaults: Record<string, string> = {
      from: '', to: '', wh: '', dealer: '', type: '', ref: '', q: '',
      variation: '', label: '', page: '1', limit: String(DEFAULT_LIMIT),
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

  // ── ช่วงวันที่ ──
  // ไม่ได้ระบุใน URL: ดูรายการทั้งร้าน = 7 วันล่าสุด · ดูประวัติของตัวเลือกเดียว = ไม่จำกัดช่วง
  // ค่าเริ่มต้นคำนวณฝั่ง client และไม่เขียนลง URL จนกว่าผู้ใช้จะเปลี่ยนเอง
  const defaultRange = useMemo(() => ({ from: dayOffset(-6), to: dayOffset(0) }), []);
  const hasUrlDates = !!(urlFrom || urlTo);
  const effFrom = hasUrlDates ? urlFrom : (variationId ? '' : defaultRange.from);
  const effTo = hasUrlDates ? urlTo : (variationId ? '' : defaultRange.to);

  const activeTypes = useMemo(
    () => typeParam.split(',').map(t => t.trim()).filter(Boolean) as TransactionType[],
    [typeParam],
  );

  const hasActiveFilters = !!(search || warehouseFilter || dealerFilter || typeParam || referenceFilter || hasUrlDates);

  const clearAllFilters = () => {
    setParams({ q: null, wh: null, dealer: null, type: null, ref: null, from: null, to: null });
  };

  const toggleType = (type: TransactionType) => {
    const next = activeTypes.includes(type)
      ? activeTypes.filter(t => t !== type)
      : [...activeTypes, type];
    setParams({ type: next.join(',') || null });
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
  const [rows, setRows] = useState<MovementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<MovementSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setFetching(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(recordsPerPage),
      });
      if (effFrom) params.set('date_from', effFrom);
      if (effTo) params.set('date_to', effTo);
      if (dealerFilter) params.set('dealer_id', dealerFilter);
      else if (warehouseFilter) params.set('warehouse_id', warehouseFilter);
      if (variationId) params.set('variation_id', variationId);
      if (typeParam) params.set('types', typeParam);
      if (referenceFilter) params.set('reference_type', referenceFilter);
      if (search) params.set('search', search);

      const res = await apiFetch(`/api/inventory/transactions?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setRows(data.items || []);
      setTotal(data.total || 0);
      setSummary(data.summary || []);
    } catch (error) {
      console.error('Error fetching inventory movements:', error);
      if (!quiet) showToast('โหลดข้อมูลไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
      if (!quiet) setFetching(false);
    }
  }, [page, recordsPerPage, effFrom, effTo, warehouseFilter, dealerFilter, variationId, typeParam, referenceFilter, search, showToast]);

  // ยิงครั้งแรก + ทุกครั้งที่ค่าใน URL เปลี่ยนจริง (กัน re-render ซ้ำไม่ให้ยิงซ้ำ)
  const depsKey = `${page}|${recordsPerPage}|${effFrom}|${effTo}|${warehouseFilter}|${dealerFilter}|${variationId}|${typeParam}|${referenceFilter}|${search}`;
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

  // ช่วงที่ดูอยู่ครอบวันนี้ = ตัวเลขยังขยับได้ → ดึงใหม่เงียบ ๆ ตอนกลับมาที่แท็บ + ทุก 30 วิ
  const rangeIncludesToday = !effTo || effTo >= dayOffset(0);
  useLiveRefresh(() => { void fetchData(true); }, { enabled: rangeIncludesToday, pollMs: 30000 });

  // ── การ์ดสรุป — ครบทุกประเภทเสมอ ตำแหน่งไม่ขยับ ──
  const summaryMap = useMemo(() => {
    const map = new Map<string, MovementSummaryRow>();
    for (const s of summary) map.set(s.type, s);
    return map;
  }, [summary]);

  // ── ตัวเลือกคลัง: คลังในบริษัทก่อน แล้วค่อยคลังของตัวแทน ──
  const warehouseOptions = useMemo(() => [
    ...warehouses.filter(w => w.warehouse_type !== 'consignment').map(w => ({ id: w.id, label: w.name })),
    ...warehouses.filter(w => w.warehouse_type === 'consignment').map(w => ({ id: w.id, label: `[ตัวแทน] ${w.name}` })),
  ], [warehouses]);

  const subtitleOf = (row: MovementRow) => {
    const parts: string[] = [];
    if (row.product_code) parts.push(row.product_code);
    if (row.sku && row.sku !== row.product_code) parts.push(`SKU: ${row.sku}`);
    if (!row.is_simple) {
      const label = cleanVariationLabel({
        variation_label: row.variation_label,
        sku: row.sku,
        product_code: row.product_code,
        attributes: row.attributes,
      });
      if (label) parts.push(label);
    }
    return parts.join(' · ');
  };

  const productLink = (row: MovementRow, className: string) => (
    row.product_id ? (
      <a
        href={`/products/${row.product_id}/edit`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        className={className}
      >
        {row.product_name}
      </a>
    ) : <span className={className}>{row.product_name}</span>
  );

  const typeBadge = (row: MovementRow) => (
    <Badge tone={TYPE_BADGE_TONE[row.type] ?? 'gray'} size="sm">
      {TYPE_CONFIG[row.type]?.label ?? row.type}
    </Badge>
  );

  /** จำนวนพร้อมเครื่องหมาย — ปรับปรุงใช้เครื่องหมายของค่าที่บันทึกไว้ตามจริง */
  const signedQty = (row: MovementRow, big = false) => {
    const size = big ? 'text-lg font-bold' : 'font-medium';
    let sign: string;
    let positive: boolean;
    if (POSITIVE_TYPES.includes(row.type)) { sign = '+'; positive = true; }
    else if (NEGATIVE_TYPES.includes(row.type)) { sign = '−'; positive = false; }
    else {
      positive = row.quantity >= 0;
      sign = positive ? '+' : '−';
    }
    const color = positive
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-red-600 dark:text-red-400';
    return (
      <span className={`tabular-nums whitespace-nowrap ${size} ${color}`}>
        {sign}{formatNumber(Math.abs(row.quantity))}
      </span>
    );
  };

  const warehouseName = (row: MovementRow) => (
    row.warehouse_name
      ? `${row.warehouse_type === 'consignment' ? '[ตัวแทน] ' : ''}${row.warehouse_name}`
      : ''
  );

  const referenceCell = (row: MovementRow) => {
    if (!row.reference_type) return DASH;
    const label = REFERENCE_TYPE_LABELS[row.reference_type] ?? row.reference_type;
    const href = MOVEMENT_REFERENCE_LINK(row.reference_type, row.reference_id);
    return (
      <div className="min-w-0">
        {href ? (
          <Link
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="data-primary text-primary hover:underline"
          >
            {label}
          </Link>
        ) : (
          <span className="text-gray-700 dark:text-slate-300">{label}</span>
        )}
        {row.reference_id && (
          <div className="helper-text text-gray-400 dark:text-slate-500">
            #{row.reference_id.slice(-8)}
          </div>
        )}
      </div>
    );
  };

  const notesCell = (row: MovementRow) => (
    row.notes ? (
      <Tooltip text={row.notes}>
        <span className="block truncate text-gray-600 dark:text-slate-300">{row.notes}</span>
      </Tooltip>
    ) : DASH
  );

  const columns: DataTableColumn<MovementRow>[] = [
    {
      key: 'time',
      label: 'เวลา',
      defaultWidth: 120,
      resizable: true,
      render: (row) => (
        <div className="whitespace-nowrap">
          <div className="text-gray-900 dark:text-white">{formatThaiDate(row.created_at)}</div>
          <div className="helper-text text-gray-400 dark:text-slate-500">
            {new Date(row.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      label: 'ประเภท',
      defaultWidth: 110,
      resizable: true,
      reorderable: true,
      render: (row) => typeBadge(row),
    },
    {
      key: 'image',
      label: 'รูป',
      defaultWidth: 56,
      hideMobile: true,
      headerClassName: '!px-1',
      cellClassName: '!px-1 !py-1.5',
      render: (row) => (
        <ProductImageThumb
          src={row.image_url}
          alt={row.product_name}
          size="sm"
          ratio="auto"
          fallbackIcon={<Package2 className="w-5 h-5 text-gray-400" />}
        />
      ),
    },
    {
      key: 'product',
      label: 'สินค้า',
      alwaysVisible: true,
      grow: true,
      defaultWidth: 280,
      render: (row) => (
        <div className="min-w-0">
          {productLink(row, 'data-primary text-gray-900 dark:text-white line-clamp-2 hover:text-primary hover:underline')}
          <div className="helper-text text-gray-400 dark:text-slate-500 truncate">{subtitleOf(row)}</div>
        </div>
      ),
    },
    {
      key: 'quantity',
      label: 'จำนวน',
      align: 'right',
      defaultWidth: 100,
      resizable: true,
      reorderable: true,
      render: (row) => signedQty(row),
    },
    {
      key: 'balance',
      label: 'คงเหลือ',
      align: 'right',
      defaultWidth: 110,
      resizable: true,
      reorderable: true,
      render: (row) => (
        <span className="tabular-nums font-medium text-gray-900 dark:text-white">
          {formatNumber(row.balance_after)}
        </span>
      ),
    },
    {
      key: 'warehouse',
      label: 'คลัง',
      defaultWidth: 150,
      resizable: true,
      reorderable: true,
      render: (row) => (
        <span className="text-gray-600 dark:text-slate-300 line-clamp-2">{warehouseName(row) || DASH}</span>
      ),
    },
    {
      key: 'reference',
      label: 'ที่มา',
      defaultWidth: 160,
      resizable: true,
      reorderable: true,
      render: (row) => referenceCell(row),
    },
    {
      key: 'user',
      label: 'ผู้ทำ',
      defaultWidth: 120,
      resizable: true,
      reorderable: true,
      render: (row) => (
        <span className="text-gray-600 dark:text-slate-300 truncate">{row.created_by_name || 'ระบบ'}</span>
      ),
    },
    {
      key: 'notes',
      label: 'หมายเหตุ',
      defaultWidth: 160,
      resizable: true,
      reorderable: true,
      render: (row) => notesCell(row),
    },
  ];

  const mobileCardRender = (row: MovementRow) => (
    <div className="flex gap-3">
      <ProductImageThumb
        src={row.image_url}
        alt={row.product_name}
        size="sm"
        ratio="auto"
        fallbackIcon={<Package2 className="w-5 h-5 text-gray-400" />}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {productLink(row, 'body-text font-semibold text-gray-900 dark:text-white line-clamp-2 hover:text-primary hover:underline')}
            <p className="helper-text text-gray-400 dark:text-slate-500">{subtitleOf(row)}</p>
          </div>
          <div className="flex-shrink-0 flex flex-col items-end gap-1">
            {typeBadge(row)}
            {signedQty(row, true)}
          </div>
        </div>

        <div className="mt-2 helper-text text-gray-500 dark:text-slate-400">
          {formatThaiDate(row.created_at)}{' '}
          {new Date(row.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
          {warehouseName(row) ? ` · ${warehouseName(row)}` : ''}
          {row.reference_type ? ` · ${REFERENCE_TYPE_LABELS[row.reference_type] ?? row.reference_type}` : ''}
          {` · คงเหลือ ${formatNumber(row.balance_after)}`}
        </div>
        {row.notes && (
          <p className="helper-text text-gray-400 dark:text-slate-500 line-clamp-2">{row.notes}</p>
        )}
      </div>
    </div>
  );

  const totalPages = Math.max(1, Math.ceil(total / recordsPerPage));

  return (
    <>
      {/* การ์ดสรุปต่อประเภท — กดเพื่อกรอง (เลือกได้หลายประเภท) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {MOVEMENT_TYPE_ORDER.map(type => {
          const stat = summaryMap.get(type);
          const count = stat?.count ?? 0;
          const qty = stat?.total_qty ?? 0;
          const active = activeTypes.includes(type);
          const style = CARD_STYLES[type];
          const Icon = TYPE_ICONS[type];
          const sign = POSITIVE_TYPES.includes(type) ? '+' : NEGATIVE_TYPES.includes(type) ? '−' : '';
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => toggleType(type)}
              className={`choice-card p-3 text-left ${active ? 'choice-card-active ring-1 ring-primary/40' : ''}`}
            >
              <div className={`flex items-center gap-1.5 ${active ? style.textClass : 'text-gray-500 dark:text-slate-400'}`}>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="body-text font-medium truncate">{TYPE_CONFIG[type].label}</span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-1">
                <span className={`text-xl font-bold tabular-nums ${active ? style.textClass : 'text-gray-900 dark:text-white'}`}>
                  {formatNumber(count)}
                </span>
                <span className="helper-text tabular-nums text-gray-400 dark:text-slate-500 whitespace-nowrap">
                  {count > 0 ? `${sign}${formatNumber(Math.abs(qty))} ชิ้น` : ''}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ตัวกรอง */}
      <div className="data-filter-card">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-full md:flex-1 md:min-w-[220px]">
            <SearchInput
              value={searchInput}
              onChange={handleSearchChange}
              placeholder="ค้นหาชื่อ, รหัส, SKU, บาร์โค้ด, หมายเหตุ..."
            />
          </div>
          <div className="w-full md:w-64">
            <DateRangePicker
              value={{ startDate: effFrom || null, endDate: effTo || null }}
              onChange={(v) => setParams({
                from: formatDateValue(v?.startDate) || null,
                to: formatDateValue(v?.endDate) || null,
              })}
              showShortcuts
              placeholder="เลือกช่วงวันที่"
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
                icon={<Warehouse className="w-4 h-4" />}
                searchPlaceholder="ค้นหาคลัง..."
              />
            </div>
          )}
          <div className="w-full md:w-48">
            <FormSelect
              value={referenceFilter}
              onChange={v => setParams({ ref: v || null })}
              options={REFERENCE_OPTIONS}
              clearLabel="ทุกที่มา"
              placeholder="ที่มา"
              searchThreshold={99}
            />
          </div>
          {variationId && (
            <Badge
              tone="orange"
              onRemove={() => setParams({ variation: null, label: null })}
              removeLabel="เลิกดูเฉพาะสินค้านี้"
            >
              เฉพาะ: {variationLabel || 'สินค้าที่เลือก'}
            </Badge>
          )}
          {hasActiveFilters && (
            <Tooltip text="ล้างตัวกรอง">
              <Button
                variant="ghost"
                icon={<X className="w-4 h-4" />}
                onClick={clearAllFilters}
                aria-label="ล้างตัวกรอง"
              >
                <span className="hidden md:inline">ล้างตัวกรอง</span>
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1">
        <h3 className="heading-3">รายการเคลื่อนไหว</h3>
        <HelpHint ariaLabel="คำอธิบายคอลัมน์คงเหลือ">
          ยอดคงเหลือของคลังนี้หลังรายการ ไม่ใช่รวมทุกคลัง
        </HelpHint>
      </div>

      {loading ? (
        <LoadingCard />
      ) : rows.length === 0 ? (
        <EmptyCard
          icon={<ArrowDownUp className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          title={hasActiveFilters || variationId ? 'ไม่พบรายการที่ตรงกับตัวกรอง' : 'ยังไม่มีรายการเคลื่อนไหวในช่วงนี้'}
          subtitle={hasActiveFilters ? 'ลองขยายช่วงวันที่หรือล้างตัวกรอง' : undefined}
          actions={hasActiveFilters
            ? <Button variant="secondary" icon={<X className="w-4 h-4" />} onClick={clearAllFilters}>ล้างตัวกรอง</Button>
            : undefined}
        />
      ) : (
        <div className="relative">
          {fetching && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/60 dark:bg-slate-900/60 pointer-events-none">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          )}
          <DataTable<MovementRow>
            storageKey="inventory-movements"
            columns={columns}
            data={rows}
            getRowId={(r) => r.id}
            mobileCardRender={mobileCardRender}
            currentPage={page}
            totalPages={totalPages}
            totalRecords={total}
            recordsPerPage={recordsPerPage}
            onPageChange={(p) => setParams({ page: String(p) })}
            onRecordsPerPageChange={(l) => setParams({ limit: String(l), page: '1' })}
            onLimitChange={(l, p) => setParams({ limit: String(l), page: String(p) })}
            emptyMessage="ไม่พบรายการเคลื่อนไหว"
            emptyIcon={<ArrowDownUp className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          />
        </div>
      )}
    </>
  );
}
