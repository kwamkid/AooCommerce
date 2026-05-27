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
import FormSelect from '@/components/ui/FormSelect';
import { readFileToRows, rowsToSheet, getCell, isRowEmpty } from '@/lib/bulk/parse-template';
import {
  Upload, Download, ArrowLeft, FileSpreadsheet,
  Check, Loader2, AlertCircle, Pencil, ArrowRight, Tag, FolderTree, AlertTriangle,
} from 'lucide-react';

interface Brand { id: string; name: string }
interface Category { id: string; name: string }

interface ApplyItem {
  product_id: string;
  code?: string;
  name?: string;
  is_active?: boolean;
  brand_name?: string;
  category_name?: string;
  description?: string;
  __rowNum?: number;
}

interface ResultChange { field: string; from?: unknown; to?: unknown; to_label?: string }
interface ResultRow {
  product_id: string;
  code: string;
  name: string;
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

const STATUS_LABELS: Record<string, string> = {
  active: 'ใช้งาน',
  inactive: 'ไม่ใช้งาน',
  all: 'ทั้งหมด',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'ชื่อสินค้า',
  code: 'รหัสสินค้า',
  description: 'คำอธิบาย',
  is_active: 'สถานะ',
  brand: 'แบรนด์',
  category: 'หมวดหมู่',
};

function formatValue(field: string, v: unknown, label?: string): string {
  if (v === null || v === undefined || v === '') return '(ว่าง)';
  if (field === 'is_active') return v ? 'ใช้งาน' : 'ไม่ใช้งาน';
  if (field === 'brand' || field === 'category') return label || String(v);
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

export default function BulkBasicInfoPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles } = useCompany();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const brandEnabled = features.product_brand;
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
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
      const params = new URLSearchParams({ status: statusFilter });
      if (brandEnabled && brandIds.length > 0) params.set('brand_ids', brandIds.join(','));
      if (categoryIds.length > 0) params.set('category_ids', categoryIds.join(','));

