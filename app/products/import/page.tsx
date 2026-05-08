'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, Loader2, AlertCircle, Plus, Pencil, ArrowRight,
} from 'lucide-react';

interface ParsedRow {
  product_id: string;
  variation_id: string;
  code: string;
  name: string;
  variation_label: string;
  sku: string;
  barcode: string;
  default_price: number;
  discount_price: number;
  cost_price?: number;
  rowNum: number;
  error?: string;
}

interface DryRunResult {
  code: string;
  name: string;
  action: 'created' | 'updated' | 'unchanged' | 'error';
  variation_label?: string;
  changes?: { field: string; from?: unknown; to?: unknown }[];
  error?: string;
}

interface DryRunResponse {
  results: DryRunResult[];
  summary: { total: number; created: number; updated: number; unchanged: number; errors: number };
  dry_run: boolean;
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

const FIELD_LABELS: Record<string, string> = {
  name: 'ชื่อสินค้า',
  variation_label: 'ตัวเลือก',
  sku: 'SKU',
  barcode: 'Barcode',
  default_price: 'ราคาปกติ',
  discount_price: 'ราคาขาย',
  cost_price: 'ราคาทุน',
  new_product: 'สินค้าใหม่',
};

function downloadTemplate(includeCost: boolean) {
  const baseHeaders = ['product_id (ห้ามแก้)', 'variation_id (ห้ามแก้)', 'รหัสสินค้า', 'ชื่อสินค้า', 'ตัวเลือก', 'SKU', 'Barcode', 'ราคาปกติ', 'ราคาขาย'];
  const headers = includeCost ? [...baseHeaders, 'ราคาทุน'] : baseHeaders;
  const tail = (price: string, discount: string, cost: string) =>
    includeCost ? `${price},${discount},${cost}` : `${price},${discount}`;
  const rows = [
    headers.join(','),
    `,,P001,เสื้อยืดสีขาว,ขาว S,SKU-001,8850001,${tail('350', '299', '180')}`,
    `,,P001,เสื้อยืดสีขาว,ขาว M,SKU-002,8850002,${tail('350', '299', '180')}`,
    `,,P002,กางเกงยีนส์,-,SKU-004,8850004,${tail('890', '790', '450')}`,
  ];
  const csv = '\ufeff' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'product-import-template.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function ImportProductsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { showToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const canEditCost = userProfile?.canViewCost === true;

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<Record<string, unknown>[]>([]);
  const [parseErrors, setParseErrors] = useState<ParsedRow[]>([]);
  const [dryRunData, setDryRunData] = useState<DryRunResponse | null>(null);
  const [importData, setImportData] = useState<DryRunResponse | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let rows: string[][];
    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const buffer = await file.arrayBuffer();
      await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      rows = [];
      ws.eachRow((row) => {
        const vals = (row.values as (string | number | null)[]).slice(1).map(v => String(v ?? ''));
        if (vals.some(v => v)) rows.push(vals);
      });
    } else {
      const text = await file.text();
      rows = parseCSV(text);
    }

    if (rows.length < 2) {
      showToast('ไฟล์ไม่มีข้อมูล (ต้องมีอย่างน้อย header + 1 แถว)', 'error');
      return;
    }

    const header = rows[0];
    if (header.length < 9) {
      showToast(`ไฟล์ผิด format — ต้องมีอย่างน้อย 9 columns แต่พบแค่ ${header.length} columns\n\nใช้ Template หรือไฟล์ที่ Export จากระบบ`, 'error');
      return;
    }

    const col3 = (header[2] || '').toLowerCase();
    const col4 = (header[3] || '').toLowerCase();
    const looksLikeOurFormat = col3.includes('รหัส') || col3.includes('product') || col3.includes('code') || col4.includes('ชื่อ') || col4.includes('name');
    const looksLikeOldCsvFormat = (header[0] || '').toLowerCase().includes('รหัส');

