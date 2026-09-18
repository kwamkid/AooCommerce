'use client';

import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
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
import { BrandIcon } from '@/lib/icons';
import { downloadBlob } from '@/lib/utils/download';

interface CreateItem {
  name: string;
  __rowNum?: number;
}

interface ResultRow {
  name: string;
  action: 'created' | 'error';
  brand_id?: string;
  error?: string;
}

// หน้าฝั่ง "สร้างใหม่" นับผลเป็น created — ประกาศไว้เองเพื่ออ่านตัวเลขได้โดยไม่ต้องเช็ค null
interface CreateSummary { total: number; created: number; errors: number }

const REQUIRED_HEADERS: RequiredColumn[] = [
  { aliases: ['ชื่อแบรนด์*', 'ชื่อแบรนด์', 'name'], label: 'ชื่อแบรนด์' },
];

/**
 * แปลงชีตเป็นรายการแบรนด์ที่จะสร้าง — ส่วนเดียวที่ต่างจากหน้า bulk อื่น
 * คืน `issues` ครบทุกถังเสมอ (hook จะไม่ยิง API ถ้ามีข้อใดข้อหนึ่ง)
 * ⛔ อ่านตามชื่อ header เสมอ (`getCell`) ห้ามอ่านตามตำแหน่งคอลัมน์
 */
function parseSheet(sheet: ParsedSheet): ParseOutcome<CreateItem> {
  const headerIssues: string[] = [];
  const rowIssues: string[] = [];
  const otherIssues: string[] = [];

  const v = validateHeaders(sheet.headers, REQUIRED_HEADERS);
  // เก็บให้ครบก่อนค่อยโชว์ — ไม่ early-return ทีละข้อ
  if (!v.ok) for (const m of v.missing) headerIssues.push(`column "${m}" หายไป`);

  const items: CreateItem[] = [];
  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    if (isRowEmpty(row) || isInstructionRow(row)) continue;
    const rowNum = i + 2;

    const name = getCell(row, 'ชื่อแบรนด์*', 'ชื่อแบรนด์', 'name');
    if (!name) {
      // แถวที่ว่างทั้งแถวข้ามเงียบ ๆ — เตือนเฉพาะแถวที่มีข้อมูลช่องอื่นแต่ลืมชื่อ
      if (Object.values(row).some(c => c && String(c).trim() !== '')) {
        rowIssues.push(`แถว ${rowNum}: ไม่มีชื่อแบรนด์`);
      }
      continue;
    }
    items.push({ name, __rowNum: rowNum });
  }

  if (items.length === 0 && rowIssues.length === 0 && headerIssues.length === 0) {
    otherIssues.push('ไม่พบรายการที่กรอกข้อมูล — ตรวจสอบว่ามีชื่อแบรนด์ในแถวข้อมูล');
  }

  return { items, issues: { headerIssues, rowIssues, otherIssues } };
}

export default function BulkCreateBrandsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles, permissions } = useCompany();
  const isAdmin = can({ roles: companyRoles, permissions }, 'product.bulk_edit');

  // flow อัปไฟล์ → dry-run → Apply อยู่ที่ hook กลาง (lib/bulk/use-bulk-apply)
  // `errorMode: 'modal'` = สะสมทุกปัญหาแล้วโชว์ทีเดียวใน BulkErrorModal — ไฟล์หน้านี้
  // ผู้ใช้พิมพ์เอง ต้องรู้ให้ครบรอบเดียวว่าต้องแก้อะไรบ้าง
  const {
    step, parsedItems, dryRun, finalRun, errorReport, clearErrorReport,
    handleFile, confirmImport: handleConfirmImport, reset: resetAll,
  } = useBulkApply<CreateItem, ResultRow, CreateSummary>({
    endpoint: '/api/products/bulk/create-brands/apply',
    errorMode: 'modal',
    parse: parseSheet,
  });

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('new-brands');

    const headers = ['ชื่อแบรนด์*'];
    const instructions = ['(จำเป็น)'];
    addTemplateHeader(ws, headers, instructions);

    // Minimal template — 2 sample brands
    const samples: string[][] = [
      ['Brand A'],
      ['Brand B'],
    ];
    samples.forEach(s => ws.addRow(s));

    ws.columns = [{ width: 32 }];
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, 'brand-create-template.xlsx');
  };

  if (!userProfile) return null;
  if (!isAdmin) return <Layout><NoPermissionCard /></Layout>;

  return (
    <Layout>
      <div className="max-w-5xl space-y-6">
        <PageHeader
          title="เพิ่มแบรนด์แบบชุด"
          subtitle="สร้างแบรนด์หลายรายการพร้อมกันจากไฟล์ Excel"
          backHref="/products/bulk"
        />

        {step === 'upload' && (
          <BulkUploadCard
            title="ดาวน์โหลด Template → กรอกข้อมูล → อัพโหลด"
            subtitle="สร้างแบรนด์ใหม่ — ห้ามใช้กับแบรนด์ที่มีอยู่แล้ว"
            onFile={handleFile}
            onDownloadTemplate={handleDownloadTemplate}
            help={
              <>
                <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li><strong>1 แถว = 1 แบรนด์</strong></li>
                  <li>ถ้าชื่อแบรนด์มีอยู่แล้ว → แถวนั้นจะ error</li>
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
              icon={<BrandIcon className="w-5 h-5 text-emerald-600" />}
              badges={
                <>
                  {dryRun.summary.created > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <BrandIcon className="w-3.5 h-3.5" /> สร้างใหม่ {dryRun.summary.created}
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
                        <th className="data-th">ชื่อแบรนด์</th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {dryRun.results.map((r, i) => {
                        const isError = r.action === 'error';
                        return (
                          <tr key={i} className={isError ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                            <td className="px-4 py-3 align-top">
                              <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
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
                        <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
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

        {step === 'importing' && <LoadingCard title="กำลังสร้างแบรนด์..." />}

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
                <Button variant="primary" onClick={() => router.push('/settings/brands')}>
                  ไปหน้าแบรนด์
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
