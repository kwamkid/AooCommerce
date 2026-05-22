'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, Loader2, AlertCircle, Pencil, ArrowRight, ShieldAlert, Star,
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

export default function BulkStockUpdatePage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

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

  const selectedWarehouses = useMemo(
    () => warehouseIds.map(id => warehouses.find(w => w.id === id)).filter((w): w is Warehouse => !!w),
    [warehouseIds, warehouses]
  );

  const toggleWarehouse = (id: string) => {
    setWarehouseIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleBrand = (id: string) => {
    setBrandIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

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
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      const fname = exportWarehouses.length === 1
        ? `stock-${exportWarehouses[0].name}-${date}.xlsx`
        : `stock-${exportWarehouses.length}wh-${date}.xlsx`;
      link.download = fname;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      console.error('export error:', err);
      showToast('Export ไม่สำเร็จ', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      showToast('รองรับเฉพาะไฟล์ Excel (.xlsx)', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) {
      showToast('ไฟล์ว่างเปล่า', 'error');
      return;
    }

    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: true }, row => {
      const vals = (row.values as (string | number | null)[]).slice(1).map(v => v === null || v === undefined ? '' : String(v));
      rows.push(vals);
    });

    if (rows.length < 3) {
      showToast('ไฟล์ไม่ถูก format — ต้องมีอย่างน้อย 3 แถว (ID row + header + data)', 'error');
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
      showToast('ไม่พบ warehouse ID ในไฟล์ — โปรด export ใหม่จากระบบนี้', 'error');
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
      showToast('ไม่พบรายการที่กรอก Stock ใหม่ — ใส่ค่าในคอลัมน์ "Stock ใหม่" อย่างน้อย 1 ช่อง', 'error');
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
        showToast(data.error || 'ตรวจสอบไม่สำเร็จ', 'error');
        setStep('upload');
        return;
      }
      setDryRun(data);
      setStep('preview');
    } catch (err) {
      console.error('dry-run error:', err);
      showToast('ตรวจสอบไม่สำเร็จ', 'error');
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
    if (fileRef.current) fileRef.current.value = '';
  };

  const changedResults = dryRun?.results.filter(r => r.action !== 'unchanged') || [];
  const finalChanged = finalRun?.results.filter(r => r.action !== 'unchanged') || [];

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
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/inventory')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">อัพเดท Stock แบบ Bulk</h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">Export Excel → กรอก Stock ใหม่ → อัพโหลดกลับ (รองรับหลายคลังในไฟล์เดียว)</p>
          </div>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 space-y-5">
              {/* Warehouses multi-select */}
              <div>
                <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-2">
                  เลือกคลัง <span className="text-red-500">*</span>
                  <span className="ml-2 text-sm text-gray-400">(เลือกได้หลายคลัง — แต่ละคลังจะเป็น 2 คอลัมน์)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {warehouses.map(w => {
                    const selected = warehouseIds.includes(w.id);
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => toggleWarehouse(w.id)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition flex items-center gap-1.5 ${
                          selected
                            ? 'bg-orange-50 border-[#F4511E] text-[#F4511E] dark:bg-orange-900/20'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {w.is_default && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                        {w.name}
                        {w.code && <span className="text-xs text-gray-400">({w.code})</span>}
                        {selected && <Check className="w-3.5 h-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Brands multi-select */}
              <div>
                <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-2">
                  กรองตามแบรนด์
                  <span className="ml-2 text-sm text-gray-400">({brandIds.length === 0 ? 'ทุกแบรนด์' : `เลือก ${brandIds.length}`})</span>
                </label>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {brands.map(b => {
                    const selected = brandIds.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => toggleBrand(b.id)}
                        className={`px-2.5 py-1.5 rounded-lg border text-sm transition ${
                          selected
                            ? 'bg-blue-50 border-blue-400 text-blue-700 dark:bg-blue-900/20'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 dark:bg-slate-700/50 dark:border-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                  {brands.length === 0 && (
                    <span className="text-sm text-gray-400">ยังไม่มีแบรนด์ในระบบ</span>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-1.5">หมายเหตุ</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="เช่น ตรวจนับประจำเดือน"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                />
              </div>
            </div>

            {/* Upload area */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8">
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Export → กรอก Stock ใหม่ → อัพโหลดกลับ</h2>
                  <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
                    Mode: <strong>Adjust</strong> — ระบบจะตั้ง Stock เป็นค่าที่กรอก (overwrite)
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={handleExport}
                    disabled={exporting || warehouseIds.length === 0}
                    className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
                  >
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export สินค้า
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#F4511E] hover:bg-[#E64A19] text-white rounded-lg font-semibold"
                  >
                    <Upload className="w-4 h-4" /> อัพโหลดไฟล์
                  </button>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
                </div>
                <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>กด Export → ได้ไฟล์ Excel ของสินค้าในคลังที่เลือก (1 คลัง = 2 คอลัมน์: ปัจจุบัน + ใหม่)</li>
                    <li>กรอก <strong>Stock ใหม่</strong> ในคอลัมน์สีเขียว — ปล่อยว่างถ้าไม่อัพเดท</li>
                    <li>อัพโหลดกลับ → ระบบจะแสดง preview ทุกรายการก่อนบันทึก</li>
                    <li>ระบบจะ <strong>ตั้ง Stock เป็นค่าที่กรอก</strong> (ไม่ใช่บวกเพิ่ม)</li>
                  </ul>
                  <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300">
                    <strong>คอลัมน์ ID ถูก lock ไว้</strong> — ห้าม unlock & แก้ ถ้า ID ไม่ตรง แถวนั้นจะถูก skip
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Checking */}
        {step === 'checking' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-[#F4511E] animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังตรวจสอบข้อมูล...</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{parsedItems.length} รายการ</p>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg font-medium border border-amber-200 dark:border-amber-800">
                    <ShieldAlert className="w-3.5 h-3.5" /> โปรดตรวจสอบ — Stock เป็นข้อมูลสำคัญ
                  </span>
                  {dryRun.summary.updated > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-medium">
                      <Pencil className="w-3.5 h-3.5" /> อัพเดท {dryRun.summary.updated}
                    </span>
                  )}
                  {dryRun.summary.unchanged > 0 && (
                    <span className="text-gray-400 dark:text-slate-500">ไม่เปลี่ยน {dryRun.summary.unchanged}</span>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRun.summary.errors}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={resetAll} className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg">
                    เลือกไฟล์ใหม่
                  </button>
                  <button
                    onClick={() => setConfirmOpen(true)}
                    disabled={dryRun.summary.updated === 0}
                    className="px-4 py-2 text-sm bg-[#F4511E] hover:bg-[#E64A19] text-white rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    ยืนยันบันทึก <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Per-warehouse breakdown */}
              {previewByWarehouse.length > 1 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 flex flex-wrap gap-2">
                  {previewByWarehouse.map(w => (
                    <span key={w.id} className="text-sm px-2.5 py-1 bg-gray-50 dark:bg-slate-700/50 rounded-lg border border-gray-200 dark:border-slate-600">
                      <strong>{w.name}</strong>:{' '}
                      <span className="text-blue-600">{w.updated} อัพเดท</span>
                      {w.errors > 0 && <span className="text-red-600 ml-1">· {w.errors} error</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {changedResults.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="data-thead">
                    <tr>
                      <th className="data-th w-20">Action</th>
                      <th className="data-th">สินค้า</th>
                      <th className="data-th">คลัง</th>
                      <th className="data-th">SKU</th>
                      <th className="data-th text-right">จาก</th>
                      <th className="data-th text-right">เป็น</th>
                    </tr>
                  </thead>
                  <tbody className="data-tbody">
                    {changedResults.map((r, i) => (
                      <tr key={i} className="data-tr">
                        <td className="px-5 py-3">
                          {r.action === 'updated' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                              <Pencil className="w-3 h-3" /> อัพเดท
                            </span>
                          )}
                          {r.action === 'error' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" /> Error
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="text-gray-900 dark:text-white">{r.product_name}</div>
                          {r.variation_label && r.variation_label !== '-' && (
                            <div className="text-xs text-gray-400 dark:text-slate-500">{r.variation_label}</div>
                          )}
                          {r.action === 'error' && r.error && (
                            <div className="text-xs text-red-500 mt-0.5">แถวที่ {r.rowNum}: {r.error}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 text-gray-600 dark:text-slate-400">{r.warehouse_name}</td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{r.sku || '-'}</td>
                        <td className="px-5 py-3 text-right text-gray-500 dark:text-slate-400">{r.from ?? '-'}</td>
                        <td className="px-5 py-3 text-right font-medium text-emerald-600">{r.to ?? '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center">
                <Check className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-slate-400">ไม่มีการเปลี่ยนแปลง — ข้อมูลในไฟล์ตรงกับระบบแล้ว</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-[#F4511E] animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังบันทึก...</h2>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && finalRun && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${finalRun.summary.errors === 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                {finalRun.summary.errors === 0
                  ? <Check className="w-8 h-8 text-emerald-600" />
                  : <AlertCircle className="w-8 h-8 text-amber-600" />}
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">บันทึกเสร็จสิ้น</h2>
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                {finalRun.summary.updated > 0 && <span className="text-blue-600 font-medium">{finalRun.summary.updated} อัพเดท</span>}
                {finalRun.summary.unchanged > 0 && <span className="text-gray-400">{finalRun.summary.unchanged} ไม่เปลี่ยน</span>}
                {finalRun.summary.errors > 0 && <span className="text-red-600 font-medium">{finalRun.summary.errors} ล้มเหลว</span>}
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button onClick={() => router.push('/inventory')} className="px-4 py-2 bg-[#F4511E] hover:bg-[#E64A19] text-white rounded-lg font-semibold">
                  ไปหน้า Stock
                </button>
                <button onClick={resetAll} className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg">
                  อัพโหลดเพิ่ม
                </button>
              </div>
            </div>

            {finalChanged.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                  <h3 className="font-medium text-gray-900 dark:text-white">รายละเอียด</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {finalChanged.map((r, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {r.action === 'updated' && <Pencil className="w-3.5 h-3.5 text-blue-500" />}
                        {r.action === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                        <span className="text-gray-900 dark:text-white">{r.product_name}</span>
                        {r.variation_label && r.variation_label !== '-' && (
                          <span className="text-xs text-gray-400">({r.variation_label})</span>
                        )}
                        <span className="text-xs text-gray-400">— {r.warehouse_name}</span>
                      </div>
                      {r.action === 'error' ? (
                        <span className="text-red-500 text-xs">{r.error}</span>
                      ) : (
                        <span className="text-blue-600 text-xs font-medium">{r.from} → {r.to}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
    </Layout>
  );
}