    if (looksLikeOldCsvFormat && !col3.includes('รหัส')) {
      showToast('ไฟล์นี้เป็น CSV format เก่า (ไม่มี product_id, variation_id)\n\nกรุณา Export ใหม่จากระบบ หรือดาวน์โหลด Template', 'error');
      return;
    }

    if (!looksLikeOurFormat && !header[0]?.includes('product')) {
      showToast('ไฟล์ผิด format — ไม่ตรงกับ Template\n\nColumn ต้องเป็น: product_id, variation_id, รหัสสินค้า, ชื่อสินค้า, ตัวเลือก, SKU, Barcode, ราคาปกติ, ราคาขาย', 'error');
      return;
    }

    // Find cost_price column index by header (flexible — works whether column exists or not)
    const costColIdx = header.findIndex(h => {
      const v = (h || '').toLowerCase().trim();
      return v.includes('ราคาทุน') || v === 'cost_price' || v === 'cost';
    });

    // Parse rows
    const dataRows = rows.slice(1);
    const errors: ParsedRow[] = [];
    const items: Record<string, unknown>[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const cols = dataRows[i];
      const code = cols[2] || '';
      const name = cols[3] || '';

      // Skip parent rows from export (have product_id but no variation_id, no price)
      const hasProductId = !!(cols[0] && cols[0].length > 10);
      const hasVariationId = !!(cols[1] && cols[1].length > 10);
      const hasPrice = !!(cols[7] && parseFloat(cols[7]) > 0);
      if (hasProductId && !hasVariationId && !hasPrice) continue;

      if (!code && !name && !hasProductId) continue; // empty row

      if (!code) {
        errors.push({ product_id: '', variation_id: '', code: '', name, variation_label: '', sku: '', barcode: '', default_price: 0, discount_price: 0, rowNum: i + 2, error: 'ไม่มีรหัสสินค้า' });
        continue;
      }

      const item: Record<string, unknown> = {
        product_id: cols[0] || undefined,
        variation_id: cols[1] || undefined,
        code,
        name: name || code,
        variation_label: cols[4] || '-',
        sku: cols[5] || '',
        barcode: cols[6] || '',
        default_price: parseFloat(cols[7] || '0') || 0,
        discount_price: parseFloat(cols[8] || '0') || 0,
      };

      // Only include cost_price if user has permission AND column is present
      if (canEditCost && costColIdx >= 0) {
        const costStr = cols[costColIdx];
        if (costStr !== undefined && costStr !== '') {
          item.cost_price = parseFloat(costStr) || 0;
        }
      }

      items.push(item);
    }

    setParsedItems(items);
    setParseErrors(errors);

    if (items.length === 0) {
      showToast('ไม่พบข้อมูลที่ import ได้', 'error');
      return;
    }

