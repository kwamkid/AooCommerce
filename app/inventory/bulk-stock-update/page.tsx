'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import FormSelect from '@/components/ui/FormSelect';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, Loader2, AlertCircle, Pencil, ArrowRight, PackagePlus, Edit3,
} from 'lucide-react';

type Mode = 'receive' | 'adjust';

interface Warehouse {
  id: string;
  name: string;
  code?: string | null;
  is_default?: boolean;
}

interface ParsedItem {
  product_id?: string;
  variation_id?: string;
  sku?: string;
  barcode?: string;
  name?: string;
  quantity: number;
  unit_cost: number;
  rowNum: number;
}

interface ResultRow {
  rowNum: number;
  product_name: string;
  variation_label: string;
  sku: string;
  action: 'updated' | 'unchanged' | 'error';
  from?: number;
  to?: number;
  unit_cost?: number;
  error?: string;
}

interface RunResponse {
  mode: Mode;
  dry_run: boolean;
  results: ResultRow[];
  summary: { total: number; updated: number; unchanged: number; errors: number };
  receive_number?: string;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(current.trim()); current = ''; }
      else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(current.trim());
        if (row.some(c => c)) rows.push(row);
        row = []; current = '';
        if (ch === '\r') i++;
      } else { current += ch; }
    }
  }
  row.push(current.trim());
  if (row.some(c => c)) rows.push(row);
  return rows;
}

