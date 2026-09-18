'use client';

// ฟอร์มเอกสารสต็อกใบเดียวใช้ 3 โหมด — รับเข้า · เบิกออก · โอนย้าย
//
// เดิมเป็น 3 หน้าแยกที่ทำเรื่องเดียวกันคนละสำเนา และทั้งสามหน้าโหลดสินค้าทั้งร้าน
// แล้วตามด้วยสต็อกทั้งคลังยกก้อน (โดนเพดาน 1,000 แถวของ Supabase ตัดเงียบ ๆ)
// ตัวนี้ค้นสินค้าฝั่ง server (`useServerSearch` + `/api/products/search`) และถามยอดคงเหลือ
// เฉพาะตัวเลือกที่อยู่บนฟอร์มจริง (`/api/inventory/stock`) — ⛔ ห้ามกลับไปโหลดยกคลัง

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowRightLeft, CheckCircle2, ClipboardList, Factory,
  Package2, PackageMinus, Plus, Star, Undo2, Warehouse,
} from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import FormSelect from '@/components/ui/FormSelect';
import FormTextarea from '@/components/ui/FormTextarea';
import HelpHint from '@/components/ui/HelpHint';
import ItemsTable, { type ColumnKey, type TableItem } from '@/components/ui/ItemsTable';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { LoadingCard } from '@/components/ui/StateCard';
import StickyActionBar from '@/components/ui/StickyActionBar';
import { apiFetch } from '@/lib/api-client';
import { useFeatures } from '@/lib/features-context';
import { productDisplayName } from '@/lib/product-display';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useServerSearch, type ServerSearchPage } from '@/lib/useServerSearch';
import { useToast } from '@/lib/toast-context';

export type StockDocMode = 'receive' | 'issue' | 'transfer' | 'supplier_return';

// ── ค่าคงที่ต่อโหมด ────────────────────────────────────────────────────────

interface ModeConfig {
  title: string;
  listHref: string;
  listLabel: string;
  crumb: string;
  endpoint: string;
  saveLabel: string;
  confirmTitle: string;
  confirmDescription: string;
  confirmLabel: string;
  confirmIcon: React.ReactNode;
  emptyMessage: string;
  errorFallback: string;
}

const MODES: Record<StockDocMode, ModeConfig> = {
  receive: {
    title: 'รับเข้าสินค้า',
    listHref: '/inventory/receives',
    listLabel: 'รายการรับเข้า',
    crumb: 'รับเข้าสินค้า',
    endpoint: '/api/inventory/receives',
    saveLabel: 'บันทึกรับเข้า',
    confirmTitle: 'ยืนยันรับเข้าสินค้า',
    confirmDescription: 'คุณต้องการรับเข้าสินค้าทั้งหมดใช่หรือไม่?',
    confirmLabel: 'ยืนยันรับเข้า',
    confirmIcon: <Package2 className="w-6 h-6 text-primary" />,
    emptyMessage: 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน',
    errorFallback: 'เกิดข้อผิดพลาดในการรับเข้าสินค้า',
  },
  issue: {
    title: 'เบิกออกสินค้า',
    listHref: '/inventory/issues',
    listLabel: 'รายการเบิกออก',
    crumb: 'เบิกออกสินค้า',
    endpoint: '/api/inventory/issues',
    saveLabel: 'บันทึกเบิกออก',
    confirmTitle: 'ยืนยันเบิกออกสินค้า',
    confirmDescription: 'คุณต้องการเบิกออกสินค้าทั้งหมดใช่หรือไม่?',
    confirmLabel: 'ยืนยันเบิกออก',
    confirmIcon: <PackageMinus className="w-6 h-6 text-primary" />,
    emptyMessage: 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน',
    errorFallback: 'เกิดข้อผิดพลาดในการเบิกออกสินค้า',
  },
  supplier_return: {
    title: 'คืนของให้ Supplier',
    listHref: '/inventory/supplier-returns',
    listLabel: 'รายการคืนของ Supplier',
    crumb: 'คืนของให้ Supplier',
    endpoint: '/api/inventory/supplier-returns',
    saveLabel: 'บันทึกใบคืน',
    confirmTitle: 'ยืนยันคืนของให้ Supplier',
    confirmDescription: 'ของจะถูกตัดออกจากคลังทันที และบันทึกเป็นใบคืนให้ Supplier',
    confirmLabel: 'ยืนยันคืนของ',
    confirmIcon: <Undo2 className="w-6 h-6 text-primary" />,
    emptyMessage: 'เพิ่มสินค้าที่จะคืนโดยพิมพ์ค้นหาด้านบน',
    errorFallback: 'เกิดข้อผิดพลาดในการคืนของ',
  },
  transfer: {
    title: 'โอนย้ายสินค้า',
    listHref: '/inventory/transfers',
    listLabel: 'รายการโอนย้าย',
    crumb: 'สร้างใบโอนย้าย',
    endpoint: '/api/inventory/transfers',
    saveLabel: 'สร้างใบโอนย้าย',
    confirmTitle: 'ยืนยันโอนย้ายสินค้า',
    confirmDescription: 'คุณต้องการสร้างใบโอนย้ายนี้ใช่หรือไม่?',
    confirmLabel: 'ยืนยันโอนย้าย',
    confirmIcon: <ArrowRightLeft className="w-6 h-6 text-primary" />,
    emptyMessage: 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน',
    errorFallback: 'เกิดข้อผิดพลาดในการโอนย้ายสินค้า',
  },
};

