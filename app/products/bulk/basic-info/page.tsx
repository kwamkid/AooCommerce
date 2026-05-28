'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  readFileToRows, rowsToSheet, getCell, isRowEmpty, isInstructionRow,
} from '@/lib/bulk/parse-template';

import Container from '@/components/ui/Container';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Alert from '@/components/ui/Alert';
import PageHeader from '@/components/ui/PageHeader';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import ProductFilters, { type ProductStatusFilter } from '@/components/products/ProductFilters';
import Pagination from '@/app/components/Pagination';
import { addTemplateHeader } from '@/lib/bulk/excel-template';
import {
  STATUS_COLUMN_HEADER, STATUS_INSTRUCTION, parseStatusValue, statusBoolToLabel,
} from '@/lib/bulk/status-enum';

import {
  Check, AlertCircle, Pencil, ArrowRight,
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
  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin') || companyRoles.includes('manager') || companyRoles.includes('warehouse');

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('active');
  const [exporting, setExporting] = useState(false);

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<ApplyItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Preview pagination — reset to page 1 each time a new dry-run lands
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPerPage, setPreviewPerPage] = useState(50);
  useEffect(() => { setPreviewPage(1); }, [dryRun]);

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
        STATUS_COLUMN_HEADER,
        ...(brandEnabled ? ['แบรนด์'] : []),
        'หมวดหมู่',
        'คำอธิบาย',
      ];
      const instructions = [
        '(auto — ห้ามแก้)',
        '(เว้นว่าง = ไม่แก้)',
        '(เว้นว่าง = ไม่แก้)',
        STATUS_INSTRUCTION,
        ...(brandEnabled ? ['(ชื่อต้องตรงในระบบ; เว้นว่าง = ลบ)'] : []),
        '(ชื่อต้องตรงในระบบ; เว้นว่าง = ลบ)',
        '(เว้นว่าง = ลบ)',
      ];
      addTemplateHeader(ws, headers, instructions);

      const grayFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF0F0F0' } };
      const grayFont = { color: { argb: 'FF999999' }, size: 9 };

      const colCount = headers.length;
      const descColIdx = colCount;
      for (const it of items) {
        const values: (string | number)[] = [
          it.product_id,
          it.code,
          it.name,
          statusBoolToLabel(it.is_active),
          ...(brandEnabled ? [it.brand_name] : []),
          it.category_name,
          it.description,
        ];
        const row = ws.addRow(values);
        const idCell = row.getCell(1);
        idCell.fill = grayFill;
        idCell.font = grayFont;
        idCell.protection = { locked: true };
        for (let c = 2; c <= colCount; c++) {
          row.getCell(c).protection = { locked: false };
        }
        row.getCell(descColIdx).alignment = { wrapText: true, vertical: 'top' };
      }

      ws.columns = [
        { width: 38 },
        { width: 16 },
        { width: 38 },
        { width: 12 },
        ...(brandEnabled ? [{ width: 20 }] : []),
        { width: 20 },
        { width: 60 },
      ];
      ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }];
      await ws.protect('', {
        selectLockedCells: true,
        selectUnlockedCells: true,
        formatCells: false,
        formatColumns: false,
        formatRows: true,
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

  const handleFile = async (file: File) => {
    try {
      const raw = await readFileToRows(file);
      const sheet = rowsToSheet(raw);
      if (sheet.rows.length === 0) {
        showToast('ไฟล์ไม่มีข้อมูล (header + อย่างน้อย 1 แถว)', 'error');
        return;
      }

      const items: ApplyItem[] = [];
      let skippedNoId = 0;
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row) || isInstructionRow(row)) continue;

        const productId = getCell(row, 'product_id (ห้ามแก้)', 'product_id');
        if (!productId) {
          // Row has data but no product_id — silently skipped, but count for warning
          if (Object.values(row).some(c => c && String(c).trim())) skippedNoId++;
          continue;
        }

        const code = getCell(row, 'รหัสสินค้า', 'code');
        const name = getCell(row, 'ชื่อสินค้า', 'name');
        const status = getCell(row, 'สถานะ', 'status', 'is_active');
        const brandName = getCell(row, 'แบรนด์', 'brand', 'brand_name');
        const categoryName = getCell(row, 'หมวดหมู่', 'category', 'category_name');
        const description = getCell(row, 'คำอธิบาย', 'description');

        const item: ApplyItem = { product_id: productId, __rowNum: i + 2 };
        if (code) item.code = code;
        if (name) item.name = name;
        const parsedStatus = parseStatusValue(status);
        if (parsedStatus !== null) item.is_active = parsedStatus;
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
        showToast(
          skippedNoId > 0
            ? `ทุกแถวไม่มี product_id — หน้านี้แก้ไขเท่านั้น ถ้าอยากเพิ่มสินค้าใหม่ ใช้ "เพิ่มสินค้าใหม่" แทน`
            : 'ไม่พบแถวที่มี product_id',
          'error',
        );
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
  };

  if (!userProfile) return null;
  if (!isAdmin) return <Layout><NoPermissionCard /></Layout>;

  const changedResults = dryRun?.results.filter(r => r.action !== 'unchanged') || [];
  const totalChanged = changedResults.length;
  const totalPreviewPages = Math.max(1, Math.ceil(totalChanged / previewPerPage));
  const startIdx = (previewPage - 1) * previewPerPage;
  const endIdx = Math.min(startIdx + previewPerPage, totalChanged);
  const visibleChangedResults = changedResults.slice(startIdx, endIdx);

  return (
    <Layout>
      <Container size="5xl">
        <PageHeader
          title="แก้ไขข้อมูลพื้นฐาน"
          subtitle="แก้ชื่อสินค้า / รหัส / สถานะ / แบรนด์ / หมวดหมู่ / คำอธิบาย"
          backHref="/products/bulk"
        />

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert tone="warning" title="หน้านี้สำหรับแก้ไขสินค้าที่มีอยู่แล้วเท่านั้น">
              <span>
                ไม่ใช่หน้าเพิ่มสินค้าใหม่ — ระบบจะ <strong>ข้ามแถวที่ไม่มี product_id</strong> โดยอัตโนมัติ.
                ถ้าต้องการสร้างสินค้าใหม่ →{' '}
                <Link href="/products/bulk/create" className="underline font-medium">เพิ่มสินค้าใหม่</Link>
              </span>
            </Alert>

            <ProductFilters
              status={statusFilter}
              onStatusChange={setStatusFilter}
              brandIds={brandEnabled ? brandIds : undefined}
              onBrandIdsChange={brandEnabled ? setBrandIds : undefined}
              brands={brands}
              categoryIds={categoryIds}
              onCategoryIdsChange={setCategoryIds}
              categories={categories}
              onReset={() => {
                setStatusFilter('active');
                setBrandIds([]);
                setCategoryIds([]);
              }}
            />

            <BulkUploadCard
              title="Export → แก้ไข → อัพโหลดกลับ"
              subtitle="ระบบจะแสดง preview ก่อนบันทึกเสมอ"
              onFile={handleFile}
              onDownloadTemplate={handleExport}
              downloadLabel={exporting ? 'กำลัง Export…' : 'Export สินค้า'}
              help={
                <>
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>กด <strong>Export สินค้า</strong> → ได้ไฟล์ Excel ของสินค้าตาม filter ที่เลือก</li>
                    <li>แก้ไขค่าใน Excel (ห้ามแก้ <strong>product_id</strong> column สีเทา)</li>
                    <li><strong>สถานะ</strong>: พิมพ์ &quot;ใช้งาน&quot; หรือ &quot;ไม่ใช้งาน&quot;</li>
                    <li><strong>{brandEnabled ? 'แบรนด์/หมวดหมู่' : 'หมวดหมู่'}</strong>: พิมพ์ชื่อตรงกับที่มีในระบบ (เว้นว่าง = ลบออก)</li>
                    <li><strong>คำอธิบาย</strong>: เว้นว่าง = ลบคำอธิบายเดิม</li>
                    <li>อัพโหลดกลับ → ระบบแสดง preview ทุกรายการก่อนบันทึก</li>
                  </ul>
                </>
              }
            />
          </div>
        )}

        {step === 'checking' && (
          <LoadingCard title="กำลังตรวจสอบข้อมูล..." subtitle={`${parsedItems.length} รายการ`} />
        )}

        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            <BulkPreviewBar
              title="ตรวจสอบรายการก่อนบันทึก"
              icon={<Pencil className="w-5 h-5 text-blue-600" />}
              badges={
                <>
                  {dryRun.summary.updated > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-medium">
                      <Pencil className="w-3.5 h-3.5" /> อัพเดท {dryRun.summary.updated}
                    </span>
                  )}
                  {dryRun.summary.unchanged > 0 && (
                    <span className="text-gray-400 dark:text-slate-500 text-sm">ไม่เปลี่ยน {dryRun.summary.unchanged}</span>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRun.summary.errors}
                    </span>
                  )}
                </>
              }
              confirmLabel="ยืนยันบันทึก"
              confirmDisabled={dryRun.summary.updated === 0}
              onConfirm={() => setConfirmOpen(true)}
              onCancel={resetAll}
            />

            {changedResults.length > 0 ? (
              <>
                <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="data-thead">
                      <tr>
                        <th className="data-th w-24">Action</th>
                        <th className="data-th">สินค้า</th>
                        <th className="data-th">การเปลี่ยนแปลง</th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {visibleChangedResults.map((r, i) => (
                        <tr key={startIdx + i} className="data-tr">
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

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {visibleChangedResults.map((r, i) => (
                    <Card key={startIdx + i} padding="sm">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs text-gray-500 font-mono">{r.code}</div>
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
                      </div>
                      <div className="text-gray-900 dark:text-white font-medium mb-2">{r.name}</div>
                      {r.action === 'error' && r.error && (
                        <div className="text-xs text-red-500 mb-2">แถว {r.__rowNum}: {r.error}</div>
                      )}
                      {r.changes && r.changes.length > 0 && (
                        <ul className="space-y-1 bg-gray-50 dark:bg-slate-700/30 rounded p-2">
                          {r.changes.map((c, ci) => (
                            <li key={ci} className="text-xs">
                              <span className="font-medium text-gray-600 dark:text-slate-400">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                              <span className="text-gray-500 line-through">{formatValue(c.field, c.from)}</span>
                              <ArrowRight className="inline w-3 h-3 text-gray-400 mx-1" />
                              <span className="text-emerald-600 font-medium">{formatValue(c.field, c.to, c.to_label)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>

                {totalChanged > previewPerPage && (
                  <Pagination
                    currentPage={previewPage}
                    totalPages={totalPreviewPages}
                    totalRecords={totalChanged}
                    startIdx={startIdx}
                    endIdx={endIdx}
                    recordsPerPage={previewPerPage}
                    setRecordsPerPage={(v) => { setPreviewPerPage(v); setPreviewPage(1); }}
                    setPage={setPreviewPage}
                  />
                )}
              </>
            ) : (
              <EmptyCard
                title="ไม่มีการเปลี่ยนแปลง"
                subtitle="ข้อมูลในไฟล์ตรงกับระบบแล้ว"
                icon={<Check className="w-12 h-12 text-gray-300 dark:text-slate-600 mx-auto" />}
              />
            )}
          </div>
        )}

        {step === 'importing' && <LoadingCard title="กำลังบันทึก..." />}

        {step === 'done' && finalRun && (
          <DoneCard
            hasErrors={finalRun.summary.errors > 0}
            summary={
              <>
                {finalRun.summary.updated > 0 && (
                  <span className="text-blue-600 font-medium">{finalRun.summary.updated} อัพเดท</span>
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
                <Button variant="primary" onClick={() => router.push('/products')}>
                  ไปหน้าสินค้า
                </Button>
                <Button variant="secondary" onClick={resetAll}>อัพโหลดเพิ่ม</Button>
              </>
            }
          />
        )}
      </Container>

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
