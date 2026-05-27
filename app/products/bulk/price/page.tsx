'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import { readFileToRows, rowsToSheet, getCell, isRowEmpty } from '@/lib/bulk/parse-template';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, Loader2, AlertCircle, Pencil, ArrowRight, Tag, FolderTree, AlertTriangle,
} from 'lucide-react';

interface Brand { id: string; name: string }
interface Category { id: string; name: string }

interface ApplyItem {
  product_id?: string;
  variation_id: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
  __rowNum?: number;
}

interface ResultChange { field: string; from?: unknown; to?: unknown }
interface ResultRow {
  product_id: string;
  variation_id: string;
  code: string;
  name: string;
  variation_label: string;
  sku: string;
  action: 'updated' | 'unchanged' | 'error';
  changes?: ResultChange[];
  error?: string;
  __rowNum?: number;
}
interface RunResponse {
  dry_run: boolean;
  results: ResultRow[];
  summary: { total: number; updated: number; unchanged: number; errors: number };
}

const FIELD_LABELS: Record<string, string> = {
  default_price: 'ราคาปกติ',
  discount_price: 'ราคาขาย',
  cost_price: 'ราคาทุน',
};

const fmtMoney = (v: unknown) =>
  v === null || v === undefined || v === '' ? '-' : Number(v).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function BulkPricePage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles } = useCompany();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const brandEnabled = features.product_brand;
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');
  const canEditCost = userProfile?.canViewCost === true;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [exporting, setExporting] = useState(false);

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<ApplyItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const [brRes, catRes] = await Promise.all([
          apiFetch('/api/brands'),
          apiFetch('/api/categories'),
        ]);
        const brData = await brRes.json();
        const catData = await catRes.json();
        setBrands(brData.data || brData.brands || []);
        setCategories(catData.data || catData.categories || []);
      } catch (err) {
        console.error('load options error:', err);
      }
    })();
  }, [userProfile]);

  const brandOptions = useMemo(() => brands.map(b => ({ id: b.id, label: b.name })), [brands]);
  const categoryOptions = useMemo(() => categories.map(c => ({ id: c.id, label: c.name })), [categories]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (brandEnabled && brandIds.length > 0) params.set('brand_ids', brandIds.join(','));
      if (categoryIds.length > 0) params.set('category_ids', categoryIds.join(','));

      const res = await apiFetch(`/api/products/bulk/price/export?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Export ไม่สำเร็จ', 'error');
        return;
      }

      type ExportItem = {
        product_id: string;
        variation_id: string;
        product_code: string;
        product_name: string;
        variation_label: string;
        sku: string;
        default_price: number;
        discount_price: number;
        cost_price: number | null;
      };
      const items: ExportItem[] = data.items || [];
      if (items.length === 0) {
        showToast('ไม่พบสินค้าตาม filter ที่เลือก', 'error');
        return;
      }

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('price');

      const headers = [
        'product_id (ห้ามแก้)',
        'variation_id (ห้ามแก้)',
        'รหัสสินค้า',
        'ชื่อสินค้า',
        'ตัวเลือก',
        'SKU',
        'ราคาปกติ',
        'ราคาขาย',
        ...(canEditCost ? ['ราคาทุน'] : []),
      ];
      const headerRow = ws.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell((cell, colNum) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        // Highlight editable price columns with green
        if (colNum >= 7) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } };
        }
      });

      const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F0F0' } };
      const grayFont = { color: { argb: 'FF999999' }, size: 9 };
      const readonlyFont = { color: { argb: 'FF666666' }, size: 10 };

      for (const it of items) {
        const rowVals: (string | number)[] = [
          it.product_id,
          it.variation_id,
          it.product_code,
          it.product_name,
          it.variation_label,
          it.sku,
          it.default_price ?? 0,
          it.discount_price ?? 0,
        ];
        if (canEditCost) rowVals.push(it.cost_price ?? 0);

        const row = ws.addRow(rowVals);

        // Lock cols 1-2 (IDs)
        for (const c of [1, 2]) {
          const cell = row.getCell(c);
          cell.fill = grayFill;
          cell.font = grayFont;
          cell.protection = { locked: true };
        }
        // Read-only cols 3-6 (display)
        for (let c = 3; c <= 6; c++) {
          const cell = row.getCell(c);
          cell.font = readonlyFont;
          cell.protection = { locked: true };
        }
        // Editable price cols (7+)
        const priceEnd = canEditCost ? 9 : 8;
        for (let c = 7; c <= priceEnd; c++) {
          const cell = row.getCell(c);
          cell.protection = { locked: false };
          cell.alignment = { horizontal: 'right' };
          cell.numFmt = '#,##0.##';
        }
      }

      const colWidths = [38, 38, 14, 32, 16, 16, 12, 12];
      if (canEditCost) colWidths.push(12);
      ws.columns = colWidths.map(w => ({ width: w }));

      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 1 }];

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
      });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().split('T')[0];
      link.download = `product-price-${items.length}-${date}.xlsx`;
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

    try {
      const raw = await readFileToRows(file);
      const sheet = rowsToSheet(raw);
      if (sheet.rows.length === 0) {
        showToast('ไฟล์ไม่มีข้อมูล', 'error');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      const hasCostCol = sheet.headers.some(h => h && (h.includes('ราคาทุน') || h.toLowerCase().includes('cost')));

      const items: ApplyItem[] = [];
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row)) continue;

        const productId = getCell(row, 'product_id (ห้ามแก้)', 'product_id');
        const variationId = getCell(row, 'variation_id (ห้ามแก้)', 'variation_id');
        if (!variationId) continue;

        const def = getCell(row, 'ราคาปกติ', 'default_price', 'price');
        const disc = getCell(row, 'ราคาขาย', 'discount_price', 'discount');
        const cost = getCell(row, 'ราคาทุน', 'cost_price', 'cost');

        const item: ApplyItem = { variation_id: variationId, __rowNum: i + 2 };
        if (productId) item.product_id = productId;
        if (def !== '') item.default_price = Number(def);
        if (disc !== '') item.discount_price = Number(disc);
        if (canEditCost && hasCostCol && cost !== '') item.cost_price = Number(cost);
        items.push(item);
      }

      if (items.length === 0) {
        showToast('ไม่พบแถวที่มี variation_id', 'error');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      setParsedItems(items);
      setStep('checking');

      const res = await apiFetch('/api/products/bulk/price/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'ตรวจสอบไม่สำเร็จ', 'error');
        setStep('upload');
        return;
      }
      data.results = (data.results as ResultRow[]).map((r, idx) => ({ ...r, __rowNum: items[idx]?.__rowNum }));
      setDryRun(data);
      setStep('preview');
    } catch (err) {
      console.error('parse error:', err);
      showToast('อ่านไฟล์ไม่สำเร็จ', 'error');
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    setConfirmOpen(false);
    setStep('importing');
    try {
      const res = await apiFetch('/api/products/bulk/price/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems, dry_run: false }),
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

  if (!userProfile) return null;

  if (!isAdmin) {
    return (
      <Layout title="ราคา — แก้ไขแบบชุด" breadcrumbs={[{ label: 'สินค้า', href: '/products' }, { label: 'แก้ไขแบบชุด', href: '/products/bulk' }, { label: 'ราคา' }]}>
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">ไม่มีสิทธิ์</h3>
        </div>
      </Layout>
    );
  }

  const changedResults = dryRun?.results.filter(r => r.action !== 'unchanged') || [];

  return (
    <Layout
      title="ราคา — แก้ไขแบบชุด"
      breadcrumbs={[
        { label: 'สินค้า', href: '/products' },
        { label: 'แก้ไขแบบชุด', href: '/products/bulk' },
        { label: 'ราคา' },
      ]}
    >
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/products/bulk')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ราคา</h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">
              แก้ไขราคาปกติ, ราคาขาย{canEditCost ? ', ราคาทุน' : ''}
            </p>
          </div>
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 space-y-5">
              {brandEnabled && (
                <div>
                  <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-2">
                    กรองตามแบรนด์
                    <span className="ml-2 text-sm text-gray-400">{brandIds.length === 0 ? '(ทุกแบรนด์)' : `(เลือก ${brandIds.length})`}</span>
                  </label>
                  <MultiSelectSearch
                    value={brandIds}
                    onChange={setBrandIds}
                    options={brandOptions}
                    placeholder="ทุกแบรนด์"
                    emptyLabel="ทุกแบรนด์ (ไม่กรอง)"
                    searchPlaceholder="ค้นหาแบรนด์..."
                    icon={<Tag className="w-4 h-4" />}
                  />
                </div>
              )}
              <div>
                <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-2">
                  กรองตามหมวดหมู่
                  <span className="ml-2 text-sm text-gray-400">{categoryIds.length === 0 ? '(ทุกหมวด)' : `(เลือก ${categoryIds.length})`}</span>
                </label>
                <MultiSelectSearch
                  value={categoryIds}
                  onChange={setCategoryIds}
                  options={categoryOptions}
                  placeholder="ทุกหมวดหมู่"
                  emptyLabel="ทุกหมวดหมู่ (ไม่กรอง)"
                  searchPlaceholder="ค้นหาหมวดหมู่..."
                  icon={<FolderTree className="w-4 h-4" />}
                />
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8">
              <div className="text-center space-y-5">
                <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto">
                  <FileSpreadsheet className="w-8 h-8 text-gray-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Export → แก้ราคา → อัพโหลดกลับ</h2>
                  <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
                    ระบบจะแสดง preview ก่อนบันทึกเสมอ
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={handleExport}
                    disabled={exporting}
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
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
                </div>
                <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>กด <strong>Export</strong> → ได้ไฟล์ Excel ทุก variation</li>
                    <li>แก้เฉพาะ column <strong className="text-emerald-700">ราคาปกติ / ราคาขาย{canEditCost ? ' / ราคาทุน' : ''}</strong> (สีเขียว)</li>
                    <li>คอลัมน์อื่น read-only (เพื่อ context)</li>
                    <li>อัพโหลดกลับ → ระบบแสดง preview ก่อนบันทึก</li>
                  </ul>
                  {!canEditCost && (
                    <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="inline w-3 h-3 mr-1" />
                      คุณไม่มีสิทธิ์เห็น/แก้ราคาทุน — column นี้จะไม่ปรากฏใน Export
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 'checking' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-[#F4511E] animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังตรวจสอบข้อมูล...</h2>
            <p className="text-sm text-gray-500 dark:text-slate-400">{parsedItems.length} รายการ</p>
          </div>
        )}

        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
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
            </div>

            {changedResults.length > 0 ? (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="data-thead">
                    <tr>
                      <th className="data-th w-24">Action</th>
                      <th className="data-th">สินค้า</th>
                      <th className="data-th">SKU</th>
                      <th className="data-th">การเปลี่ยนแปลง</th>
                    </tr>
                  </thead>
                  <tbody className="data-tbody">
                    {changedResults.map((r, i) => (
                      <tr key={i} className="data-tr">
                        <td className="px-5 py-3 align-top">
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
                        <td className="px-5 py-3 align-top">
                          <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            {r.code} {r.variation_label && r.variation_label !== '-' && `· ${r.variation_label}`}
                          </div>
                          {r.action === 'error' && r.error && (
                            <div className="text-xs text-red-500 mt-1">แถว {r.__rowNum}: {r.error}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 align-top font-mono text-xs text-gray-500">{r.sku || '-'}</td>
                        <td className="px-5 py-3 align-top">
                          {r.changes && r.changes.length > 0 ? (
                            <ul className="space-y-1">
                              {r.changes.map((c, ci) => (
                                <li key={ci} className="text-sm">
                                  <span className="font-medium text-gray-600 dark:text-slate-400">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                                  <span className="text-gray-500 line-through mr-1">{fmtMoney(c.from)}</span>
                                  <ArrowRight className="inline w-3 h-3 text-gray-400 mx-1" />
                                  <span className="text-emerald-600 font-medium">{fmtMoney(c.to)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center">
                <Check className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                <p className="text-gray-500 dark:text-slate-400">ไม่มีการเปลี่ยนแปลง — ราคาในไฟล์ตรงกับระบบแล้ว</p>
              </div>
            )}
          </div>
        )}

        {step === 'importing' && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-[#F4511E] animate-spin mx-auto" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">กำลังบันทึก...</h2>
          </div>
        )}

        {step === 'done' && finalRun && (
          <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-8 text-center space-y-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${finalRun.summary.errors === 0 ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
              {finalRun.summary.errors === 0
                ? <Check className="w-8 h-8 text-emerald-600" />
                : <AlertTriangle className="w-8 h-8 text-amber-600" />}
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">บันทึกเสร็จสิ้น</h2>
            <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
              {finalRun.summary.updated > 0 && <span className="text-blue-600 font-medium">{finalRun.summary.updated} อัพเดท</span>}
              {finalRun.summary.unchanged > 0 && <span className="text-gray-400">{finalRun.summary.unchanged} ไม่เปลี่ยน</span>}
              {finalRun.summary.errors > 0 && <span className="text-red-600 font-medium">{finalRun.summary.errors} ล้มเหลว</span>}
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button onClick={() => router.push('/products')} className="px-4 py-2 bg-[#F4511E] hover:bg-[#E64A19] text-white rounded-lg font-semibold">
                ไปหน้าสินค้า
              </button>
              <button onClick={resetAll} className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-lg">
                อัพโหลดเพิ่ม
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmImport}
        title="ยืนยันการบันทึก"
        description={`จะอัพเดทราคาสินค้า ${dryRun?.summary.updated || 0} รายการ ดำเนินการต่อ?`}
        confirmLabel="บันทึก"
        cancelLabel="ยกเลิก"
      />
    </Layout>
  );
}