    // Dry-run
    setStep('checking');
    setProgress(30);
    try {
      const res = await apiFetch('/api/products/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, dry_run: true }),
      });
      setProgress(100);
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'ตรวจสอบไม่สำเร็จ', 'error');
        setStep('upload');
        return;
      }
      const data: DryRunResponse = await res.json();
      setDryRunData(data);
      setStep('preview');
    } catch (err) {
      console.error('Dry-run error:', err);
      showToast('ตรวจสอบไม่สำเร็จ', 'error');
      setStep('upload');
    }
  };

  const handleImport = async () => {
    setStep('importing');
    setProgress(30);
    try {
      const res = await apiFetch('/api/products/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems, dry_run: false }),
      });
      setProgress(100);
      const data: DryRunResponse = await res.json();
      setImportData(data);
      setStep('done');

      const parts: string[] = [];
      if (data.summary.created > 0) parts.push(`สร้างใหม่ ${data.summary.created}`);
      if (data.summary.updated > 0) parts.push(`อัพเดท ${data.summary.updated}`);
      if (data.summary.errors > 0) parts.push(`ล้มเหลว ${data.summary.errors}`);
      showToast(parts.join(', ') || 'เสร็จสิ้น');
    } catch (err) {
      console.error('Import error:', err);
      showToast('นำเข้าไม่สำเร็จ', 'error');
      setStep('preview');
    }
  };

  const resetAll = () => {
    setStep('upload');
    setParsedItems([]);
    setParseErrors([]);
    setDryRunData(null);
    setImportData(null);
    setProgress(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Filter results for preview — show only changes, errors, creates
  const changedResults = dryRunData?.results.filter(r => r.action !== 'unchanged') || [];
  const unchangedCount = dryRunData?.summary.unchanged || 0;

  const finalResults = importData?.results || [];
  const finalChanged = finalResults.filter(r => r.action !== 'unchanged');

  if (!userProfile) return null;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/products')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">นำเข้าสินค้า</h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">อัพโหลดไฟล์ Excel หรือ CSV เพื่อสร้างหรืออัพเดทสินค้า</p>
          </div>
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8">
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto">
                <FileSpreadsheet className="w-8 h-8 text-gray-400 dark:text-slate-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">อัพโหลดไฟล์ Excel หรือ CSV</h2>
                <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
                  Export จากหน้าสินค้า (.xlsx) แก้ไขแล้ว Import กลับ หรือดาวน์โหลด Template สำหรับสร้างใหม่
                </p>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button onClick={() => downloadTemplate(canEditCost)} className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  <Download className="w-4 h-4" /> ดาวน์โหลด Template
                </button>
                <button onClick={() => fileRef.current?.click()} className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold transition-colors">
                  <Upload className="w-4 h-4" /> เลือกไฟล์
                </button>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
              </div>
              <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
                <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>สร้างใหม่</strong> — ปล่อย product_id, variation_id ว่าง</li>
                  <li><strong>อัพเดท</strong> — ใส่ product_id + variation_id (ได้จาก Export)</li>
                  <li><strong>ถ้ามีราคาเปลี่ยน</strong> — ระบบจะ sync ไป Shopee/TikTok อัตโนมัติ</li>
                </ul>
                <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300">
                  <strong>product_id</strong> และ <strong>variation_id</strong> คือ ID ของระบบ — <strong>ห้ามแก้ไข!</strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step: Checking (dry-run loading) */}
        {step === 'checking' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังตรวจสอบข้อมูล...</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{parsedItems.length} รายการ</p>
          </div>
        )}

        {/* Step: Preview (dry-run results — only changes) */}
        {step === 'preview' && dryRunData && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  {dryRunData.summary.created > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <Plus className="w-3.5 h-3.5" /> สร้างใหม่ {dryRunData.summary.created}
                    </span>
                  )}
                  {dryRunData.summary.updated > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-medium">
                      <Pencil className="w-3.5 h-3.5" /> อัพเดท {dryRunData.summary.updated}
                    </span>
                  )}
                  {unchangedCount > 0 && (
                    <span className="text-gray-400 dark:text-slate-500">
                      ไม่มีการเปลี่ยนแปลง {unchangedCount}
                    </span>
                  )}
                  {dryRunData.summary.errors > 0 && (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRunData.summary.errors}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={resetAll} className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg">
                    เลือกไฟล์ใหม่
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={changedResults.filter(r => r.action !== 'error').length === 0}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    นำเข้า <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Parse errors */}
            {parseErrors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium mb-2">
                  <AlertCircle className="w-4 h-4" /> แถวที่อ่านไม่ได้ (ข้าม)
                </div>
                <div className="space-y-1 text-sm text-red-600 dark:text-red-400">
                  {parseErrors.slice(0, 3).map(r => <p key={r.rowNum}>แถว {r.rowNum}: {r.error}</p>)}
                  {parseErrors.length > 3 && <p>...และอีก {parseErrors.length - 3} แถว</p>}
                </div>
              </div>
            )}

            {/* Changed items table */}
            {changedResults.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="data-thead">
                    <tr>
                      <th className="data-th w-20">Action</th>
                      <th className="data-th">รหัส</th>
                      <th className="data-th">ชื่อสินค้า</th>
                      <th className="data-th">การเปลี่ยนแปลง</th>
                    </tr>
                  </thead>
                  <tbody className="data-tbody">
                    {changedResults.map((r, i) => (
                      <tr key={i} className="data-tr">
                        <td className="px-5 py-3">
                          {r.action === 'created' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                              <Plus className="w-3 h-3" /> ใหม่
                            </span>
                          )}
                          {r.action === 'updated' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                              <Pencil className="w-3 h-3" /> แก้ไข
                            </span>
                          )}
                          {r.action === 'error' && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" /> Error
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{r.code}</td>
                        <td className="px-5 py-3">
                          <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                          {r.variation_label && r.variation_label !== '-' && (
                            <span className="text-gray-400 dark:text-slate-500 ml-1.5 text-xs">({r.variation_label})</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          {r.action === 'error' ? (
                            <span className="text-red-500 text-xs">{r.error}</span>
                          ) : r.changes && r.changes.length > 0 ? (
                            <div className="space-y-0.5">
                              {r.changes.map((c, ci) => (
                                <div key={ci} className="text-xs">
                                  <span className="text-gray-500 dark:text-slate-400">{FIELD_LABELS[c.field] || c.field}: </span>
                                  {c.from !== undefined && c.from !== null && (
                                    <><span className="text-red-400 line-through">{String(c.from)}</span> → </>
                                  )}
                                  <span className="text-emerald-600 font-medium">{String(c.to)}</span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center">
                <Check className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-slate-400">ไม่มีการเปลี่ยนแปลง — ข้อมูลทั้งหมดตรงกับระบบอยู่แล้ว</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังนำเข้าสินค้า...</h2>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && importData && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${importData.summary.errors === 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                {importData.summary.errors === 0
                  ? <Check className="w-8 h-8 text-emerald-600" />
                  : <AlertCircle className="w-8 h-8 text-amber-600" />
                }
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">นำเข้าเสร็จสิ้น</h2>
              <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
                {importData.summary.created > 0 && <span className="text-emerald-600 font-medium">{importData.summary.created} สร้างใหม่</span>}
                {importData.summary.updated > 0 && <span className="text-blue-600 font-medium">{importData.summary.updated} อัพเดท</span>}
                {importData.summary.unchanged > 0 && <span className="text-gray-400">{importData.summary.unchanged} ไม่เปลี่ยน</span>}
                {importData.summary.errors > 0 && <span className="text-red-600 font-medium">{importData.summary.errors} ล้มเหลว</span>}
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button onClick={() => router.push('/products')} className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold">
                  ไปหน้าสินค้า
                </button>
                <button onClick={resetAll} className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg">
                  นำเข้าเพิ่ม
                </button>
              </div>
            </div>

            {/* Show changes + errors */}
            {finalChanged.length > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                  <h3 className="font-medium text-gray-900 dark:text-white">รายละเอียด</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {finalChanged.map((r, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        {r.action === 'created' && <Plus className="w-3.5 h-3.5 text-emerald-500" />}
                        {r.action === 'updated' && <Pencil className="w-3.5 h-3.5 text-blue-500" />}
                        {r.action === 'error' && <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                        <span className="font-mono text-xs text-gray-400 mr-1">{r.code}</span>
                        <span className="text-gray-900 dark:text-white">{r.name}</span>
                      </div>
                      {r.action === 'error' ? (
                        <span className="text-red-500 text-xs">{r.error}</span>
                      ) : (
                        <span className={r.action === 'created' ? 'text-emerald-600 text-xs' : 'text-blue-600 text-xs'}>
                          {r.action === 'created' ? 'สร้างแล้ว' : `${r.changes?.length || 0} fields`}
                        </span>
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
