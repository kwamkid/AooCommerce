'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import FormInput from '@/components/ui/FormInput';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import { LoadingCard, EmptyCard, DoneCard } from '@/components/ui/StateCard';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import BulkErrorModal, { type BulkErrorReport } from '@/components/bulk/BulkErrorModal';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import { downloadBlob } from '@/lib/utils/download';
import { formatNumber } from '@/lib/utils/format';
import {
  Check, AlertCircle, Pencil, ShieldAlert, Star, Tag, Package2,
  Warehouse as WarehouseIcon,
} from 'lucide-react';

interface Warehouse {
  id: string;
  name: string;
  code?: string | null;
  is_default?: boolean;
}

interface Brand {
  id: string;
  name: string;
}

interface ParsedItem {
  product_id?: string;
  variation_id?: string;
  warehouse_id: string;
  quantity: number;
  rowNum: number;
}

interface ResultRow {
  rowNum: number;
  warehouse_id: string;
  warehouse_name: string;
  product_name: string;
  variation_label: string;
  sku: string;
  action: 'updated' | 'unchanged' | 'error';
  from?: number;
  to?: number;
  error?: string;
}

interface RunResponse {
  dry_run: boolean;
  results: ResultRow[];
  summary: { total: number; updated: number; unchanged: number; errors: number };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** หน้าละ 50 แถว — พรีวิวเป็นข้อมูลที่โหลดมาแล้วทั้งก้อน แบ่งหน้าฝั่ง client */
const PREVIEW_PAGE_SIZE = 50;

/** ผลลัพธ์ต่อแถว — ใช้ทั้งพรีวิวและหน้าสรุปหลังบันทึก */
function ResultBadge({ action }: { action: ResultRow['action'] }) {
  if (action === 'updated') {
    return <Badge tone="blue" icon={<Pencil className="w-3.5 h-3.5" />}>แก้ไข</Badge>;
  }
  if (action === 'error') {
    return <Badge tone="red" icon={<AlertCircle className="w-3.5 h-3.5" />}>ผิดพลาด</Badge>;
  }
  return <Badge tone="gray">ไม่เปลี่ยน</Badge>;
}

/** ตารางผลลัพธ์ (dry-run และผลจริง) — DataTable + แบ่งหน้าในหน่วยความจำ */
function ResultTable({ rows, storageKey }: { rows: ResultRow[]; storageKey: string }) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PREVIEW_PAGE_SIZE);

  // ตารางนี้ถูก unmount ทุกครั้งที่เปลี่ยน step (อัพโหลดไฟล์ใหม่ = เริ่มหน้า 1 เอง)
  // และ safePage กันกรณีชุดข้อมูลสั้นลงกว่าหน้าที่ค้างอยู่
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * perPage;
  const pageRows = rows.slice(startIdx, startIdx + perPage);

  const columns: DataTableColumn<ResultRow>[] = [
    {
      key: 'action',
      label: 'ผลลัพธ์',
      alwaysVisible: true,
      defaultWidth: 130,
      render: (r) => <ResultBadge action={r.action} />,
    },
    {
      key: 'product',
      label: 'สินค้า',
      alwaysVisible: true,
      grow: true,
      defaultWidth: 320,
      render: (r) => (
        <div>
          <div className="body-text text-gray-900 dark:text-white">{r.product_name || '-'}</div>
          {r.variation_label && r.variation_label !== '-' && (
            <div className="subtitle-text text-gray-400 dark:text-slate-500">{r.variation_label}</div>
          )}
          {r.action === 'error' && r.error && (
            <div className="subtitle-text text-red-500 dark:text-red-400 mt-0.5">
              แถวที่ {r.rowNum}: {r.error}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'warehouse',
      label: 'คลัง',
      defaultWidth: 160,
      resizable: true,
      reorderable: true,
      render: (r) => <span className="body-text text-gray-600 dark:text-slate-400">{r.warehouse_name}</span>,
    },
    {
      key: 'sku',
      label: 'SKU',
      defaultWidth: 150,
      resizable: true,
      reorderable: true,
      render: (r) => <span className="body-text font-mono text-gray-500 dark:text-slate-400">{r.sku || '-'}</span>,
    },
    {
      key: 'from',
      label: 'จาก',
      align: 'right',
      defaultWidth: 100,
      render: (r) => (
        <span className="body-text tabular-nums text-gray-500 dark:text-slate-400">
          {r.from === undefined || r.from === null ? '-' : formatNumber(r.from)}
        </span>
      ),
    },
    {
      key: 'to',
      label: 'เป็น',
      align: 'right',
      defaultWidth: 100,
      render: (r) => (
        <span className="body-text tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
          {r.to === undefined || r.to === null ? '-' : formatNumber(r.to)}
        </span>
      ),
    },
  ];

  const mobileCardRender = (r: ResultRow) => (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="body-text font-medium text-gray-900 dark:text-white">{r.product_name || '-'}</div>
          {r.variation_label && r.variation_label !== '-' && (
            <div className="subtitle-text text-gray-400 dark:text-slate-500">{r.variation_label}</div>
          )}
        </div>
        <div className="flex-shrink-0"><ResultBadge action={r.action} /></div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="subtitle-text text-gray-500 dark:text-slate-400">{r.warehouse_name}</span>
        {r.sku && <span className="subtitle-text font-mono text-gray-400 dark:text-slate-500">{r.sku}</span>}
      </div>

      {r.action === 'error' ? (
        r.error && (
          <div className="subtitle-text text-red-500 dark:text-red-400">แถวที่ {r.rowNum}: {r.error}</div>
        )
      ) : (
        <div className="flex items-center gap-2">
          <span className="body-text tabular-nums text-gray-500 dark:text-slate-400">
            {r.from === undefined || r.from === null ? '-' : formatNumber(r.from)}
          </span>
          <span className="body-text text-gray-400">→</span>
          <span className="body-text tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
            {r.to === undefined || r.to === null ? '-' : formatNumber(r.to)}
          </span>
        </div>
      )}
    </div>
  );

  return (
    <DataTable<ResultRow>
      storageKey={storageKey}
      columns={columns}
      data={pageRows}
      getRowId={(r) => `${r.rowNum}:${r.warehouse_id}:${r.sku}`}
      mobileCardRender={mobileCardRender}
      currentPage={safePage}
      totalPages={totalPages}
      totalRecords={total}
      recordsPerPage={perPage}
      onPageChange={setPage}
      onRecordsPerPageChange={(limit) => { setPerPage(limit); setPage(1); }}
      onLimitChange={(limit, p) => { setPerPage(limit); setPage(p); }}
      emptyMessage="ไม่มีรายการ"
      emptyIcon={<Package2 className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
    />
  );
}

export default function BulkStockUpdatePage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [warehouseIds, setWarehouseIds] = useState<string[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [exporting, setExporting] = useState(false);

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorReport, setErrorReport] = useState<BulkErrorReport | null>(null);

  // Load warehouses + brands
  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const [whRes, brRes] = await Promise.all([
          apiFetch('/api/warehouses?active=true'),
          apiFetch('/api/brands'),
        ]);
        const whData = await whRes.json();
        const brData = await brRes.json();
        const whList: Warehouse[] = whData.warehouses || [];
        setWarehouses(whList);
        setBrands(brData.data || []);
        const def = whList.find(w => w.is_default) || whList[0];
        if (def) setWarehouseIds([def.id]);
      } catch (err) {
        console.error('load options error:', err);
      }
    })();
  }, [userProfile]);

  const warehouseOptions = useMemo(() => warehouses.map(w => ({
    id: w.id,
    label: w.name,
    subtitle: w.code || undefined,
    icon: w.is_default ? <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> : undefined,
  })), [warehouses]);

  const brandOptions = useMemo(() => brands.map(b => ({
    id: b.id,
    label: b.name,
  })), [brands]);

  const handleExport = async () => {
    if (warehouseIds.length === 0) {
      showToast('กรุณาเลือกคลังอย่างน้อย 1 คลัง', 'error');
      return;
    }
    setExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('warehouse_ids', warehouseIds.join(','));
      if (brandIds.length > 0) params.set('brand_ids', brandIds.join(','));

      const res = await apiFetch(`/api/inventory/bulk-stock-update/export?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Export ไม่สำเร็จ', 'error');
        return;
      }

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('bulk-stock', {
        properties: { defaultColWidth: 14 },
      });

      const exportWarehouses: Warehouse[] = data.warehouses || [];
      type Item = {
        product_id: string;
        variation_id: string;
        product_code: string;
        product_name: string;
        brand_name: string;
        variation_label: string;
        sku: string;
        barcode: string;
        stocks: Record<string, number>;
      };
      const items: Item[] = data.items || [];

      // Fixed info columns (cols 1..8)
      const infoHeaders = [
        'product_id (ห้ามแก้)',
        'variation_id (ห้ามแก้)',
        'รหัสสินค้า',
        'ชื่อสินค้า',
        'แบรนด์',
        'ตัวเลือก',
        'SKU',
        'Barcode',
      ];
      const infoColCount = infoHeaders.length;

      // === Row 1: hidden warehouse_id metadata ===
      // Cells in info range are empty; each warehouse pair (current, ใหม่) gets the wh_id in the FIRST cell
      const idRow: (string | null)[] = Array(infoColCount).fill(null);
      for (const wh of exportWarehouses) {
        idRow.push(wh.id); // current column carries the wh_id
        idRow.push(null);  // "ใหม่" column empty
      }
      const idRowRef = ws.addRow(idRow);
      idRowRef.height = 4; // very small — visible but unobtrusive
      idRowRef.eachCell({ includeEmpty: true }, cell => {
        cell.font = { color: { argb: 'FFD0D0D0' }, size: 6 };
        cell.alignment = { horizontal: 'left' };
      });

      // === Row 2: visible headers ===
      const visibleHeaders: string[] = [...infoHeaders];
      for (const wh of exportWarehouses) {
        const label = wh.code ? `${wh.name} (${wh.code})` : wh.name;
        visibleHeaders.push(`${label}\nStock ปัจจุบัน`);
        visibleHeaders.push(`${label}\nStock ใหม่ (กรอกที่นี่)`);
      }
      const headerRow = ws.addRow(visibleHeaders);
      headerRow.height = 36;
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
      // Highlight editable "Stock ใหม่" columns in header with a different shade
      for (let i = 0; i < exportWarehouses.length; i++) {
        const editableColIdx = infoColCount + i * 2 + 2; // 1-based
        const cell = headerRow.getCell(editableColIdx);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } };
      }

      const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F0F0' } };
      const grayFont = { color: { argb: 'FF999999' }, size: 9 };
      const readonlyFont = { color: { argb: 'FF666666' }, size: 10 };

      // === Data rows ===
      for (const it of items) {
        const rowVals: (string | number)[] = [
          it.product_id,
          it.variation_id,
          it.product_code,
          it.product_name,
          it.brand_name,
          it.variation_label,
          it.sku,
          it.barcode,
        ];
        for (const wh of exportWarehouses) {
          rowVals.push(it.stocks[wh.id] ?? 0); // current
          rowVals.push(''); // new (empty, editable)
        }
        const row = ws.addRow(rowVals);

        // Lock & gray ID columns (1, 2)
        for (const col of [1, 2]) {
          const cell = row.getCell(col);
          cell.fill = grayFill;
          cell.font = grayFont;
          cell.protection = { locked: true };
        }
        // Read-only info columns (3..8)
        for (let col = 3; col <= infoColCount; col++) {
          const cell = row.getCell(col);
          cell.font = readonlyFont;
          cell.protection = { locked: true };
        }
        // Per-warehouse cells: lock "current", unlock "ใหม่"
        for (let i = 0; i < exportWarehouses.length; i++) {
          const currentCol = infoColCount + i * 2 + 1; // 1-based
          const newCol = infoColCount + i * 2 + 2;
          const currentCell = row.getCell(currentCol);
          currentCell.font = readonlyFont;
          currentCell.fill = grayFill;
          currentCell.protection = { locked: true };
          currentCell.alignment = { horizontal: 'right' };

          const newCell = row.getCell(newCol);
          newCell.protection = { locked: false };
          newCell.alignment = { horizontal: 'right' };
        }
      }

      // Column widths
      const colWidths = [38, 38, 15, 34, 18, 18, 18, 18];
      for (const wh of exportWarehouses) {
        void wh;
        colWidths.push(15, 15);
      }
      ws.columns = colWidths.map(w => ({ width: w }));

      // Freeze rows 1 & 2 + cols A & B
      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

      // Protect the sheet (no password) — locked cells become read-only
      await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertRows: false,
        deleteRows: false,
        insertColumns: false,
        deleteColumns: false,
        sort: false,
        autoFilter: false,
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const date = new Date().toISOString().split('T')[0];
      const fname = exportWarehouses.length === 1
        ? `stock-${exportWarehouses[0].name}-${date}.xlsx`
        : `stock-${exportWarehouses.length}wh-${date}.xlsx`;
      downloadBlob(blob, fname);
    } catch (err) {
      console.error('export error:', err);
      showToast('Export ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: ['รองรับเฉพาะไฟล์ Excel (.xlsx)'],
      });
      return;
    }

    const rows: string[][] = [];
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      if (!ws) {
        setErrorReport({ headerIssues: [], rowIssues: [], otherIssues: ['ไฟล์ว่างเปล่า'] });
        return;
      }

      ws.eachRow({ includeEmpty: true }, row => {
        const vals = (row.values as (string | number | null)[]).slice(1).map(v => v === null || v === undefined ? '' : String(v));
        rows.push(vals);
      });
    } catch (err) {
      console.error('read file error:', err);
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: [`อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown'}`],
      });
      return;
    }

    if (rows.length < 3) {
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: ['ไฟล์ไม่ถูก format — ต้องมีอย่างน้อย 3 แถว (ID row + header + data)'],
      });
      return;
    }

    // Row 1 (index 0) = hidden warehouse_id metadata
    // Row 2 (index 1) = visible header
    // Row 3+ = data
    const idRow = rows[0];
    const dataRows = rows.slice(2);

    // Detect warehouse_id columns — UUIDs in row 1
    const colToWarehouse = new Map<number, string>(); // col index → warehouse_id
    for (let col = 0; col < idRow.length; col++) {
      const v = (idRow[col] || '').trim();
      if (UUID_RE.test(v)) {
        colToWarehouse.set(col, v);
      }
    }

    if (colToWarehouse.size === 0) {
      setErrorReport({
        headerIssues: ['ไม่พบ warehouse ID ในไฟล์ — โปรด export ใหม่จากระบบนี้'],
        rowIssues: [], otherIssues: [],
      });
      return;
    }

    // For each warehouse column, the "ใหม่" column is the NEXT column
    const items: ParsedItem[] = [];
    for (let r = 0; r < dataRows.length; r++) {
      const c = dataRows[r];
      const rowNum = r + 3; // 1-based row number in Excel
      const productId = (c[0] || '').trim();
      const variationId = (c[1] || '').trim();
      if (!variationId) continue;

      for (const [col, warehouseId] of colToWarehouse) {
        const newCol = col + 1; // "ใหม่" cell
        const raw = (c[newCol] || '').trim();
        if (raw === '') continue;
        const qty = Number(raw);
        if (!Number.isFinite(qty)) continue;
        items.push({
          product_id: productId || undefined,
          variation_id: variationId,
          warehouse_id: warehouseId,
          quantity: qty,
          rowNum,
        });
      }
    }

    if (items.length === 0) {
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: ['ไม่พบรายการที่กรอก Stock ใหม่ — ใส่ค่าในคอลัมน์ "Stock ใหม่" อย่างน้อย 1 ช่อง'],
      });
      return;
    }

    setParsedItems(items);
    setStep('checking');

    try {
      const res = await apiFetch('/api/inventory/bulk-stock-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, notes, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorReport({
          headerIssues: [], rowIssues: [],
          otherIssues: [data.error || 'ตรวจสอบไม่สำเร็จ'],
        });
        setStep('upload');
        return;
      }
      setDryRun(data);
      setStep('preview');
    } catch (err) {
      console.error('dry-run error:', err);
      setErrorReport({ headerIssues: [], rowIssues: [], otherIssues: ['ตรวจสอบไม่สำเร็จ'] });
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    setConfirmOpen(false);
    setStep('importing');
    try {
      const res = await apiFetch('/api/inventory/bulk-stock-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems, notes, dry_run: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
        setStep('preview');
        return;
      }
      setFinalRun(data);
      setStep('done');
      const parts: string[] = [];
      if (data.summary.updated > 0) parts.push(`อัพเดท ${data.summary.updated}`);
      if (data.summary.errors > 0) parts.push(`ล้มเหลว ${data.summary.errors}`);
      showToast(parts.join(', ') || 'เสร็จสิ้น', data.summary.errors > 0 ? 'error' : 'success');
    } catch (err) {
      console.error('import error:', err);
      showToast('บันทึกไม่สำเร็จ', 'error');
      setStep('preview');
    }
  };

  const resetAll = () => {
    setStep('upload');
    setParsedItems([]);
    setDryRun(null);
    setFinalRun(null);
  };

  const changedResults = useMemo(
    () => dryRun?.results.filter(r => r.action !== 'unchanged') || [],
    [dryRun],
  );
  const finalChanged = useMemo(
    () => finalRun?.results.filter(r => r.action !== 'unchanged') || [],
    [finalRun],
  );

  /** เปิดรายการข้อผิดพลาดทั้งหมดของ dry-run ในโมดัลเดียว */
  const showDryRunErrors = () => {
    if (!dryRun) return;
    setErrorReport({
      headerIssues: [],
      rowIssues: dryRun.results
        .filter(r => r.action === 'error')
        .map(r => `แถวที่ ${r.rowNum} · ${r.product_name || '-'} · ${r.warehouse_name}: ${r.error || 'ไม่ทราบสาเหตุ'}`),
      otherIssues: [],
    });
  };

  // Per-warehouse breakdown for preview
  const previewByWarehouse = useMemo(() => {
    if (!dryRun) return [];
    const map = new Map<string, { name: string; updated: number; unchanged: number; errors: number }>();
    for (const r of dryRun.results) {
      const key = r.warehouse_id;
      const cur = map.get(key) || { name: r.warehouse_name, updated: 0, unchanged: 0, errors: 0 };
      if (r.action === 'updated') cur.updated++;
      else if (r.action === 'unchanged') cur.unchanged++;
      else cur.errors++;
      map.set(key, cur);
    }
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [dryRun]);

  if (!userProfile) return null;

  return (
    <Layout>
      <Container size="5xl">
        <PageHeader
          backHref="/inventory"
          title="อัพเดท Stock แบบ Bulk"
          subtitle="Export Excel → กรอก Stock ใหม่ → อัพโหลดกลับ (รองรับหลายคลังในไฟล์เดียว)"
        />

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <Card className="space-y-5">
              {/* Warehouses multi-select */}
              <div>
                <label className="field-label mb-2">
                  เลือกคลัง <span className="text-red-500">*</span>
                  <span className="helper-text ml-2 inline">(เลือกได้หลายคลัง — แต่ละคลังจะเป็น 2 คอลัมน์ในไฟล์)</span>
                </label>
                <MultiSelectSearch
                  value={warehouseIds}
                  onChange={setWarehouseIds}
                  options={warehouseOptions}
                  placeholder="เลือกคลัง..."
                  searchPlaceholder="ค้นหาคลัง (ชื่อหรือรหัส)..."
                  icon={<WarehouseIcon className="w-4 h-4" />}
                />
              </div>

              {/* Brands multi-select */}
              <div>
                <label className="field-label mb-2">
                  กรองตามแบรนด์
                  <span className="helper-text ml-2 inline">
                    {brandIds.length === 0 ? '(ทุกแบรนด์)' : `(เลือก ${brandIds.length})`}
                  </span>
                </label>
                <MultiSelectSearch
                  value={brandIds}
                  onChange={setBrandIds}
                  options={brandOptions}
                  placeholder="ทุกแบรนด์ (กดเพื่อเลือกกรอง)"
                  emptyLabel="ทุกแบรนด์ (ไม่กรอง)"
                  searchPlaceholder="ค้นหาแบรนด์..."
                  icon={<Tag className="w-4 h-4" />}
                />
              </div>

              {/* Notes */}
              <FormInput
                label="หมายเหตุ"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="เช่น ตรวจนับประจำเดือน"
              />
            </Card>

            <BulkUploadCard
              title="Export → กรอก Stock ใหม่ → อัพโหลดกลับ"
              subtitle="Mode: Adjust — ระบบจะตั้ง Stock เป็นค่าที่กรอก (overwrite)"
              accept=".xlsx,.xls"
              onFile={handleFile}
              onDownloadTemplate={handleExport}
              downloadLabel={exporting ? 'กำลัง Export…' : 'Export สินค้า'}
              help={
                <>
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>กด Export → ได้ไฟล์ Excel ของสินค้าในคลังที่เลือก (1 คลัง = 2 คอลัมน์: ปัจจุบัน + ใหม่)</li>
                    <li>กรอก <strong>Stock ใหม่</strong> ในคอลัมน์สีเขียว — ปล่อยว่างถ้าไม่อัพเดท</li>
                    <li>อัพโหลดกลับ → ระบบจะแสดง preview ทุกรายการก่อนบันทึก</li>
                    <li>ระบบจะ <strong>ตั้ง Stock เป็นค่าที่กรอก</strong> (ไม่ใช่บวกเพิ่ม)</li>
                  </ul>
                  <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300">
                    <strong>คอลัมน์ ID ถูก lock ไว้</strong> — ห้าม unlock &amp; แก้ ถ้า ID ไม่ตรง แถวนั้นจะถูก skip
                  </div>
                </>
              }
            />
          </div>
        )}

        {/* Step: Checking */}
        {step === 'checking' && (
          <LoadingCard title="กำลังตรวจสอบข้อมูล..." subtitle={`${parsedItems.length} รายการ`} />
        )}

        {/* Step: Preview */}
        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            <BulkPreviewBar
              title="ตรวจสอบรายการก่อนบันทึก"
              icon={<ShieldAlert className="w-5 h-5 text-amber-500" />}
              badges={
                <>
                  <Badge tone="amber">Stock เป็นข้อมูลสำคัญ — โปรดตรวจสอบ</Badge>
                  {dryRun.summary.updated > 0 && (
                    <Badge tone="blue" icon={<Pencil className="w-3.5 h-3.5" />}>
                      แก้ไข {dryRun.summary.updated}
                    </Badge>
                  )}
                  {dryRun.summary.unchanged > 0 && (
                    <Badge tone="gray">ไม่เปลี่ยน {dryRun.summary.unchanged}</Badge>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<AlertCircle className="w-4 h-4" />}
                      onClick={showDryRunErrors}
                      className="text-red-600 dark:text-red-400"
                    >
                      ผิดพลาด {dryRun.summary.errors} — ดูทั้งหมด
                    </Button>
                  )}
                </>
              }
              confirmLabel="ยืนยันบันทึก"
              confirmDisabled={dryRun.summary.updated === 0}
              onConfirm={() => setConfirmOpen(true)}
              onCancel={resetAll}
            />

            {/* Per-warehouse breakdown */}
            {previewByWarehouse.length > 1 && (
              <Card padding="sm">
                <div className="flex flex-wrap items-center gap-2">
                  {previewByWarehouse.map(w => (
                    <Badge key={w.id} tone={w.errors > 0 ? 'red' : 'blue'} shape="square">
                      {w.name}: แก้ไข {w.updated}{w.errors > 0 ? ` · ผิดพลาด ${w.errors}` : ''}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            {changedResults.length > 0 ? (
              <ResultTable rows={changedResults} storageKey="bulk-stock-preview" />
            ) : (
              <EmptyCard
                title="ไม่มีการเปลี่ยนแปลง"
                subtitle="ข้อมูลในไฟล์ตรงกับระบบแล้ว"
                icon={<Check className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
              />
            )}
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && <LoadingCard title="กำลังบันทึก..." />}

        {/* Step: Done */}
        {step === 'done' && finalRun && (
          <div className="space-y-4">
            <DoneCard
              hasErrors={finalRun.summary.errors > 0}
              title="บันทึกเสร็จสิ้น"
              summary={
                <>
                  {finalRun.summary.updated > 0 && (
                    <span className="text-blue-600 font-medium">{finalRun.summary.updated} แก้ไข</span>
                  )}
                  {finalRun.summary.unchanged > 0 && (
                    <span className="text-gray-400">{finalRun.summary.unchanged} ไม่เปลี่ยน</span>
                  )}
                  {finalRun.summary.errors > 0 && (
                    <span className="text-red-600 font-medium">{finalRun.summary.errors} ล้มเหลว</span>
                  )}
                </>
              }
              actions={
                <>
                  <Button variant="primary" onClick={() => router.push('/inventory')}>ไปหน้า Stock</Button>
                  <Button variant="secondary" onClick={resetAll}>อัพโหลดเพิ่ม</Button>
                </>
              }
            />

            {finalChanged.length > 0 && (
              <div className="space-y-3">
                <h3 className="heading-3">รายละเอียด</h3>
                <ResultTable rows={finalChanged} storageKey="bulk-stock-result" />
              </div>
            )}
          </div>
        )}
      </Container>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmImport}
        icon={<ShieldAlert className="w-12 h-12 text-amber-500" />}
        title="ยืนยันการปรับ Stock"
        description={
          dryRun
            ? `ระบบจะปรับ Stock ${dryRun.summary.updated} รายการ ใน ${previewByWarehouse.length} คลัง — การกระทำนี้ไม่สามารถยกเลิกได้`
            : ''
        }
        confirmLabel="ยืนยันบันทึก"
        cancelLabel="ตรวจสอบอีกครั้ง"
        variant="primary"
      />

      <BulkErrorModal
        report={errorReport}
        onClose={() => setErrorReport(null)}
        onDownloadTemplate={handleExport}
      />
    </Layout>
  );
}
