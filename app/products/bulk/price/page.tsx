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
import { addHeaderRow, addInstructionRow } from '@/lib/bulk/excel-template';

import {
  Check, AlertCircle, Pencil, ArrowRight,
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
  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');
  const canEditCost = userProfile?.canViewCost === true;

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('active');
  const [search, setSearch] = useState('');
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
      if (search.trim()) params.set('search', search.trim());

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
      // Header row — manually add to apply green tint to editable price columns
      const headerRow = addHeaderRow(ws, headers);
      headerRow.eachCell((cell, colNum) => {
        if (colNum >= 7) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF15803D' } };
        }
      });
      const instructions = [
        '(auto — ห้ามแก้)',
        '(auto — ห้ามแก้)',
        '(read-only)',
        '(read-only)',
        '(read-only)',
        '(read-only)',
        '(ตัวเลข ≥ 0)',
        '(ตัวเลข ≥ 0; 0 = ไม่มีส่วนลด)',
        ...(canEditCost ? ['(ตัวเลข ≥ 0)'] : []),
      ];
      addInstructionRow(ws, instructions);

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
        // Read-only cols 3-6 (display context)
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

      ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

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

  const handleFile = async (file: File) => {
    try {
      const raw = await readFileToRows(file);
      const sheet = rowsToSheet(raw);
      if (sheet.rows.length === 0) {
        showToast('ไฟล์ไม่มีข้อมูล', 'error');
        return;
      }

      const hasCostCol = sheet.headers.some(h => h && (h.includes('ราคาทุน') || h.toLowerCase().includes('cost')));

      const items: ApplyItem[] = [];
      let skippedNoId = 0;
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row) || isInstructionRow(row)) continue;

        const productId = getCell(row, 'product_id (ห้ามแก้)', 'product_id');
        const variationId = getCell(row, 'variation_id (ห้ามแก้)', 'variation_id');
        if (!variationId) {
          if (Object.values(row).some(c => c && String(c).trim())) skippedNoId++;
          continue;
        }

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
        showToast(
          skippedNoId > 0
            ? `ทุกแถวไม่มี variation_id — หน้านี้แก้ไขเท่านั้น ถ้าอยากเพิ่มสินค้าใหม่ใช้ "เพิ่มสินค้าใหม่" แทน`
            : 'ไม่พบแถวที่มี variation_id',
          'error',
        );
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
          title="แก้ไขราคา"
          subtitle={`แก้ราคาปกติ / ราคาขาย${canEditCost ? ' / ราคาทุน' : ''}`}
          backHref="/products/bulk"
        />

        {step === 'upload' && (
          <div className="space-y-4">
            <Alert tone="warning" title="หน้านี้สำหรับแก้ไขราคาสินค้าที่มีอยู่แล้วเท่านั้น">
              <span>
                ไม่ใช่หน้าเพิ่มสินค้าใหม่ — ระบบจะ <strong>ข้ามแถวที่ไม่มี variation_id</strong> โดยอัตโนมัติ.
                ถ้าต้องการสร้างสินค้าใหม่ →{' '}
                <Link href="/products/bulk/create" className="underline font-medium">เพิ่มสินค้าใหม่</Link>
              </span>
            </Alert>

            <ProductFilters
              search={search}
              onSearchChange={setSearch}
              status={statusFilter}
              onStatusChange={setStatusFilter}
              brandIds={brandEnabled ? brandIds : undefined}
              onBrandIdsChange={brandEnabled ? setBrandIds : undefined}
              brands={brands}
              categoryIds={categoryIds}
              onCategoryIdsChange={setCategoryIds}
              categories={categories}
              onReset={() => {
                setSearch('');
                setStatusFilter('active');
                setBrandIds([]);
                setCategoryIds([]);
              }}
            />

            <BulkUploadCard
              title="Export → แก้ราคา → อัพโหลดกลับ"
              subtitle="ระบบจะแสดง preview ก่อนบันทึกเสมอ"
              onFile={handleFile}
              onDownloadTemplate={handleExport}
              downloadLabel={exporting ? 'กำลัง Export…' : 'Export สินค้า'}
              help={
                <>
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li>กด <strong>Export สินค้า</strong> → ได้ไฟล์ Excel ทุก variation ตาม filter</li>
                    <li>แก้เฉพาะ column <strong className="text-emerald-700">ราคาปกติ / ราคาขาย{canEditCost ? ' / ราคาทุน' : ''}</strong> (header สีเขียว)</li>
                    <li>คอลัมน์อื่น read-only (เพื่อ context — ห้ามแก้)</li>
                    <li>อัพโหลดกลับ → ระบบแสดง preview ก่อนบันทึก</li>
                  </ul>
                  {!canEditCost && (
                    <div className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                      <AlertCircle className="inline w-3 h-3 mr-1" />
                      คุณไม่มีสิทธิ์เห็น/แก้ราคาทุน — column นี้จะไม่ปรากฏใน Export
                    </div>
                  )}
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
                        <th className="data-th">SKU</th>
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
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {r.code}{r.variation_label && r.variation_label !== '-' && ` · ${r.variation_label}`}
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
                      <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
                      {r.variation_label && r.variation_label !== '-' && (
                        <div className="text-xs text-gray-500 mb-1">ตัวเลือก: {r.variation_label}</div>
                      )}
                      {r.sku && <div className="text-xs font-mono text-gray-500 mb-2">SKU: {r.sku}</div>}
                      {r.action === 'error' && r.error && (
                        <div className="text-xs text-red-500 mb-2">แถว {r.__rowNum}: {r.error}</div>
                      )}
                      {r.changes && r.changes.length > 0 && (
                        <ul className="space-y-1 bg-gray-50 dark:bg-slate-700/30 rounded p-2 mt-2">
                          {r.changes.map((c, ci) => (
                            <li key={ci} className="text-xs">
                              <span className="font-medium text-gray-600 dark:text-slate-400">{FIELD_LABELS[c.field] || c.field}:</span>{' '}
                              <span className="text-gray-500 line-through">{fmtMoney(c.from)}</span>
                              <ArrowRight className="inline w-3 h-3 text-gray-400 mx-1" />
                              <span className="text-emerald-600 font-medium">{fmtMoney(c.to)}</span>
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
                subtitle="ราคาในไฟล์ตรงกับระบบแล้ว"
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
        description={`จะอัพเดทราคาสินค้า ${dryRun?.summary.updated || 0} รายการ ดำเนินการต่อ?`}
        confirmLabel="บันทึก"
        cancelLabel="ยกเลิก"
      />
    </Layout>
  );
}
