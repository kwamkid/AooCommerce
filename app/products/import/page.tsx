'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, X, Loader2, AlertCircle,
} from 'lucide-react';

interface ParsedRow {
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
  code: string;
  name: string;
  product_type: 'simple' | 'variation';
  variations: {
    variation_label: string;
    sku: string;
    barcode: string;
    default_price: number;
    discount_price: number;
  }[];
  errors: string[];
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

const TEMPLATE_HEADERS = ['รหัสสินค้า', 'ชื่อสินค้า', 'ตัวเลือก', 'SKU', 'Barcode', 'ราคาปกติ', 'ราคาขาย'];

function downloadTemplate() {
  const rows = [
    TEMPLATE_HEADERS.join(','),
    'P001,เสื้อยืดสีขาว,ขาว S,SKU-001,8850001,350,299',
    'P001,เสื้อยืดสีขาว,ขาว M,SKU-002,8850002,350,299',
    'P001,เสื้อยืดสีขาว,ขาว L,SKU-003,8850003,350,299',
    'P002,กางเกงยีนส์,-,SKU-004,8850004,890,790',
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
  const [results, setResults] = useState<{ code: string; name: string; success: boolean; error?: string }[]>([]);

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

      // Skip header row
      const dataRows = rows.slice(1);
      const parsed: ParsedRow[] = dataRows.map((cols, i) => {
        const row: ParsedRow = {
          code: cols[0] || '',
          name: cols[1] || '',
          variation_label: cols[2] || '-',
          sku: cols[3] || '',
          barcode: cols[4] || '',
          default_price: parseFloat(cols[5] || '0') || 0,
          discount_price: parseFloat(cols[6] || '0') || 0,
          rowNum: i + 2,
        };
        if (!row.code) row.error = 'ไม่มีรหัสสินค้า';
        else if (!row.name) row.error = 'ไม่มีชื่อสินค้า';
        return row;
      });

      setParsedRows(parsed);

      // Group by product code
      const groupMap = new Map<string, GroupedProduct>();
      for (const row of parsed) {
        if (row.error) continue;
        if (!groupMap.has(row.code)) {
          groupMap.set(row.code, {
            code: row.code,
            name: row.name,
            product_type: 'simple',
            variations: [],
            errors: [],
          });
        }
        const g = groupMap.get(row.code)!;
        g.variations.push({
          variation_label: row.variation_label || '-',
          sku: row.sku,
          barcode: row.barcode,
          default_price: row.default_price,
          discount_price: row.discount_price,
        });
      }

      // Determine product_type
      for (const [, g] of groupMap) {
        if (g.variations.length > 1) {
          g.product_type = 'variation';
        }
      }

      setGrouped(Array.from(groupMap.values()));
      setStep('preview');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    setImporting(true);
    setStep('importing');
    const importResults: typeof results = [];

    for (let i = 0; i < grouped.length; i++) {
      const product = grouped[i];
      setProgress(Math.round(((i + 1) / grouped.length) * 100));

      try {
        const body: Record<string, unknown> = {
          code: product.code,
          name: product.name,
          product_type: product.product_type,
        };

        if (product.product_type === 'simple') {
          const v = product.variations[0];
          body.variation_label = v.variation_label || '-';
          body.default_price = v.default_price;
          body.discount_price = v.discount_price || 0;
          body.sku = v.sku || undefined;
          body.barcode = v.barcode || undefined;
        } else {
          body.variations = product.variations.map(v => ({
            variation_label: v.variation_label,
            default_price: v.default_price,
            discount_price: v.discount_price || 0,
            sku: v.sku || undefined,
            barcode: v.barcode || undefined,
          }));
        }

        const res = await apiFetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          importResults.push({ code: product.code, name: product.name, success: true });
        } else {
          const data = await res.json();
          importResults.push({ code: product.code, name: product.name, success: false, error: data.error || 'Unknown error' });
        }
      } catch (err) {
        importResults.push({ code: product.code, name: product.name, success: false, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }

    setResults(importResults);
    setImporting(false);
    setStep('done');
    const successCount = importResults.filter(r => r.success).length;
    showToast(`นำเข้าสำเร็จ ${successCount}/${importResults.length} สินค้า`);
  };

  const errorRows = parsedRows.filter(r => r.error);
  const validCount = grouped.length;
  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

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
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">อัพโหลดไฟล์ CSV เพื่อสร้างสินค้าหลายรายการพร้อมกัน</p>
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
                  ดาวน์โหลด template ด้านล่าง กรอกข้อมูลสินค้า แล้วอัพโหลด
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
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFile}
                  className="hidden"
                />
              </div>

              <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
                <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">รูปแบบไฟล์ CSV:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>รหัสสินค้า</strong> — ถ้าซ้ำกันจะรวมเป็นสินค้าย่อย (variation)</li>
                  <li><strong>ชื่อสินค้า</strong> — ชื่อหลักของสินค้า</li>
                  <li><strong>ตัวเลือก</strong> — เช่น "แดง S", "น้ำเงิน M" (ใส่ - ถ้าไม่มี)</li>
                  <li><strong>SKU / Barcode</strong> — ไม่บังคับ</li>
                  <li><strong>ราคาปกติ / ราคาขาย</strong> — ตัวเลข (ราคาขาย=ราคาลด)</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-gray-600 dark:text-slate-400">
                    <strong className="text-gray-900 dark:text-white">{parsedRows.length}</strong> แถวข้อมูล
                  </span>
                  <span className="text-gray-600 dark:text-slate-400">
                    → <strong className="text-emerald-600">{validCount}</strong> สินค้าที่จะสร้าง
                  </span>
                  {errorRows.length > 0 && (
                    <span className="text-red-600">
                      <strong>{errorRows.length}</strong> แถวมีปัญหา
                    </span>
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
                    disabled={validCount === 0}
                    className="px-4 py-2 text-sm bg-primary hover:bg-primary-hover text-white rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    นำเข้า {validCount} สินค้า
                  </button>
                </div>
              </div>
            </div>

            {/* Error rows */}
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

            {/* Products preview */}
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th">รหัส</th>
                    <th className="data-th">ชื่อสินค้า</th>
                    <th className="data-th">ประเภท</th>
                    <th className="data-th text-center">ตัวเลือก</th>
                    <th className="data-th text-right">ราคา</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {grouped.map(product => (
                    <tr key={product.code} className="data-tr">
                      <td className="px-5 py-3 font-mono text-xs text-gray-500 dark:text-slate-400">{product.code}</td>
                      <td className="px-5 py-3 font-medium text-gray-900 dark:text-white">{product.name}</td>
                      <td className="px-5 py-3 text-gray-500 dark:text-slate-400">
                        {product.product_type === 'simple' ? 'ปกติ' : `ย่อย (${product.variations.length})`}
                      </td>
                      <td className="px-5 py-3 text-center text-gray-600 dark:text-slate-400">
                        {product.variations.map(v => v.variation_label).join(', ')}
                      </td>
                      <td className="px-5 py-3 text-right text-gray-900 dark:text-white">
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
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                นำเข้าเสร็จสิ้น
              </h2>
              <div className="flex items-center justify-center gap-6 text-sm">
                <span className="text-emerald-600 font-medium">{successCount} สำเร็จ</span>
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

            {/* Failed items */}
            {failCount > 0 && (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 dark:border-slate-700">
                  <h3 className="font-medium text-red-600">รายการที่ล้มเหลว</h3>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-slate-700">
                  {results.filter(r => !r.success).map(r => (
                    <div key={r.code} className="px-5 py-3 flex items-center justify-between text-sm">
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
