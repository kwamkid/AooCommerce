'use client';

import { useState, useMemo } from 'react';
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
import { addTemplateHeader } from '@/lib/bulk/excel-template';

import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import BulkErrorModal, { type BulkErrorReport } from '@/components/bulk/BulkErrorModal';

import { AlertCircle, BadgePlus, FileSpreadsheet } from 'lucide-react';

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

interface RunResponse {
  dry_run: boolean;
  results: ResultRow[];
  summary: { total: number; created: number; errors: number };
}

export default function BulkCreateBrandsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles } = useCompany();
  const { showToast } = useToast();
  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin') || companyRoles.includes('manager') || companyRoles.includes('warehouse');

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<CreateItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);
  const [errorReport, setErrorReport] = useState<BulkErrorReport | null>(null);

  const requiredHeaders = useMemo<RequiredColumn[]>(() => [
    { aliases: ['ชื่อแบรนด์*', 'ชื่อแบรนด์', 'name'], label: 'ชื่อแบรนด์' },
  ], []);

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('new-brands');

    const headers = ['ชื่อแบรนด์*'];
    const instructions = ['(จำเป็น)'];
    addTemplateHeader(ws, headers, instructions);

    const samples: string[][] = [
      ['Brand A'],
      ['Brand B'],
      ['Brand C'],
      ['Brand D'],
    ];
    samples.forEach(s => ws.addRow(s));

    ws.columns = [{ width: 32 }];
    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `brand-create-template.xlsx`;
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

    const items: CreateItem[] = [];
    try {
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row) || isInstructionRow(row)) continue;
        const rowNum = i + 2;

        const name = getCell(row, 'ชื่อแบรนด์*', 'ชื่อแบรนด์', 'name');
        if (!name) {
          // Only push error if row has any other content
          if (Object.values(row).some(c => c && String(c).trim() !== '')) {
            rowIssues.push(`แถว ${rowNum}: ไม่มีชื่อแบรนด์`);
          }
          continue;
        }

        items.push({ name, __rowNum: rowNum });
      }
    } catch (err) {
      console.error('parse error:', err);
      otherIssues.push(`เกิดข้อผิดพลาดตอนอ่านข้อมูล: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    if (items.length === 0 && rowIssues.length === 0 && headerIssues.length === 0) {
      otherIssues.push('ไม่พบรายการที่กรอกข้อมูล — ตรวจสอบว่ามีชื่อแบรนด์ในแถวข้อมูล');
    }

    if (headerIssues.length > 0 || rowIssues.length > 0 || otherIssues.length > 0) {
      setErrorReport({ headerIssues, rowIssues, otherIssues });
      return;
    }

    setParsedItems(items);
    setStep('checking');

    try {
      const res = await apiFetch('/api/products/bulk/create-brands/apply', {
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
      const res = await apiFetch('/api/products/bulk/create-brands/apply', {
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
              icon={<BadgePlus className="w-5 h-5 text-emerald-600" />}
              badges={
                <>
                  {dryRun.summary.created > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <BadgePlus className="w-3.5 h-3.5" /> สร้างใหม่ {dryRun.summary.created}
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
        onClose={() => setErrorReport(null)}
        onDownloadTemplate={handleDownloadTemplate}
      />
    </Layout>
  );
}