      const res = await apiFetch(`/api/products/bulk/basic-info/export?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Export ไม่สำเร็จ', 'error');
        return;
      }

      type ExportItem = {
        product_id: string;
        code: string;
        name: string;
        description: string;
        is_active: boolean;
        brand_name: string;
        category_name: string;
      };
      const items: ExportItem[] = data.items || [];
      if (items.length === 0) {
        showToast('ไม่พบสินค้าตาม filter ที่เลือก', 'error');
        return;
      }

      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('basic-info');

      const headers = [
        'product_id (ห้ามแก้)',
        'รหัสสินค้า',
        'ชื่อสินค้า',
        'สถานะ',
        ...(brandEnabled ? ['แบรนด์'] : []),
        'หมวดหมู่',
        'คำอธิบาย',
      ];
      const headerRow = ws.addRow(headers);
      headerRow.height = 28;
      headerRow.eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      });

      const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F0F0' } };
      const grayFont = { color: { argb: 'FF999999' }, size: 9 };

      const colCount = headers.length;
      const descColIdx = colCount; // 1-based last column
      for (const it of items) {
        const values: (string | number)[] = [
          it.product_id,
          it.code,
          it.name,
          it.is_active ? 'ใช้งาน' : 'ไม่ใช้งาน',
          ...(brandEnabled ? [it.brand_name] : []),
          it.category_name,
          it.description,
        ];
        const row = ws.addRow(values);
        // Lock col 1 (product_id)
        const idCell = row.getCell(1);
        idCell.fill = grayFill;
        idCell.font = grayFont;
        idCell.protection = { locked: true };
        // Unlock the rest
        for (let c = 2; c <= colCount; c++) {
          row.getCell(c).protection = { locked: false };
        }
        // Wrap description (last column)
        row.getCell(descColIdx).alignment = { wrapText: true, vertical: 'top' };
      }

      ws.columns = [
        { width: 38 }, // product_id
        { width: 16 }, // รหัส
        { width: 38 }, // ชื่อ
        { width: 12 }, // สถานะ
        ...(brandEnabled ? [{ width: 20 }] : []), // แบรนด์
        { width: 20 }, // หมวดหมู่
        { width: 60 }, // คำอธิบาย
      ];

      // Freeze header + product_id col
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

      await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: true, // allow row-height auto-fit (for multiline description)
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
      link.download = `product-basic-info-${items.length}-${date}.xlsx`;
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
        showToast('ไฟล์ไม่มีข้อมูล (header + อย่างน้อย 1 แถว)', 'error');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      const items: ApplyItem[] = [];
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row)) continue;

        const productId = getCell(row, 'product_id (ห้ามแก้)', 'product_id');
        if (!productId) continue;

        const code = getCell(row, 'รหัสสินค้า', 'code');
        const name = getCell(row, 'ชื่อสินค้า', 'name');
        const status = getCell(row, 'สถานะ', 'status', 'is_active');
        const brandName = getCell(row, 'แบรนด์', 'brand', 'brand_name');
        const categoryName = getCell(row, 'หมวดหมู่', 'category', 'category_name');
        const description = getCell(row, 'คำอธิบาย', 'description');

        const item: ApplyItem = { product_id: productId, __rowNum: i + 2 };
        if (code) item.code = code;
        if (name) item.name = name;
        if (status) {
          const s = status.trim().toLowerCase();
          item.is_active = s === 'ใช้งาน' || s === 'active' || s === 'true' || s === '1';
        }
        // brand_name / category_name / description: include even if empty (means "clear")
        // but only if column existed in header AND brand feature is on
        if (brandEnabled && Object.keys(row).some(k => k.includes('แบรนด์') || k.includes('brand'))) {
          item.brand_name = brandName;
        }
        if (Object.keys(row).some(k => k.includes('หมวดหมู่') || k.includes('category'))) {
          item.category_name = categoryName;
        }
        if (Object.keys(row).some(k => k.includes('คำอธิบาย') || k.includes('description'))) {
          item.description = description;
        }

        items.push(item);
      }

      if (items.length === 0) {
        showToast('ไม่พบแถวที่มี product_id', 'error');
        if (fileRef.current) fileRef.current.value = '';
        return;
      }

      setParsedItems(items);
      setStep('checking');

      const res = await apiFetch('/api/products/bulk/basic-info/apply', {
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
      // attach __rowNum back to results by index
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
      const res = await apiFetch('/api/products/bulk/basic-info/apply', {
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
      <Layout title="ข้อมูลพื้นฐาน — แก้ไขแบบชุด" breadcrumbs={[{ label: 'สินค้า', href: '/products' }, { label: 'แก้ไขแบบชุด', href: '/products/bulk' }, { label: 'ข้อมูลพื้นฐาน' }]}>
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
      title="ข้อมูลพื้นฐาน — แก้ไขแบบชุด"
      breadcrumbs={[
        { label: 'สินค้า', href: '/products' },
        { label: 'แก้ไขแบบชุด', href: '/products/bulk' },
        { label: 'ข้อมูลพื้นฐาน' },
      ]}
    >
      <div className="max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/products/bulk')} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">ข้อมูลพื้นฐาน</h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">แก้ชื่อสินค้า, รหัส, สถานะ, แบรนด์, หมวดหมู่, คำอธิบาย</p>
          </div>
        </div>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm p-5 space-y-5">
              <div>
                <label className="block text-base font-medium text-gray-600 dark:text-slate-400 mb-2">
                  กรองตามสถานะ
                </label>
                <FormSelect
                  value={statusFilter}
                  onChange={v => setStatusFilter(v as 'active' | 'inactive' | 'all')}
                  options={[
                    { id: 'active', label: STATUS_LABELS.active },
                    { id: 'inactive', label: STATUS_LABELS.inactive },
                    { id: 'all', label: STATUS_LABELS.all },
                  ]}
                />
              </div>

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
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Export → แก้ไข → อัพโหลดกลับ</h2>
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
                    <li>กด <strong>Export</strong> → ได้ไฟล์ Excel ของสินค้าตาม filter ที่เลือก</li>
                    <li>แก้ไขค่าใน Excel (ห้ามแก้ <strong>product_id</strong> column สีเทา)</li>
                    <li><strong>สถานะ</strong>: พิมพ์ &quot;ใช้งาน&quot; หรือ &quot;ไม่ใช้งาน&quot;</li>
                    <li><strong>{brandEnabled ? 'แบรนด์/หมวดหมู่' : 'หมวดหมู่'}</strong>: พิมพ์ชื่อตรงกับที่มีในระบบ (เว้นว่าง = ไม่มี)</li>
                    <li><strong>คำอธิบาย</strong>: เว้นว่าง = ลบคำอธิบายเดิม</li>
                    <li>อัพโหลดกลับ → ระบบแสดง preview ทุกรายการก่อนบันทึก</li>
                  </ul>
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
                          <div className="text-xs text-gray-500 dark:text-slate-400 font-mono">{r.code}</div>
                          {r.action === 'error' && r.error && (
                            <div className="text-xs text-red-500 mt-1">แถว {r.__rowNum}: {r.error}</div>
                          )}
                        </td>
                        <td className="px-5 py-3 align-top">
                          {r.changes && r.changes.length > 0 ? (
                            <ul className="space-y-1">
                              {r.changes.map((c, ci) => (
                                <li key={ci} className="text-sm">
                                  <span className="font-medium text-gray-600 dark:text-slate-400">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                                  <span className="text-gray-500 line-through mr-1">{formatValue(c.field, c.from)}</span>
                                  <ArrowRight className="inline w-3 h-3 text-gray-400 mx-1" />
                                  <span className="text-emerald-600 font-medium">{formatValue(c.field, c.to, c.to_label)}</span>
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
                <p className="text-gray-500 dark:text-slate-400">ไม่มีการเปลี่ยนแปลง — ข้อมูลในไฟล์ตรงกับระบบแล้ว</p>
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
        description={`จะอัพเดทสินค้า ${dryRun?.summary.updated || 0} รายการ ดำเนินการต่อ?`}
        confirmLabel="บันทึก"
        cancelLabel="ยกเลิก"
      />
    </Layout>
  );
}