/** เหตุผลเบิกออก — ชุดเดียวกับหน้าเดิม */
const REASON_OPTIONS = [
  { value: 'เสียหาย', label: 'เสียหาย' },
  { value: 'หมดอายุ', label: 'หมดอายุ' },
  { value: 'ตัวอย่าง', label: 'ตัวอย่าง' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
];

/** เหตุผลคืนของให้ supplier — ของที่คืนเพราะสภาพ ไม่ใช่เพราะเราเบิกไปใช้ */
const RETURN_REASON_OPTIONS = [
  { value: 'ชำรุด', label: 'ชำรุด' },
  { value: 'กล่องเสีย', label: 'กล่องเสีย' },
  { value: 'ส่งผิดรุ่น', label: 'ส่งผิดรุ่น' },
  { value: 'หมดอายุ', label: 'หมดอายุ' },
  { value: 'ขายไม่ออก', label: 'ขายไม่ออก (ของฝากขาย)' },
  { value: 'อื่นๆ', label: 'อื่นๆ' },
];

// ── Types ─────────────────────────────────────────────────────────────────

interface WarehouseItem {
  id: string;
  name: string;
  code: string | null;
  is_default?: boolean;
}

interface DocLine {
  variation_id: string;
  product_id: string;
  code: string;
  name: string;
  image?: string;
  variation_label?: string;
  sku?: string;
  quantity: number;
  unit_cost: number;
  /** ต้นทุนถูกเติมจาก WAC หรือผู้ใช้พิมพ์เองแล้ว — กันสต็อกรอบถัดไปเติมทับ */
  costTouched: boolean;
  reason: string;
  po_quantity?: number;
}

interface StockEntry {
  quantity: number;
  available: number;
}

interface POItemRow {
  variation_id: string;
  quantity: number;
  received_quantity?: number;
  unit_cost?: number;
  variation?: {
    variation_label?: string | null;
    sku?: string | null;
    product?: { id?: string; code?: string; name?: string; image?: string | null } | null;
  } | null;
}

interface POOption {
  id: string;
  po_number: string;
  supplier_id: string;
  supplier_name: string;
}

/** ดีลของล็อตที่รับเข้า — ค่าตั้งต้นมาจาก supplier แต่แก้รายล็อตได้
 *  (เจ้าเดียวกันส่งมาแบบซื้อขาดบ้าง ฝากขายบ้าง — กติกาเต็มใน .claude/rules/domains/inventory.md) */
type DealType = 'cash' | 'credit' | 'consignment';

interface SupplierOption {
  id: string;
  name: string;
  supplier_type?: DealType | string | null;
  payment_terms?: number | null;
}

const DEAL_OPTIONS: { id: DealType; label: string; hint: string }[] = [
  { id: 'cash', label: 'ซื้อสด', hint: 'จ่ายทันที · ของเป็นของเราแล้ว' },
  { id: 'credit', label: 'เครดิต', hint: 'ของเป็นของเราแล้ว แต่ยังค้างจ่าย' },
  { id: 'consignment', label: 'ฝากขาย', hint: 'ของยังเป็นของ supplier · จ่ายเมื่อขายได้ · ไม่คิดเข้าต้นทุนเฉลี่ย' },
];

// ── ค้นสินค้าฝั่ง server ───────────────────────────────────────────────────

interface SearchRow {
  variation_id: string;
  product_id: string;
  code: string;
  name: string;
  product_type: string;
  variation_label: string | null;
  sku: string | null;
  barcode: string | null;
  default_price: number | string | null;
  discount_price: number | string | null;
  image_url: string | null;
}

/**
 * RPC `search_order_products` รอบเดียว (~30KB) — `exclude_composite=1` ตัดสินค้าชุดออก
 * เพราะชุดย่อยไม่มีสต็อกของตัวเอง จึงรับเข้า/เบิก/โอนตรง ๆ ไม่ได้
 */
async function fetchStockProductSearchPage(q: string): Promise<ServerSearchPage<ProductSearchItem>> {
  const res = await apiFetch(`/api/products/search?q=${encodeURIComponent(q)}&limit=80&exclude_composite=1`);
  if (!res.ok) throw new Error('product search failed');
  const json = await res.json();
  const rows: ProductSearchItem[] = ((json.items || []) as SearchRow[]).map(r => ({
    id: r.variation_id,
    product_id: r.product_id,
    // parity กับรายการเดิม: simple ใช้รหัสสินค้าเปล่า · variation ต่อท้ายด้วยชื่อตัวเลือก
    code: r.product_type === 'simple' ? r.code : `${r.code}-${r.variation_label ?? ''}`,
    name: r.name,
    image: r.image_url ?? undefined,
    variation_label: r.variation_label ?? undefined,
    sku: r.sku ?? undefined,
    barcode: r.barcode ?? undefined,
    default_price: Number(r.default_price) || 0,
    discount_price: Number(r.discount_price) || 0,
  }));
  return { rows, complete: json.complete !== false };
}

/** กรองผลชุดเดิมในเครื่องเมื่อพิมพ์ต่อจากคำเดิม — ต้องเทียบช่องเดียวกับที่ RPC ค้น */
function narrowProducts(rows: ProductSearchItem[], q: string): ProductSearchItem[] {
  const term = q.toLowerCase();
  return rows.filter(p =>
    p.name.toLowerCase().includes(term)
    || (p.code || '').toLowerCase().includes(term)
    || (p.sku || '').toLowerCase().includes(term)
    || (p.barcode || '').toLowerCase().includes(term)
    || (p.variation_label || '').toLowerCase().includes(term));
}

/** ยอดคงเหลือเฉพาะตัวเลือกที่อยู่บนฟอร์ม (+ WAC เมื่อมีสิทธิ์ดูต้นทุน) */
async function fetchLineStock(
  ids: string[],
  warehouseId: string,
): Promise<{ stock: Record<string, StockEntry>; cost: Record<string, number> }> {
  const params = new URLSearchParams({ variation_ids: ids.join(','), warehouse_id: warehouseId });
  const res = await apiFetch(`/api/inventory/stock?${params.toString()}`);
  if (!res.ok) throw new Error('stock fetch failed');
  const json = await res.json();
  return { stock: json.stock || {}, cost: json.cost || {} };
}

function warehouseOptions(list: WarehouseItem[]) {
  return list.map(wh => ({
    id: wh.id,
    label: `${wh.name}${wh.code ? ` (${wh.code})` : ''}`,
    icon: wh.is_default ? <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> : undefined,
  }));
}

// ── Component ─────────────────────────────────────────────────────────────

export default function StockDocForm({ mode }: { mode: StockDocMode }) {
  const cfg = MODES[mode];
  const router = useRouter();
  const { showToast } = useToast();
  const { features } = useFeatures();
  const { allowed, loading: authLoading } = useAuthGuard('inventory.manage');
  const { confirm, confirmDialog } = useConfirmDialog();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destWarehouseId, setDestWarehouseId] = useState('');
  const [allowOversell, setAllowOversell] = useState(true);

  const [receiveMode, setReceiveMode] = useState<'manual' | 'po'>('manual');
  const [purchaseOrders, setPurchaseOrders] = useState<POOption[]>([]);
  const [posLoading, setPosLoading] = useState(false);
  const [selectedPOId, setSelectedPOId] = useState('');
  const [selectedPO, setSelectedPO] = useState<POOption | null>(null);

  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [dealType, setDealType] = useState<DealType>('cash');
  const [creditDueDate, setCreditDueDate] = useState('');

  const [lines, setLines] = useState<DocLine[]>([]);
  const [notes, setNotes] = useState('');

  const [sourceStock, setSourceStock] = useState<Record<string, StockEntry>>({});
  const [destStock, setDestStock] = useState<Record<string, StockEntry>>({});
  const [costMap, setCostMap] = useState<Record<string, number>>({});

  // ค้นสินค้าฝั่ง server — seq guard/แคช/กรองต่อในเครื่องอยู่ใน useServerSearch แล้ว
  const productSearch = useServerSearch<ProductSearchItem>({
    fetch: fetchStockProductSearchPage,
    narrow: narrowProducts,
  });

  // ── โหลดคลัง ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiFetch('/api/warehouses');
        if (!res.ok) throw new Error('failed');
        const data = await res.json();
        if (cancelled) return;
        const list: WarehouseItem[] = data.warehouses || [];
        setWarehouses(list);
        if (data.stockConfig) setAllowOversell(data.stockConfig.allowOversell !== false);
        const preferred = list.find(wh => wh.is_default) || list[0];
        if (preferred) setSourceWarehouseId(prev => prev || preferred.id);
      } catch {
        if (!cancelled) showToast('โหลดข้อมูลคลังสินค้าไม่สำเร็จ', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, showToast]);

  // ── ใบสั่งซื้อที่ยังรอรับของ (โหมดรับเข้า + เปิดฟีเจอร์ซัพพลายเออร์) ──────
  const fetchPOs = useCallback(async () => {
    setPosLoading(true);
    try {
      const [r1, r2] = await Promise.all([
        apiFetch('/api/inventory/purchase-orders?status=sent'),
        apiFetch('/api/inventory/purchase-orders?status=partial_received'),
      ]);
      const pos: POOption[] = [];
      for (const res of [r1, r2]) {
        if (!res.ok) continue;
        const d = await res.json();
        for (const po of (d.purchase_orders || [])) {
          pos.push({
            id: po.id,
            po_number: po.po_number,
            supplier_id: po.supplier?.id || '',
            supplier_name: po.supplier?.name || '',
          });
        }
      }
      setPurchaseOrders(pos);
    } catch {
      /* ปล่อยว่าง — ช่องค้น PO จะขึ้น "ไม่มี PO ที่รอรับของ" */
    } finally {
      setPosLoading(false);
    }
  }, []);

  const suppliersFetchedRef = useRef(false);
  useEffect(() => {
    if ((mode !== 'receive' && mode !== 'supplier_return') || !allowed || !features.supplier || suppliersFetchedRef.current) return;
    suppliersFetchedRef.current = true;
    apiFetch('/api/suppliers')
      .then(async res => { if (res.ok) setSuppliers(((await res.json()).data || []) as SupplierOption[]); })
      .catch(() => { /* ไม่มีรายชื่อก็ยังรับเข้าได้ แค่ระบุดีลเองไม่มีค่าตั้งต้น */ });
  }, [mode, allowed, features.supplier]);

  /** เลือก supplier แล้วเติมดีลตั้งต้น + วันครบกำหนดจากเครดิตของเจ้านั้น */
  const applySupplierDefaults = useCallback((id: string, list: SupplierOption[]) => {
    const found = list.find(item => item.id === id);
    const type = found?.supplier_type;
    const nextDeal: DealType = type === 'credit' || type === 'consignment' ? type : 'cash';
    setDealType(nextDeal);
    if (nextDeal === 'credit') {
      const days = Number(found?.payment_terms) || 0;
      const due = new Date();
      due.setDate(due.getDate() + days);
      setCreditDueDate(due.toISOString().slice(0, 10));
    } else {
      setCreditDueDate('');
    }
  }, []);

  const posFetchedRef = useRef(false);
  useEffect(() => {
    if (mode !== 'receive' || !allowed || !features.supplier || posFetchedRef.current) return;
    posFetchedRef.current = true;
    void fetchPOs();
  }, [mode, allowed, features.supplier, fetchPOs]);

  // ── ยอดคงเหลือของบรรทัดบนฟอร์ม (debounce 200ms + seq guard) ─────────────
  const lineIdsKey = useMemo(() => lines.map(l => l.variation_id).join(','), [lines]);
  const stockSeqRef = useRef(0);

  useEffect(() => {
    const ids = lineIdsKey ? lineIdsKey.split(',') : [];
    const seq = ++stockSeqRef.current;
    if (ids.length === 0 || !sourceWarehouseId) {
      setSourceStock({});
      setDestStock({});
      setCostMap({});
      return;
    }
    const needDest = mode === 'transfer' && !!destWarehouseId && destWarehouseId !== sourceWarehouseId;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [src, dst] = await Promise.all([
            fetchLineStock(ids, sourceWarehouseId),
            needDest ? fetchLineStock(ids, destWarehouseId) : Promise.resolve(null),
          ]);
          if (seq !== stockSeqRef.current) return;  // มีคำขอใหม่กว่าแล้ว ทิ้งผลนี้
          setSourceStock(src.stock);
          setCostMap(src.cost);
          setDestStock(dst ? dst.stock : {});
        } catch {
          if (seq !== stockSeqRef.current) return;
          setSourceStock({});
          setDestStock({});
        }
      })();
    }, 200);
    return () => clearTimeout(timer);
  }, [lineIdsKey, sourceWarehouseId, destWarehouseId, mode]);

  // รับเข้า: เติมต้นทุนตั้งต้นจาก WAC ให้บรรทัดที่ผู้ใช้ยังไม่ได้พิมพ์เอง
  useEffect(() => {
    if (mode !== 'receive') return;
    setLines(prev => {
      let changed = false;
      const next = prev.map(line => {
        if (line.costTouched) return line;
        const wac = costMap[line.variation_id];
        if (wac === undefined || wac <= 0) return line;
        changed = true;
        return { ...line, unit_cost: wac, costTouched: true };
      });
      return changed ? next : prev;
    });
  }, [costMap, mode]);

  // ── รายการสินค้า ────────────────────────────────────────────────────────
  const handleAdd = useCallback((product: ProductSearchItem) => {
    setLines(prev => {
      const idx = prev.findIndex(l => l.variation_id === product.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, {
        variation_id: product.id,
        product_id: product.product_id || product.id,
        code: product.code || '',
        name: product.name,
        image: product.image ?? undefined,
        variation_label: product.variation_label,
        sku: product.sku,
        quantity: 1,
        unit_cost: 0,
        costTouched: false,
        reason: 'เสียหาย',
      }];
    });
  }, []);

  const handleUpdateField = useCallback((idx: number, field: keyof TableItem, value: number | string) => {
    setLines(prev => prev.map((line, i) => {
      if (i !== idx) return line;
      if (field === 'quantity') return { ...line, quantity: Math.max(1, Number(value) || 0) };
      if (field === 'unit_cost') return { ...line, unit_cost: Math.max(0, Number(value) || 0), costTouched: true };
      if (field === 'reason') return { ...line, reason: String(value) };
      return line;
    }));
  }, []);

  const handleRemove = useCallback((idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx));
  }, []);

  // ── เลือก PO แล้วเติมรายการที่ยังรับไม่ครบ ───────────────────────────────
  const handleSelectPO = useCallback(async (poId: string) => {
    setSelectedPOId(poId);
    if (!poId) {
      setSelectedPO(null);
      setLines([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/inventory/purchase-orders/${poId}`);
      if (!res.ok) throw new Error('failed');
      const data = await res.json();
      const po = data.purchase_order;
      setSelectedPO({
        id: po.id,
        po_number: po.po_number,
        supplier_id: po.supplier?.id || '',
        supplier_name: po.supplier?.name || '',
      });
      if (po.supplier?.id) {
        setSupplierId(po.supplier.id);
        applySupplierDefaults(po.supplier.id, suppliers);
      }
      if (po.warehouse_id) setSourceWarehouseId(po.warehouse_id);
      const newLines: DocLine[] = [];
      for (const item of ((po.items || []) as POItemRow[])) {
        const remaining = item.quantity - (item.received_quantity || 0);
        if (remaining <= 0) continue;
        newLines.push({
          variation_id: item.variation_id,
          product_id: item.variation?.product?.id || '',
          code: item.variation?.product?.code || '',
          name: item.variation?.product?.name || '',
          image: item.variation?.product?.image || undefined,
          variation_label: item.variation?.variation_label || undefined,
          sku: item.variation?.sku || undefined,
          quantity: remaining,
          unit_cost: item.unit_cost || 0,
          costTouched: true,   // ราคาจาก PO เป็นของจริง ห้าม WAC เติมทับ
          reason: '',
          po_quantity: remaining,
        });
      }
      setLines(newLines);
    } catch {
      showToast('โหลดข้อมูล PO ไม่สำเร็จ', 'error');
    }
  }, [showToast, applySupplierDefaults, suppliers]);

  const handleReceiveModeChange = useCallback((next: 'manual' | 'po') => {
    setReceiveMode(prev => {
      if (prev === next) return prev;
      setLines([]);
      setNotes('');
      setSelectedPOId('');
      setSelectedPO(null);
      return next;
    });
  }, []);

  // ── ตรวจก่อนบันทึก ──────────────────────────────────────────────────────
  /** โหมดที่ตัดของออกจากคลัง + ร้านไม่ยอมให้ขายเกิน = ห้ามเกินยอดพร้อมใช้ */
  const enforceStock = mode !== 'receive' && !allowOversell;

  const lineErrors = useMemo(() => {
    const map = new Map<number, string>();
    lines.forEach((line, idx) => {
      if (!(line.quantity > 0)) {
        map.set(idx, 'จำนวนต้องมากกว่า 0');
        return;
      }
      if ((mode === 'issue' || mode === 'supplier_return') && !line.reason.trim()) {
        map.set(idx, 'กรุณาเลือกเหตุผล');
        return;
      }
      if (enforceStock) {
        const available = sourceStock[line.variation_id]?.available ?? 0;
        if (line.quantity > available) {
          map.set(idx, `คงเหลือพร้อมใช้ ${available.toLocaleString()} ชิ้น แต่ระบุ ${line.quantity.toLocaleString()} ชิ้น`);
        }
      }
    });
    return map;
  }, [lines, mode, enforceStock, sourceStock]);

  const sameWarehouse = mode === 'transfer' && !!sourceWarehouseId && sourceWarehouseId === destWarehouseId;
  const hasPOMismatch = lines.some(l => l.po_quantity != null && l.quantity !== l.po_quantity);
  const overStockWarning = mode === 'transfer' && !enforceStock
    && lines.some(l => l.quantity > (sourceStock[l.variation_id]?.available ?? 0));

  const canSubmit =
    !submitting
    && !!sourceWarehouseId
    && lines.length > 0
    && lineErrors.size === 0
    && (mode !== 'transfer' || (!!destWarehouseId && !sameWarehouse))
    // คืนของต้องรู้ว่าคืนให้ใคร — ไม่มี supplier แล้วใบนี้ไร้ความหมาย
    && (mode !== 'supplier_return' || !!supplierId);

  // ── บันทึก ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;

    const ok = await confirm({
      title: cfg.confirmTitle,
      description: cfg.confirmDescription,
      confirmLabel: cfg.confirmLabel,
      icon: cfg.confirmIcon,
      confirmIcon: <CheckCircle2 className="w-4 h-4" />,
      children: (
        <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg p-3 space-y-1.5">
          {mode === 'transfer' ? (
            <>
              <ConfirmRow label="คลังต้นทาง" value={warehouses.find(w => w.id === sourceWarehouseId)?.name || '-'} />
              <ConfirmRow label="คลังปลายทาง" value={warehouses.find(w => w.id === destWarehouseId)?.name || '-'} />
            </>
          ) : (
            <ConfirmRow label="คลังสินค้า" value={warehouses.find(w => w.id === sourceWarehouseId)?.name || '-'} />
          )}
          <ConfirmRow label="จำนวนรายการ" value={`${lines.length} รายการ`} />
          <ConfirmRow label="จำนวนรวม" value={`${lines.reduce((s, l) => s + l.quantity, 0).toLocaleString()} ชิ้น`} />
          {hasPOMismatch && (
            <p className="body-text text-amber-600 dark:text-amber-400">จำนวนรับเข้าไม่ตรงกับ PO บางรายการ</p>
          )}
        </div>
      ),
    });
    if (!ok) return;

    setSubmitting(true);
    try {
      let payload: Record<string, unknown>;
      if (mode === 'receive') {
        payload = {
          warehouse_id: sourceWarehouseId,
          items: lines.map(l => ({
            variation_id: l.variation_id,
            quantity: l.quantity,
            unit_cost: l.unit_cost || undefined,
          })),
          notes: notes || undefined,
        };
        if (selectedPO) {
          payload.po_id = selectedPO.id;
          payload.supplier_id = selectedPO.supplier_id;
        } else if (supplierId) {
          payload.supplier_id = supplierId;
        }
        if (features.supplier && (selectedPO || supplierId)) {
          payload.deal_type = dealType;
          if (dealType === 'credit' && creditDueDate) payload.credit_due_date = creditDueDate;
        }
      } else if (mode === 'issue') {
        payload = {
          warehouse_id: sourceWarehouseId,
          items: lines.map(l => ({ variation_id: l.variation_id, quantity: l.quantity, reason: l.reason })),
          notes: notes || undefined,
        };
      } else if (mode === 'supplier_return') {
        payload = {
          warehouse_id: sourceWarehouseId,
          supplier_id: supplierId,
          items: lines.map(l => ({ variation_id: l.variation_id, quantity: l.quantity, reason: l.reason })),
          notes: notes || undefined,
        };
      } else {
        payload = {
          from_warehouse_id: sourceWarehouseId,
          to_warehouse_id: destWarehouseId,
          items: lines.map(l => ({ variation_id: l.variation_id, quantity: l.quantity })),
          notes: notes || undefined,
        };
      }

      const res = await apiFetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || cfg.errorFallback);

      const docNumber = result.receive_number || result.issue_number || result.transfer_number || '';
      const doneLabel = mode === 'receive' ? 'สร้างใบรับเข้า' : mode === 'issue' ? 'สร้างใบเบิกออก' : 'สร้างใบโอนย้าย';
      showToast(`${doneLabel} ${docNumber} สำเร็จ`, 'success');
      router.push(cfg.listHref);
    } catch (error) {
      showToast(error instanceof Error ? error.message : cfg.errorFallback, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── ข้อมูลที่ส่งให้ ItemsTable ──────────────────────────────────────────
  const stockMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [id, entry] of Object.entries(sourceStock)) {
      // รับเข้า = โชว์ยอดคงเหลือจริง · เบิก/โอน = ยอดที่หยิบได้จริง (หักจอง)
      map[id] = mode === 'receive' ? entry.quantity : entry.available;
    }
    return map;
  }, [sourceStock, mode]);

  const columns: ColumnKey[] = useMemo(() => {
    if (mode === 'receive') {
      return receiveMode === 'po'
        ? ['stock_badge', 'po_quantity', 'qty', 'unit_cost', 'total']
        : ['stock_badge', 'qty', 'unit_cost', 'total'];
    }
    if (mode === 'issue' || mode === 'supplier_return') return ['stock_badge', 'qty', 'reason'];
    return ['stock_source', 'stock_dest', 'qty'];
  }, [mode, receiveMode]);

  const tableItems: TableItem[] = useMemo(() => lines.map(l => ({
    variation_id: l.variation_id,
    product_id: l.product_id,
    product_name: l.name,
    product_code: l.code,
    variation_label: l.variation_label,
    sku: l.sku,
    image: l.image,
    quantity: l.quantity,
    unit_cost: mode === 'receive' ? l.unit_cost : undefined,
    reason: mode === 'issue' || mode === 'supplier_return' ? l.reason : undefined,
    po_quantity: l.po_quantity,
    stock_source: mode === 'transfer' ? (sourceStock[l.variation_id]?.available ?? null) : undefined,
    stock_dest: mode === 'transfer' ? (destStock[l.variation_id]?.quantity ?? null) : undefined,
  })), [lines, mode, sourceStock, destStock]);

  const breadcrumbs = [
    { label: 'คลังสินค้า', href: '/inventory' },
    { label: cfg.listLabel, href: cfg.listHref },
    { label: cfg.crumb },
  ];

  if (authLoading) {
    return (
      <Layout title={cfg.title} breadcrumbs={breadcrumbs}>
        <LoadingCard />
      </Layout>
    );
  }
  if (!allowed) return null;   // useAuthGuard พาไปหน้าอื่นแล้ว
  if (loading) {
    return (
      <Layout title={cfg.title} breadcrumbs={breadcrumbs}>
        <LoadingCard />
      </Layout>
    );
  }

  const showItemsTable = mode !== 'transfer' || (!!sourceWarehouseId && !!destWarehouseId && !sameWarehouse);

  return (
    <Layout title={cfg.title} breadcrumbs={breadcrumbs}>
      <div className="space-y-4">
        {/* โหมดรับเข้า: รับเข้าใหม่ / จาก PO */}
        {mode === 'receive' && features.supplier && (
          <FilterChips
            variant="segmented"
            value={receiveMode}
            onChange={handleReceiveModeChange}
            chips={[
              { id: 'manual', label: 'รับเข้าใหม่', icon: <Plus className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
              { id: 'po', label: 'จาก PO', icon: <ClipboardList className="w-4 h-4" />, activeClass: FILTER_CHIP_PRIMARY_ACTIVE },
            ]}
          />
        )}

        {/* เลือกใบสั่งซื้อ */}
        {mode === 'receive' && receiveMode === 'po' && (
          <Card padding="md">
            <label className="field-label">
              เลือกใบสั่งซื้อ (PO) <span className="text-red-500">*</span>
            </label>
            <div className="w-full sm:w-96">
              <EntitySearchInput
                value={selectedPOId}
                onChange={id => void handleSelectPO(id)}
                onClear={() => void handleSelectPO('')}
                options={purchaseOrders.map(po => ({
                  id: po.id,
                  label: po.po_number,
                  subtitle: po.supplier_name,
                  icon: <ClipboardList className="w-4 h-4 text-gray-400" />,
                }))}
                placeholder="ค้นหา PO หรือชื่อ Supplier..."
                icon={<ClipboardList className="w-4 h-4" />}
                loading={posLoading}
                emptyMessage="ไม่มี PO ที่รอรับของ"
              />
            </div>
            {selectedPO && (
              <p className="subtitle-text mt-2">
                Supplier: <strong>{selectedPO.supplier_name}</strong>
                {' · '}
                คลัง: <strong>{warehouses.find(wh => wh.id === sourceWarehouseId)?.name || '-'}</strong>
              </p>
            )}
          </Card>
        )}

        {/* Supplier + ดีลของล็อตนี้ — โหมดรับเข้าใหม่ (เลือกได้) และโหมดคืนของ (บังคับ)
            โหมดรับเข้าจาก PO จะเติมให้เองจากใบสั่งซื้อ */}
        {(mode === 'supplier_return' || (mode === 'receive' && receiveMode === 'manual')) && features.supplier && (
          <Card padding="md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex-1">
                <label className="field-label">
                  Supplier {mode === 'supplier_return' && <span className="text-red-500">*</span>}
                  {mode === 'receive' && (
                    <HelpHint ariaLabel="ต้องเลือก Supplier ไหม">
                      <b>ไม่เลือกก็ได้</b> — ของที่ซื้อมาเอง (ซื้อจากตลาด · นำเข้าเอง · ซื้อครั้งเดียว)
                      รับเข้าได้ตามปกติ ต้นทุนเข้าต้นทุนเฉลี่ยเหมือนเดิม
                      <br /><br />
                      เลือกเมื่อเป็น<b>เจ้าประจำ</b>ที่อยากได้: ใบสั่งซื้อ (PO) · ยอดค้างจ่ายแบบเครดิต ·
                      รายงานรอบเดือนรายเจ้า · ของฝากขาย (ต้องเลือก ไม่งั้นระบบไม่รู้ว่าต้องจ่ายคืนใครเท่าไหร่)
                    </HelpHint>
                  )}
                </label>
                <EntitySearchInput
                  value={supplierId}
                  onChange={id => { setSupplierId(id); applySupplierDefaults(id, suppliers); }}
                  onClear={() => { setSupplierId(''); setDealType('cash'); setCreditDueDate(''); }}
                  options={suppliers.map(item => ({ id: item.id, label: item.name, subtitle: DEAL_OPTIONS.find(d => d.id === item.supplier_type)?.label }))}
                  placeholder={mode === 'receive' ? 'ค้นหา Supplier (เว้นว่างได้)...' : 'ค้นหา Supplier...'}
                  icon={<Factory className="w-4 h-4" />}
                  emptyMessage="ไม่พบ Supplier"
                />
              </div>
              {supplierId && mode === 'receive' && (
                <div className="flex-1">
                  <label className="field-label">ดีลของล็อตนี้</label>
                  <FormSelect
                    value={dealType}
                    onChange={value => {
                      const next = value as DealType;
                      setDealType(next);
                      if (next !== 'credit') setCreditDueDate('');
                    }}
                    options={DEAL_OPTIONS.map(d => ({ id: d.id, label: d.label }))}
                    searchThreshold={99}
                  />
                  <p className="helper-text mt-1">{DEAL_OPTIONS.find(d => d.id === dealType)?.hint}</p>
                </div>
              )}
              {supplierId && mode === 'receive' && dealType === 'credit' && (
                <div className="sm:w-48">
                  <label className="field-label">ครบกำหนดจ่าย</label>
                  <input
                    type="date"
                    value={creditDueDate}
                    onChange={e => setCreditDueDate(e.target.value)}
                    className="form-control-md w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* ดีลของล็อตที่มาจาก PO — แก้ได้ เพราะเจ้าเดียวกันส่งมาคนละแบบได้ */}
        {mode === 'receive' && features.supplier && receiveMode === 'po' && selectedPO && (
          <Card padding="md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="flex-1">
                <label className="field-label">ดีลของล็อตนี้</label>
                <FormSelect
                  value={dealType}
                  onChange={value => {
                    const next = value as DealType;
                    setDealType(next);
                    if (next !== 'credit') setCreditDueDate('');
                  }}
                  options={DEAL_OPTIONS.map(d => ({ id: d.id, label: d.label }))}
                  searchThreshold={99}
                />
                <p className="helper-text mt-1">{DEAL_OPTIONS.find(d => d.id === dealType)?.hint}</p>
              </div>
              {dealType === 'credit' && (
                <div className="sm:w-48">
                  <label className="field-label">ครบกำหนดจ่าย</label>
                  <input
                    type="date"
                    value={creditDueDate}
                    onChange={e => setCreditDueDate(e.target.value)}
                    className="form-control-md w-full rounded-lg border border-gray-300 bg-white px-3 text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {/* เลือกคลัง */}
        {!(mode === 'receive' && receiveMode === 'po') && (
          <Card padding="md">
            {mode === 'transfer' ? (
              <>
                <div className="flex flex-col sm:flex-row gap-4 sm:items-start">
                  <div className="flex-1">
                    <label className="field-label">คลังต้นทาง <span className="text-red-500">*</span></label>
                    <FormSelect
                      value={sourceWarehouseId}
                      onChange={setSourceWarehouseId}
                      options={warehouseOptions(warehouses.filter(wh => wh.id !== destWarehouseId))}
                      placeholder="-- เลือกคลังต้นทาง --"
                      searchPlaceholder="ค้นหาคลัง..."
                      icon={<Warehouse className="w-4 h-4" />}
                    />
                  </div>
                  <div className="flex items-center justify-center sm:mt-8 flex-shrink-0">
                    <ArrowRightLeft className="w-5 h-5 text-gray-400 dark:text-slate-500 rotate-90 sm:rotate-0" />
                  </div>
                  <div className="flex-1">
                    <label className="field-label">คลังปลายทาง <span className="text-red-500">*</span></label>
                    <FormSelect
                      value={destWarehouseId}
                      onChange={setDestWarehouseId}
                      options={warehouseOptions(warehouses.filter(wh => wh.id !== sourceWarehouseId))}
                      placeholder="-- เลือกคลังปลายทาง --"
                      searchPlaceholder="ค้นหาคลัง..."
                      icon={<Warehouse className="w-4 h-4" />}
                    />
                  </div>
                </div>
                {sameWarehouse && (
                  <Alert tone="warning" className="mt-3">คลังต้นทางและปลายทางต้องไม่เป็นคลังเดียวกัน</Alert>
                )}
              </>
            ) : (
              <>
                <label className="field-label">คลังสินค้า <span className="text-red-500">*</span></label>
                <div className="w-full sm:w-72">
                  <FormSelect
                    value={sourceWarehouseId}
                    onChange={setSourceWarehouseId}
                    options={warehouseOptions(warehouses)}
                    placeholder="-- เลือกคลังสินค้า --"
                    searchPlaceholder="ค้นหาคลัง..."
                    icon={<Warehouse className="w-4 h-4" />}
                  />
                </div>
              </>
            )}
          </Card>
        )}

        {/* รายการสินค้า */}
        {showItemsTable && (
          <ItemsTable
            items={tableItems}
            columns={columns}
            stockMap={stockMap}
            disableStockWarning={mode === 'receive'}
            disableOutOfStock={enforceStock}
            reasonOptions={mode === 'issue' ? REASON_OPTIONS : mode === 'supplier_return' ? RETURN_REASON_OPTIONS : undefined}
            products={productSearch.results}
            loadingProducts={productSearch.loading}
            onProductSearchChange={productSearch.search}
            onAdd={handleAdd}
            onUpdateField={handleUpdateField}
            onRemove={handleRemove}
            emptyMessage={sourceWarehouseId ? cfg.emptyMessage : 'เลือกคลังสินค้าก่อน'}
            showSummary={mode !== 'receive'}
          />
        )}

        {/* รายการที่ยังบันทึกไม่ได้ */}
        {lineErrors.size > 0 && (
          <Alert tone="danger" title="แก้ไขรายการต่อไปนี้ก่อนบันทึก">
            <ul className="space-y-1">
              {[...lineErrors.entries()].map(([idx, message]) => (
                <li key={lines[idx]?.variation_id ?? idx}>
                  {productDisplayName(tableItems[idx])} — {message}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        {/* เตือน (ไม่บล็อก) */}
        {overStockWarning && lineErrors.size === 0 && (
          <Alert tone="warning" icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}>
            บางรายการมีจำนวนโอนย้ายมากกว่าสต็อกที่มีในคลังต้นทาง
          </Alert>
        )}
        {hasPOMismatch && (
          <Alert tone="warning" icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}>
            จำนวนรับเข้าไม่ตรงกับ PO บางรายการ
          </Alert>
        )}

        {/* หมายเหตุรวม */}
        {lines.length > 0 && (
          <Card padding="md">
            <FormTextarea
              label="หมายเหตุรวม"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder={`หมายเหตุสำหรับ${cfg.title}ครั้งนี้ (ไม่บังคับ)...`}
            />
          </Card>
        )}

        <StickyActionBar
          saving={submitting}
          disabled={!canSubmit}
          onSave={() => void handleSubmit()}
          onCancel={() => router.push(cfg.listHref)}
          saveLabel={cfg.saveLabel}
        />
      </div>

      {confirmDialog}
    </Layout>
  );
}

function ConfirmRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between body-text">
      <span className="text-gray-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}
