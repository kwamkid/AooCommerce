'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  readFileToRows, rowsToSheet, getCell, isRowEmpty, isInstructionRow,
  validateHeaders, type RequiredColumn,
} from '@/lib/bulk/parse-template';

import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import BulkErrorModal, { type BulkErrorReport } from '@/components/bulk/BulkErrorModal';

import { AlertCircle, FolderPlus, FileSpreadsheet } from 'lucide-react';

interface CreateItem {
  name: string;
  parent_name?: string;
  __rowNum?: number;
}

interface ResultRow {
  name: string;
  parent_name?: string;
  action: 'created' | 'error';
  category_id?: string;
  error?: string;
}

interface RunResponse {
  dry_run: boolean;
  results: ResultRow[];
  summary: { total: number; created: number; errors: number };
}

export default function BulkCreateCategoriesPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles } = useCompany();
  const { showToast } = useToast();
  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<CreateItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);
  const [errorReport, setErrorReport] = useState<BulkErrorReport | null>(null);

  // Pre-fetch existing category names so we can skip "create parent" rows when
  // the parent already exists in DB (avoids "already exists" errors on parents
  // that are just used as references for new children).
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const res = await apiFetch('/api/categories');
        type CatNode = { id: string; name: string; children?: CatNode[] };
        const data = await res.json();
        const roots: CatNode[] = data.data || data.categories || [];
        const names: string[] = [];
        const walk = (nodes: CatNode[]) => {
          for (const n of nodes) {
            if (n.name) names.push(n.name);
            if (n.children?.length) walk(n.children);
          }
        };
        walk(roots);
        setExistingNames(new Set(names));
      } catch (err) {
        console.error('load categories error:', err);
      } finally {
        setOptionsLoaded(true);
      }
    })();
  }, [userProfile]);

  const requiredHeaders = useMemo<RequiredColumn[]>(() => [
    { aliases: ['ชื่อหมวดหมู่หลัก*', 'ชื่อหมวดหมู่หลัก', 'parent_name'], label: 'ชื่อหมวดหมู่หลัก' },
    { aliases: ['หมวดหมู่รอง', 'child_name', 'sub_category'], label: 'หมวดหมู่รอง' },
  ], []);

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('new-categories');

    const headers = ['ชื่อหมวดหมู่หลัก*', 'หมวดหมู่รอง'];
    const headerRow = ws.addRow(headers);
    headerRow.height = 28;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4511E' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    });

    const noteRow = ws.addRow([
      '(จำเป็น)',
      '(ค่าว่าง = ไม่มีหมวดหมู่รอง)',
    ]);
    noteRow.eachCell(cell => {
      cell.font = { italic: true, color: { argb: 'FF999999' }, size: 9 };
    });

    const samples: (string | number)[][] = [
      ['เสื้อผ้า', 'เสื้อยืด'],
      ['เสื้อผ้า', 'กางเกง'],
      ['เสื้อผ้า', 'เสื้อแจ็คเก็ต'],
      ['รองเท้า', 'รองเท้าผ้าใบ'],
      ['รองเท้า', 'รองเท้าหนัง'],
      ['ของใช้ในบ้าน', ''],
    ];
    samples.forEach(s => ws.addRow(s));

    ws.columns = [{ width: 28 }, { width: 28 }];
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `category-create-template.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleFile = async (file: File) => {
    setErrorReport(null);

    const headerIssues: string[] = [];
    const rowIssues: string[] = [];
    const otherIssues: string[] = [];

    let raw: string[][];
    try {
      raw = await readFileToRows(file);
    } catch (err) {
      console.error('read error:', err);
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: [
          `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown'}`,
          'รองรับเฉพาะไฟล์ .xlsx, .xls, .csv',
        ],
      });
      return;
    }

    const sheet = rowsToSheet(raw);
    if (sheet.headers.length === 0 || sheet.rows.length === 0) {
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: ['ไฟล์ว่างเปล่า — ต้องมี header (แถว 1) + ข้อมูลอย่างน้อย 1 แถว'],
      });
      return;
    }

    const v = validateHeaders(sheet.headers, requiredHeaders);
    if (!v.ok) {
      for (const m of v.missing) headerIssues.push(`column "${m}" หายไป`);
    }

    // Build items[]: each row contributes 1-2 entities:
    //   - parent (only if doesn't exist in DB and not added yet in batch)
    //   - child  (only if child column has value)
    // Parents are pushed BEFORE children in items[] so the RPC can resolve
    // parent_name via the just-inserted parent row within the same call.
    const items: CreateItem[] = [];
    const addedParents = new Set<string>();

    try {
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row) || isInstructionRow(row)) continue;
        const rowNum = i + 2;

        const parent = getCell(row, 'ชื่อหมวดหมู่หลัก*', 'ชื่อหมวดหมู่หลัก', 'parent_name');
        const child = getCell(row, 'หมวดหมู่รอง', 'child_name', 'sub_category');

        if (!parent && !child) continue;
        if (!parent) {
          rowIssues.push(`แถว ${rowNum}: ไม่มีชื่อหมวดหมู่หลัก`);
          continue;
        }

        // Push parent if it's new (not in DB, not yet pushed this batch)
        if (!existingNames.has(parent) && !addedParents.has(parent)) {
          items.push({ name: parent, __rowNum: rowNum });
          addedParents.add(parent);
        }

        // Push child if specified — parent_name is the reference key
        if (child) {
          items.push({ name: child, parent_name: parent, __rowNum: rowNum });
        }
      }
    } catch (err) {
      console.error('parse error:', err);
      otherIssues.push(`เกิดข้อผิดพลาดตอนอ่านข้อมูล: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    if (items.length === 0 && rowIssues.length === 0 && headerIssues.length === 0) {
      otherIssues.push('ไม่พบรายการที่กรอกข้อมูล — ตรวจสอบว่ามีชื่อหมวดหมู่หลักในแถวข้อมูล');
    }

    if (headerIssues.length > 0 || rowIssues.length > 0 || otherIssues.length > 0) {
      setErrorReport({ headerIssues, rowIssues, otherIssues });
      return;
    }

    setParsedItems(items);
    setStep('checking');

    try {
      const res = await apiFetch('/api/products/bulk/create-categories/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorReport({
          headerIssues: [], rowIssues: [],
          otherIssues: [data.error || 'ตรวจสอบไม่สำเร็จ — ลองอีกครั้ง'],
        });
        setStep('upload');
        return;
      }
      setDryRun(data);
      setStep('preview');
    } catch (err) {
      console.error('dry-run error:', err);
      setErrorReport({
        headerIssues: [], rowIssues: [],
        otherIssues: ['เชื่อมต่อ server ไม่ได้ — ลองอีกครั้ง'],
      });
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    setStep('importing');
    try {
      const res = await apiFetch('/api/products/bulk/create-categories/apply', {
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
      if (data.summary.created > 0) parts.push(`สร้างใหม่ ${data.summary.created}`);
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

  return (
    <Layout>
      <div className="max-w-5xl space-y-6">
        <PageHeader
          title="เพิ่มหมวดหมู่แบบชุด"
          subtitle="สร้างหมวดหมู่หลายรายการพร้อมกันจากไฟล์ Excel (รองรับหมวดหมู่ย่อย)"
          backHref="/products/bulk"
        />

        {step === 'upload' && (
          <BulkUploadCard
            title="ดาวน์โหลด Template → กรอกข้อมูล → อัพโหลด"
            subtitle="สร้างหมวดหมู่ใหม่ — ระบบจะข้ามหมวดหมู่ที่มีอยู่แล้วอัตโนมัติ"
            onFile={handleFile}
            onDownloadTemplate={handleDownloadTemplate}
            disabled={!optionsLoaded}
            help={
              <>
                <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>1 แถว = 1 คู่ หมวดหมู่หลัก + หมวดหมู่รอง</strong></li>
                  <li>ใส่แค่ <strong>ชื่อหมวดหมู่หลัก</strong> → สร้างหมวดหมู่หลัก</li>
                  <li>ใส่ทั้งคู่ → สร้างหมวดหมู่หลัก (ถ้ายังไม่มี) + สร้างหมวดหมู่รองใต้หลัก</li>
                  <li>ใช้ชื่อหมวดหมู่หลักเดิมได้หลายแถว → จะสร้างหลักครั้งเดียว แล้ววางรองทั้งหมดไว้ใต้หลักเดียวกัน</li>
                  <li>ถ้าหมวดหมู่หลักมีในระบบอยู่แล้ว → ระบบใช้ของเดิม (ไม่ error)</li>
                </ul>
                <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300">
                  <FileSpreadsheet className="inline w-3 h-3 mr-1" />
                  Template มี <strong>แถวคำอธิบาย</strong> (สีเทา ใต้ header) + <strong>ตัวอย่าง</strong> — ลบตัวอย่างก่อนกรอกข้อมูลจริง
                </div>
              </>
            }
          />
        )}

        {step === 'checking' && (
          <LoadingCard title="กำลังตรวจสอบข้อมูล..." subtitle={`${parsedItems.length} แถว`} />
        )}

        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            <BulkPreviewBar
              title="ตรวจสอบรายการก่อนสร้าง"
              icon={<FolderPlus className="w-5 h-5 text-emerald-600" />}
              badges={
                <>
                  {dryRun.summary.created > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <FolderPlus className="w-3.5 h-3.5" /> สร้างใหม่ {dryRun.summary.created}
                    </span>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRun.summary.errors}
                    </span>
                  )}
                </>
              }
              confirmLabel="ยืนยันสร้าง"
              confirmDisabled={!dryRun || dryRun.summary.created === 0}
              onConfirm={handleConfirmImport}
              onCancel={resetAll}
            />

            {dryRun.results.length > 0 ? (
              <>
                <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="data-thead">
                      <tr>
                        <th className="data-th">หมวดหมู่หลัก</th>
                        <th className="data-th">หมวดหมู่รอง</th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {dryRun.results.map((r, i) => {
                        const isError = r.action === 'error';
                        // Parent rows have no parent_name; child rows have one
                        return (
                          <tr key={i} className={isError ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                            <td className="px-4 py-3 align-top text-gray-700 dark:text-slate-300">
                              {r.parent_name || (
                                <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {r.parent_name ? (
                                <span className="text-gray-900 dark:text-white font-medium">{r.name}</span>
                              ) : (
                                <span className="text-gray-300">—</span>
                              )}
                              {isError && r.error && (
                                <div className="text-xs text-red-600 dark:text-red-400 mt-1">⚠ {r.error}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden space-y-3">
                  {dryRun.results.map((r, i) => {
                    const isError = r.action === 'error';
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 ${
                          isError
                            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        {r.parent_name ? (
                          <>
                            <div className="text-xs text-gray-500 mb-0.5">📁 {r.parent_name}</div>
                            <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
                          </>
                        ) : (
                          <div className="text-gray-900 dark:text-white font-medium">📁 {r.name}</div>
                        )}
                        {isError && r.error && (
                          <div className="text-xs text-red-600 dark:text-red-400 mt-1">⚠ {r.error}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyCard title="ไม่พบรายการในไฟล์" />
            )}
          </div>
        )}

        {step === 'importing' && <LoadingCard title="กำลังสร้างหมวดหมู่..." />}

        {step === 'done' && finalRun && (
          <DoneCard
            hasErrors={finalRun.summary.errors > 0}
            summary={
              <>
                {finalRun.summary.created > 0 && (
                  <span className="text-emerald-600 font-medium">{finalRun.summary.created} สร้างใหม่</span>
                )}
                {finalRun.summary.errors > 0 && (
                  <span className="text-red-600 font-medium">{finalRun.summary.errors} ล้มเหลว</span>
                )}
              </>
            }
            actions={
              <>
                <Button variant="primary" onClick={() => router.push('/settings/categories')}>
                  ไปหน้าหมวดหมู่
                </Button>
                <Button variant="secondary" onClick={resetAll}>อัพโหลดเพิ่ม</Button>
              </>
            }
          />
        )}
      </div>

      <BulkErrorModal
        report={errorReport}
        onClose={() => setErrorReport(null)}
        onDownloadTemplate={handleDownloadTemplate}
      />
    </Layout>
  );
}
