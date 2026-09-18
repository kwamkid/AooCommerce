'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { apiFetch } from '@/lib/api-client';
import {
  getCell, isRowEmpty, isInstructionRow,
  validateHeaders, type RequiredColumn, type ParsedSheet,
} from '@/lib/bulk/parse-template';
import { useBulkApply, type ParseOutcome } from '@/lib/bulk/use-bulk-apply';
import { addTemplateHeader } from '@/lib/bulk/excel-template';

import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import BulkErrorModal from '@/components/bulk/BulkErrorModal';

import { FileSpreadsheet } from 'lucide-react';
import { AlertIcon } from '@/lib/icons';
import { CategoryIcon } from '@/lib/icons';
import { downloadBlob } from '@/lib/utils/download';

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

// หน้าฝั่ง "สร้างใหม่" นับผลเป็น created — ประกาศไว้เองเพื่ออ่านตัวเลขได้โดยไม่ต้องเช็ค null
interface CreateSummary { total: number; created: number; errors: number }

const REQUIRED_HEADERS: RequiredColumn[] = [
  { aliases: ['ชื่อหมวดหมู่หลัก*', 'ชื่อหมวดหมู่หลัก', 'parent_name'], label: 'ชื่อหมวดหมู่หลัก' },
  { aliases: ['หมวดหมู่รอง', 'child_name', 'sub_category'], label: 'หมวดหมู่รอง' },
];

/**
 * แปลงชีตเป็นรายการหมวดหมู่ที่จะสร้าง — ส่วนเดียวที่ต่างจากหน้า bulk อื่น
 *
 * ⚠️ **1 แถว Excel ให้ได้ 0–2 รายการ** (หมวดหลัก + หมวดย่อย) ต่างจากหน้าอื่นที่ 1 แถว = 1 รายการ
 * และ **ต้อง push หมวดหลักก่อนหมวดย่อยเสมอ** เพราะ RPC อ้าง `parent_name` จากแถวที่เพิ่ง
 * insert ในรอบเดียวกัน · `existingNames` ที่ส่งเข้ามาใช้ "ข้าม" หมวดที่มีอยู่แล้ว ไม่ใช่ error
 */
function parseSheet(sheet: ParsedSheet, existingNames: Set<string>): ParseOutcome<CreateItem> {
  const headerIssues: string[] = [];
  const rowIssues: string[] = [];
  const otherIssues: string[] = [];

  const v = validateHeaders(sheet.headers, REQUIRED_HEADERS);
  if (!v.ok) for (const m of v.missing) headerIssues.push(`column "${m}" หายไป`);

  const items: CreateItem[] = [];
  const addedParents = new Set<string>();

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

    // หมวดหลักที่ยังไม่มีในระบบและยังไม่ถูกใส่ในรอบนี้
    if (!existingNames.has(parent) && !addedParents.has(parent)) {
      items.push({ name: parent, __rowNum: rowNum });
      addedParents.add(parent);
    }
    if (child) items.push({ name: child, parent_name: parent, __rowNum: rowNum });
  }

  if (items.length === 0 && rowIssues.length === 0 && headerIssues.length === 0) {
    otherIssues.push('ไม่พบรายการที่กรอกข้อมูล — ตรวจสอบว่ามีชื่อหมวดหมู่หลักในแถวข้อมูล');
  }

  return { items, issues: { headerIssues, rowIssues, otherIssues } };
}

export default function BulkCreateCategoriesPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles, permissions } = useCompany();
  const isAdmin = can({ roles: companyRoles, permissions }, 'product.bulk_edit');

  // flow อัปไฟล์ → dry-run → Apply อยู่ที่ hook กลาง (lib/bulk/use-bulk-apply)
  const {
    step, parsedItems, dryRun, finalRun, errorReport, clearErrorReport,
    handleFile, confirmImport: handleConfirmImport, reset: resetAll,
  } = useBulkApply<CreateItem, ResultRow, CreateSummary>({
    endpoint: '/api/products/bulk/create-categories/apply',
    errorMode: 'modal',
    parse: sheet => parseSheet(sheet, existingNames),
  });

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


  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('new-categories');

    const headers = ['ชื่อหมวดหมู่หลัก*', 'หมวดหมู่รอง'];
    const instructions = ['(จำเป็น)', '(ค่าว่าง = ไม่มีหมวดหมู่รอง)'];
    addTemplateHeader(ws, headers, instructions);

    // Minimal template — 2 records: one parent with 2 subs, one without sub
    const samples: (string | number)[][] = [
      ['เสื้อผ้า', 'เสื้อยืด'],
      ['เสื้อผ้า', 'กางเกง'],
      ['ของใช้ในบ้าน', ''],
    ];
    samples.forEach(s => ws.addRow(s));

    ws.columns = [{ width: 28 }, { width: 28 }];
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, 'category-create-template.xlsx');
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
              icon={<CategoryIcon className="w-5 h-5 text-emerald-600" />}
              badges={
                <>
                  {dryRun.summary.created > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <CategoryIcon className="w-3.5 h-3.5" /> สร้างใหม่ {dryRun.summary.created}
                    </span>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertIcon className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRun.summary.errors}
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
        onClose={clearErrorReport}
        onDownloadTemplate={handleDownloadTemplate}
      />
    </Layout>
  );
}
