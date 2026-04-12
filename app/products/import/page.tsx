'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, Loader2, AlertCircle, RefreshCw, Plus, Pencil,
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
  rowNum: number;
  error?: string;
}

interface GroupedProduct {
  key: string;
  product_id?: string;
  code: string;
  name: string;
  action: 'create' | 'update';
  variations: {
    variation_id?: string;
    variation_label: string;
    sku: string;
    barcode: string;
    default_price: number;
    discount_price: number;
  }[];
}

interface ImportResult {
  code: string;
  name: string;
  action: 'created' | 'updated' | 'error';
  error?: string;
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(current.trim());
        current = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(current.trim());
        if (row.some(c => c)) rows.push(row);
        row = [];
        current = '';
        if (ch === '\r') i++;
      } else {
        current += ch;
      }
    }
  }
  row.push(current.trim());
  if (row.some(c => c)) rows.push(row);
  return rows;
}

const TEMPLATE_HEADERS = ['product_id', 'variation_id', 'รหัสสินค้า', 'ชื่อสินค้า', 'ตัวเลือก', 'SKU', 'Barcode', 'ราคาปกติ', 'ราคาขาย'];

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS.join(','),
    ',,P001,เสื้อยืดสีขาว,ขาว S,SKU-001,8850001,350,299',
    ',,P001,เสื้อยืดสีขาว,ขาว M,SKU-002,8850002,350,299',
    ',,P002,กางเกงยีนส์,-,SKU-004,8850004,890,790',
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

  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [grouped, setGrouped] = useState<GroupedProduct[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);

      if (rows.length < 2) {
        showToast('ไฟล์ไม่มีข้อมูล (ต้องมีอย่างน้อย header + 1 แถว)', 'error');
        return;
      }

      const dataRows = rows.slice(1);
      const parsed: ParsedRow[] = dataRows.map((cols, i) => {
        const row: ParsedRow = {
          product_id: cols[0] || '',
          variation_id: cols[1] || '',
          code: cols[2] || '',
          name: cols[3] || '',
          variation_label: cols[4] || '-',
          sku: cols[5] || '',
          barcode: cols[6] || '',
          default_price: parseFloat(cols[7] || '0') || 0,
          discount_price: parseFloat(cols[8] || '0') || 0,
          rowNum: i + 2,
        };
        if (!row.code) row.error = 'ไม่มีรหัสสินค้า';
        else if (!row.name) row.error = 'ไม่มีชื่อสินค้า';
        return row;
      });

      setParsedRows(parsed);

      // Group by product_id (update) or code (create)
      const groupMap = new Map<string, GroupedProduct>();
      for (const row of parsed) {
        if (row.error) continue;
        const key = row.product_id || `new:${row.code}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, {
            key,
            product_id: row.product_id || undefined,
            code: row.code,
            name: row.name,
            action: row.product_id ? 'update' : 'create',
            variations: [],
          });
        }
        groupMap.get(key)!.variations.push({
          variation_id: row.variation_id || undefined,
          variation_label: row.variation_label || '-',
          sku: row.sku,
          barcode: row.barcode,
          default_price: row.default_price,
          discount_price: row.discount_price,
        });
      }

      setGrouped(Array.from(groupMap.values()));
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    setImporting(true);
    setStep('importing');
    setProgress(10);

    try {
      const items = grouped.flatMap(g =>
        g.variations.map(v => ({
          product_id: g.product_id,
          variation_id: v.variation_id,
          code: g.code,
          name: g.name,
          product_type: g.variations.length > 1 ? 'variation' : 'simple',
          variation_label: v.variation_label,
          sku: v.sku,
          barcode: v.barcode,
          default_price: v.default_price,
          discount_price: v.discount_price,
        }))
      );

      setProgress(30);

      const res = await apiFetch('/api/products/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });

      setProgress(90);
      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'นำเข้าไม่สำเร็จ', 'error');
        setStep('upload');
        return;
      }

      setResults(data.results || []);
      setProgress(100);
      setStep('done');

      const { created, updated, errors } = data.summary || {};
      const parts: string[] = [];
      if (created > 0) parts.push(`สร้างใหม่ ${created}`);
      if (updated > 0) parts.push(`อัพเดท ${updated}`);
      if (errors > 0) parts.push(`ล้มเหลว ${errors}`);
      showToast(parts.join(', ') || 'เสร็จสิ้น');
    } catch (err) {
      console.error('Import error:', err);
      showToast('นำเข้าไม่สำเร็จ', 'error');
      setStep('upload');
    } finally {
      setImporting(false);
    }
  };

  const errorRows = parsedRows.filter(r => r.error);
  const createCount = grouped.filter(g => g.action === 'create').length;
  const updateCount = grouped.filter(g => g.action === 'update').length;
  const successCount = results.filter(r => r.action !== 'error').length;
  const failCount = results.filter(r => r.action === 'error').length;

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
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">อัพโหลดไฟล์ CSV เพื่อสร้างหรืออัพเดทสินค้า</p>
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
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">อัพโหลดไฟล์ CSV</h2>
                <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
                  Export จากหน้าสินค้า แก้ไขแล้ว Import กลับ หรือดาวน์โหลด Template สำหรับสร้างใหม่
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4" />
                  ดาวน์โหลด Template
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex items-center gap-2 px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  เลือกไฟล์ CSV
                </button>
                <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              </div>

              <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
                <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>สร้างใหม่</strong> — ปล่อย product_id, variation_id ว่าง ระบบจะสร้างสินค้าใหม่</li>
                  <li><strong>อัพเดท</strong> — ใส่ product_id + variation_id (ได้จาก Export) → อัพเดทราคา, SKU, ชื่อ</li>
                  <li><strong>รหัสซ้ำ</strong> — ถ้ารหัสสินค้าเดียวกันมีหลายแถว จะรวมเป็นสินค้าย่อย (variation)</li>
                  <li><strong>ถ้ามีราคาเปลี่ยน</strong> — ระบบจะ sync ไป Shopee/TikTok อัตโนมัติ</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">
                    <strong className="text-gray-900 dark:text-white">{parsedRows.length}</strong> แถว
                  </span>
                  {createCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <Plus className="w-3.5 h-3.5" />
                      <strong>{createCount}</strong> สร้างใหม่
                    </span>
                  )}
                  {updateCount > 0 && (
                    <span className="flex items-center gap-1 text-blue-600">
                      <Pencil className="w-3.5 h-3.5" />
                      <strong>{updateCount}</strong> อัพเดท
                    </span>
                  )}
                  {errorRows.length > 0 && (
                    <span className="text-red-600"><strong>{errorRows.length}</strong> ข้าม</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setStep('upload'); setParsedRows([]); setGrouped([]); if (fileRef.current) fileRef.current.value = ''; }}
                    className="px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg"
                  >
                    เลือกไฟล์ใหม่
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={grouped.length === 0}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    นำเข้า {grouped.length} สินค้า
                  </button>
                </div>
              </div>
            </div>

            {errorRows.length > 0 && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm font-medium mb-2">
                  <AlertCircle className="w-4 h-4" />
                  แถวที่มีปัญหา (จะถูกข้าม)
                </div>
                <div className="space-y-1 text-sm text-red-600 dark:text-red-400">
                  {errorRows.slice(0, 5).map(r => (
                    <p key={r.rowNum}>แถว {r.rowNum}: {r.error}</p>
                  ))}
                  {errorRows.length > 5 && <p>...และอีก {errorRows.length - 5} แถว</p>}
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th w-16">Action</th>
                    <th className="data-th">รหัส</th>
                    <th className="data-th">ชื่อสินค้า</th>
                    <th className="data-th text-center">ตัวเลือก</th>
                    <th className="data-th text-right">ราคาปกติ</th>
                    <th className="data-th text-right">ราคาขาย</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {grouped.map(product => (
                    <tr key={product.key} className="data-tr">
                      <td className="px-5 py-3">
                        {product.action === 'create' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                            <Plus className="w-3 h-3" /> ใหม่
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-full">
                            <Pencil className="w-3 h-3" /> แก้ไข
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{product.code}</td>
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{product.name}</td>
                      <td className="px-5 py-3 text-center text-gray-600 dark:text-slate-400 text-xs">
                        {product.variations.length === 1
                          ? product.variations[0].variation_label
                          : `${product.variations.length} ตัวเลือก`
                        }
                      </td>
                      <td className="px-5 py-3 text-right text-gray-700 dark:text-slate-300">
                        {product.variations[0]?.default_price || 0}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-900 dark:text-white font-medium">
                        {product.variations[0]?.discount_price || product.variations[0]?.default_price || 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังนำเข้าสินค้า...</h2>
            <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-gray-500 dark:text-slate-400">{progress}%</p>
          </div>
        )}

        {/* Step: Done */}
        {step === 'done' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${failCount === 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                {failCount === 0
                  ? <Check className="w-8 h-8 text-emerald-600" />
                  : <AlertCircle className="w-8 h-8 text-amber-600" />
                }
              </div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">นำเข้าเสร็จสิ้น</h2>
              <div className="flex items-center justify-center gap-6 text-sm">
                {results.filter(r => r.action === 'created').length > 0 && (
                  <span className="text-emerald-600 font-medium">
                    {results.filter(r => r.action === 'created').length} สร้างใหม่
                  </span>
                )}
                {results.filter(r => r.action === 'updated').length > 0 && (
                  <span className="text-blue-600 font-medium">
                    {results.filter(r => r.action === 'updated').length} อัพเดท
                  </span>
                )}
                {failCount > 0 && <span className="text-red-600 font-medium">{failCount} ล้มเหลว</span>}
              </div>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => router.push('/products')}
                  className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold"
                >
                  ไปหน้าสินค้า
                </button>
                <button
                  onClick={() => { setStep('upload'); setParsedRows([]); setGrouped([]); setResults([]); if (fileRef.current) fileRef.current.value = ''; }}
                  className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg"
                >
                  นำเข้าเพิ่ม
                </button>
              </div>
            </div>

            {failCount > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                  <h3 className="font-medium text-red-600">รายการที่ล้มเหลว</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {results.filter(r => r.action === 'error').map((r, i) => (
                    <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-mono text-xs text-gray-400 mr-2">{r.code}</span>
                        <span className="text-gray-900 dark:text-white">{r.name}</span>
                      </div>
                      <span className="text-red-500 text-xs">{r.error}</span>
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