export default function BulkStockUpdatePage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehouseId, setWarehouseId] = useState('');
  const [mode, setMode] = useState<Mode>('receive');
  const [notes, setNotes] = useState('');
  const [exporting, setExporting] = useState(false);

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);

  // Load warehouses
  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const res = await apiFetch('/api/warehouses?active=true');
        const data = await res.json();
        const list: Warehouse[] = data.warehouses || [];
        setWarehouses(list);
        const def = list.find(w => w.is_default) || list[0];
        if (def) setWarehouseId(def.id);
      } catch (err) {
        console.error('load warehouses error:', err);
      }
    })();
  }, [userProfile]);

  const warehouseName = useMemo(() => warehouses.find(w => w.id === warehouseId)?.name || '', [warehouses, warehouseId]);

  const handleExport = async () => {
    if (!warehouseId) {
      showToast('กรุณาเลือกคลังสินค้าก่อน', 'error');
      return;
    }
    setExporting(true);
    try {
      const res = await apiFetch(`/api/inventory/bulk-stock-update/export?warehouse_id=${warehouseId}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Export ไม่สำเร็จ', 'error');
        return;
      }

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('bulk-stock');

      const headers = [
        'product_id (ห้ามแก้)',
        'variation_id (ห้ามแก้)',
        'รหัสสินค้า',
        'ชื่อสินค้า',
        'ตัวเลือก',
        'SKU',
        'Barcode',
        'Stock ปัจจุบัน',
        mode === 'receive' ? 'จำนวนรับเข้า' : 'Stock ใหม่',
        'ต้นทุน/หน่วย (WAC)',
      ];
      const headerRow = ws.addRow(headers);
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } };
        cell.alignment = { horizontal: 'center' };
      });

      const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F0F0' } };
      const grayFont = { color: { argb: 'FF999999' }, size: 9 };

      type Item = {
        product_id: string; variation_id: string;
        product_code: string; product_name: string; variation_label: string;
        sku: string; barcode: string; current_quantity: number;
      };
      const items: Item[] = data.items || [];

      for (const it of items) {
        const row = ws.addRow([
          it.product_id,
          it.variation_id,
          it.product_code,
          it.product_name,
          it.variation_label,
          it.sku,
          it.barcode,
          it.current_quantity,
          '',
          '',
        ]);
        // Gray + lock ID columns
        for (const col of [1, 2]) {
          const cell = row.getCell(col);
          cell.fill = grayFill;
          cell.font = grayFont;
        }
        // Gray for read-only columns (code, name, variation, sku, barcode, current stock)
        for (const col of [3, 4, 5, 6, 7, 8]) {
          row.getCell(col).font = { color: { argb: 'FF666666' }, size: 10 };
        }
      }

      // Column widths
      ws.columns = [
        { width: 38 }, { width: 38 }, { width: 15 }, { width: 34 }, { width: 18 },
        { width: 18 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 },
      ];
      ws.views = [{ state: 'frozen', ySplit: 1 }];

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      link.download = `stock-${warehouseName || 'warehouse'}-${date}.xlsx`;
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
    if (!warehouseId) {
      showToast('กรุณาเลือกคลังสินค้าก่อน', 'error');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }

    let rows: string[][];
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      rows = [];
      ws.eachRow(row => {
        const vals = (row.values as (string | number | null)[]).slice(1).map(v => String(v ?? ''));
        if (vals.some(v => v)) rows.push(vals);
      });
    } else {
      rows = parseCSV(await file.text());
    }

    if (rows.length < 2) {
      showToast('ไฟล์ไม่มีข้อมูล (ต้องมี header + อย่างน้อย 1 แถว)', 'error');
      return;
    }

    const header = rows[0];
    if (header.length < 9) {
      showToast(`ไฟล์ผิด format — ต้องมีอย่างน้อย 9 คอลัมน์ แต่พบ ${header.length}`, 'error');
      return;
    }

    const items: ParsedItem[] = [];
    const dataRows = rows.slice(1);
    for (let i = 0; i < dataRows.length; i++) {
      const c = dataRows[i];
      const qtyRaw = c[8];
      if (qtyRaw === undefined || qtyRaw === '' || qtyRaw === null) continue;
      const qty = Number(qtyRaw);
      if (!Number.isFinite(qty)) continue;

      const item: ParsedItem = {
        product_id: c[0]?.trim() || undefined,
        variation_id: c[1]?.trim() || undefined,
        name: c[3]?.trim() || undefined,
        sku: c[5]?.trim() || undefined,
        barcode: c[6]?.trim() || undefined,
        quantity: qty,
        unit_cost: Number(c[9] || '0') || 0,
        rowNum: i + 2,
      };
      items.push(item);
    }

    if (items.length === 0) {
      showToast('ไม่พบรายการที่อัพเดท (ใส่จำนวนในคอลัมน์ที่ 9)', 'error');
      return;
    }

    setParsedItems(items);
    setStep('checking');

    try {
      const res = await apiFetch('/api/inventory/bulk-stock-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, warehouse_id: warehouseId, items, notes, dry_run: true }),
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

  const handleImport = async () => {
    setStep('importing');
    try {
      const res = await apiFetch('/api/inventory/bulk-stock-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, warehouse_id: warehouseId, items: parsedItems, notes, dry_run: false }),
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
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">อัพโหลด Excel เพื่ออัพเดทจำนวน stock หลายรายการในคราวเดียว</p>
          </div>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-4">
            {/* Setup card */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 space-y-5">
              {/* Mode selector */}
              <div>
                <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-2">โหมดการอัพเดท</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setMode('receive')}
                    className={`flex items-start gap-3 p-4 border-2 rounded-lg text-left transition ${mode === 'receive'
                      ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/10'
                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}
                  >
                    <PackagePlus className={`w-6 h-6 shrink-0 ${mode === 'receive' ? 'text-[#F4511E]' : 'text-gray-400'}`} />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">รับของเข้าคลัง (Receive)</div>
                      <div className="text-sm text-gray-500 mt-0.5">บวกจำนวนเข้า stock + คำนวณ WAC ใหม่ (กระทบต้นทุน)</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('adjust')}
                    className={`flex items-start gap-3 p-4 border-2 rounded-lg text-left transition ${mode === 'adjust'
                      ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/10'
                      : 'border-gray-200 dark:border-slate-700 hover:border-gray-300'}`}
                  >
                    <Edit3 className={`w-6 h-6 shrink-0 ${mode === 'adjust' ? 'text-[#F4511E]' : 'text-gray-400'}`} />
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">ปรับยอด Stock (Adjust)</div>
                      <div className="text-sm text-gray-500 mt-0.5">ตั้งค่า stock ใหม่เลย (nuke & set) ไม่กระทบต้นทุน</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Warehouse + Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-1.5">คลังสินค้า *</label>
                  <FormSelect
                    value={warehouseId}
                    onChange={v => setWarehouseId(v)}
                    options={warehouses.map(w => ({ id: w.id, label: w.name }))}
                    placeholder="เลือกคลัง"
                  />
                </div>
                <div>
                  <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-1.5">หมายเหตุ</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder={mode === 'receive' ? 'เช่น สต็อกต้นเดือน' : 'เช่น ตรวจนับประจำเดือน'}
                    className="w-full px-3 py-2 border border-gray-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Upload area */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8">
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Export → แก้ไข → อัพโหลดกลับ</h2>
                  <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
                    Export สินค้าในคลัง → กรอกจำนวน {mode === 'receive' ? 'รับเข้า' : 'stock ใหม่'}{mode === 'receive' ? ' และต้นทุน' : ''} → อัพโหลดกลับ
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={handleExport}
                    disabled={exporting || !warehouseId}
                    className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50"
                  >
                    {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Export สินค้าในคลัง
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={!warehouseId}
                    className="flex items-center gap-2 px-6 py-2.5 bg-[#F4511E] hover:bg-[#E64A19] text-white rounded-lg font-semibold disabled:opacity-50"
                  >
                    <Upload className="w-4 h-4" /> อัพโหลดไฟล์
                  </button>
                  <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
                </div>
                <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>กด Export จะได้ไฟล์ Excel ของสินค้าทั้งหมดในคลัง + stock ปัจจุบัน</li>
                    {mode === 'receive' ? (
                      <>
                        <li>กรอก <strong>จำนวนรับเข้า</strong> (คอลัมน์ที่ 9) — ปล่อยว่างถ้าไม่รับ</li>
                        <li>กรอก <strong>ต้นทุน/หน่วย</strong> (คอลัมน์ที่ 10) — ถ้ากรอกจะคำนวณ WAC ใหม่</li>
                      </>
                    ) : (
                      <li>กรอก <strong>Stock ใหม่</strong> (คอลัมน์ที่ 9) — ระบบจะตั้งเป็นจำนวนนี้เลย</li>
                    )}
                    <li>อัพโหลดกลับ → ระบบจะแสดง preview ก่อนบันทึกจริง</li>
                  </ul>
                  <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300">
                    <strong>หน้านี้ไม่สร้างสินค้าใหม่</strong> — ถ้ามีแถวที่ไม่พบ product_id/variation_id ในระบบ จะถูกข้ามและแจ้ง error<br/>
                    <strong>product_id / variation_id</strong> = ID ของระบบ — <strong>ห้ามแก้ไข!</strong>
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
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="px-2.5 py-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-lg font-medium">
                    {mode === 'receive' ? 'รับเข้า' : 'ปรับยอด'} · {warehouseName}
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
                    onClick={handleImport}
                    disabled={dryRun.summary.updated === 0}
                    className="px-4 py-2 text-sm bg-[#F4511E] hover:bg-[#E64A19] text-white rounded-lg font-semibold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    บันทึก <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {changedResults.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="data-thead">
                    <tr>
                      <th className="data-th w-20">Action</th>
                      <th className="data-th">สินค้า</th>
                      <th className="data-th">SKU</th>
                      <th className="data-th text-right">จาก</th>
                      <th className="data-th text-right">เป็น</th>
                      {mode === 'receive' && <th className="data-th text-right">ต้นทุน</th>}
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
                            <div className="text-xs text-red-500 mt-0.5">{r.error}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500">{r.sku || '-'}</td>
                        <td className="px-5 py-3 text-right text-gray-500 dark:text-slate-400">{r.from ?? '-'}</td>
                        <td className="px-5 py-3 text-right font-medium text-emerald-600">{r.to ?? '-'}</td>
                        {mode === 'receive' && (
                          <td className="px-5 py-3 text-right text-gray-600">
                            {r.unit_cost ? `฿${r.unit_cost.toLocaleString()}` : '-'}
                          </td>
                        )}
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
              {finalRun.receive_number && (
                <p className="text-sm text-gray-500 dark:text-slate-400">
                  ใบรับเข้า: <span className="font-mono font-medium">{finalRun.receive_number}</span>
                </p>
              )}
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
    </Layout>
  );
}
