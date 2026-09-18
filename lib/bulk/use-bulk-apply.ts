'use client';

// flow กลางของหน้า bulk ทุกหน้า: อัปไฟล์ → parse → dry-run → พรีวิว diff → ยืนยัน → Apply
//
// ⛔ ห้ามเขียน step/dryRun/finalRun/confirm เองในหน้า bulk อีก — ทุกหน้าเคยมีชุดเดียวกัน
//    คนละก๊อป (5 หน้า ~3,000 บรรทัด) แก้ flow ทีต้องไล่แก้ 5 ที่และลืมทุกครั้ง
// หน้าที่เหลือของแต่ละหน้าคือ **parse ไฟล์เป็น items** กับ **วาดตารางพรีวิว** เท่านั้น
//
// สัญญากับฝั่ง API (ทุก endpoint `/api/products/bulk/<action>/apply` ทำเหมือนกัน):
//   POST { items, dry_run } → { results[], summary: { updated, unchanged, errors }, dry_run }

import { useCallback, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { readFileToRows, rowsToSheet, type ParsedSheet } from '@/lib/bulk/parse-template';
import { useToast } from '@/lib/toast-context';

export type BulkStep = 'upload' | 'checking' | 'preview' | 'importing' | 'done';

/**
 * สรุปผลที่ API ตอบกลับ — **สองสายนับคนละอย่าง** จึง required แค่ `errors`
 * หน้าแก้ไข (price · basic-info) ตอบ `{total, updated, unchanged, errors}`
 * หน้าสร้างใหม่ (create*) ตอบ `{total, created, errors}` — ไม่มี updated/unchanged
 * หน้าไหนอ่านตัวเลขของตัวเองแบบไม่ต้องเช็ค null ให้ส่ง summary ของตัวเองเป็น `TSummary`
 */
export interface BulkSummary {
  errors: number;
  total?: number;
  created?: number;
  updated?: number;
  unchanged?: number;
}

export interface BulkRunResponse<TResult, TSummary = BulkSummary> {
  results: TResult[];
  summary: TSummary;
  dry_run?: boolean;
}

/** แถวที่ parse แล้ว — `__rowNum` ไว้อ้างกลับไปยังบรรทัดในไฟล์ตอนรายงาน error */
export interface BulkItemBase {
  __rowNum?: number;
}

export interface ParseOutcome<TItem> {
  items: TItem[];
  /** ข้อความตอน parse แล้วไม่เหลือแถวที่ใช้ได้เลย (โหมด toast) */
  emptyMessage?: string;
  /**
   * ปัญหาที่เก็บสะสมระหว่าง parse (โหมด modal ของหน้า "สร้างใหม่")
   * มีอย่างน้อย 1 ข้อ = **ไม่ยิง API เลย** ยกไปโชว์ใน `BulkErrorModal` ทีเดียว
   * — ผู้ใช้จะได้แก้ไฟล์รอบเดียวจบ ไม่ใช่โดนเตือนทีละใบจนกว่าจะหมด
   */
  issues?: BulkIssues;
}

export interface BulkIssues {
  headerIssues: string[];
  rowIssues: string[];
  otherIssues: string[];
}

export interface UseBulkApplyOptions<TItem> {
  /** ปลายทางของทั้ง dry-run และของจริง (ต่างกันแค่ `dry_run`) */
  endpoint: string;
  /** แปลงชีตเป็นรายการที่จะส่งขึ้น API — ส่วนเดียวที่แต่ละหน้าต่างกันจริง */
  parse: (sheet: ParsedSheet) => ParseOutcome<TItem>;
  /** เทมเพลตที่มีแถวข้อมูลเมตาเหนือ header (บางหน้าของ bulk create) */
  skipMetadataRow?: boolean;
  /**
   * รายงานปัญหายังไง — `'toast'` (ค่าเริ่มต้น) เตือนทีละใบ เหมาะกับหน้าแก้ไขที่ไฟล์มาจาก
   * Export ของระบบเอง จึงพังยาก · `'modal'` สะสมทุกปัญหาแล้วเปิด `BulkErrorModal` ทีเดียว
   * เหมาะกับหน้าสร้างใหม่ที่ผู้ใช้พิมพ์ไฟล์เอง — ต้องรู้ให้ครบรอบเดียวว่าต้องแก้อะไรบ้าง
   */
  errorMode?: 'toast' | 'modal';
  /** ข้อความสรุปหลัง Apply สำเร็จ — ไม่ส่งมาก็ใช้ "อัพเดท N, ล้มเหลว N" */
  summaryText?: (summary: BulkSummary) => string;
}

export interface BulkApplyState<TItem, TResult, TSummary = BulkSummary> {
  step: BulkStep;
  parsedItems: TItem[];
  /** ปัญหาจากรอบ parse ล่าสุด — ส่งเข้า `BulkErrorModal` ตรง ๆ · `null` = ไม่มี */
  errorReport: BulkIssues | null;
  clearErrorReport: () => void;
  dryRun: BulkRunResponse<TResult, TSummary> | null;
  finalRun: BulkRunResponse<TResult, TSummary> | null;
  confirmOpen: boolean;
  setConfirmOpen: (open: boolean) => void;
  /** พรีวิวหน้าไหน — รีเซ็ตเป็นหน้า 1 เองทุกครั้งที่ dry-run ใหม่ลง */
  previewPage: number;
  setPreviewPage: (page: number) => void;
  previewPerPage: number;
  setPreviewPerPage: (perPage: number) => void;
  handleFile: (file: File) => Promise<void>;
  confirmImport: () => Promise<void>;
  reset: () => void;
}

function defaultSummaryText(summary: BulkSummary): string {
  const parts: string[] = [];
  if (summary.created) parts.push(`สร้าง ${summary.created}`);
  if ((summary.updated ?? 0) > 0) parts.push(`อัพเดท ${summary.updated}`);
  if (summary.errors > 0) parts.push(`ล้มเหลว ${summary.errors}`);
  return parts.join(', ') || 'เสร็จสิ้น';
}

export function useBulkApply<TItem extends BulkItemBase, TResult, TSummary extends BulkSummary = BulkSummary>(
  options: UseBulkApplyOptions<TItem>,
): BulkApplyState<TItem, TResult, TSummary> {
  const { endpoint, parse, summaryText = defaultSummaryText, skipMetadataRow, errorMode = 'toast' } = options;
  const { showToast } = useToast();

  const [step, setStep] = useState<BulkStep>('upload');
  const [parsedItems, setParsedItems] = useState<TItem[]>([]);
  const [dryRun, setDryRun] = useState<BulkRunResponse<TResult, TSummary> | null>(null);
  const [finalRun, setFinalRun] = useState<BulkRunResponse<TResult, TSummary> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPerPage, setPreviewPerPage] = useState(50);
  const [errorReport, setErrorReport] = useState<BulkIssues | null>(null);

  /** มีปัญหาให้รายงานไหม — ว่างทั้ง 3 ถัง = ผ่าน */
  const hasIssues = (issues?: BulkIssues) =>
    !!issues && (issues.headerIssues.length > 0 || issues.rowIssues.length > 0 || issues.otherIssues.length > 0);

  /** รายงานปัญหาไปตามโหมดของหน้านั้น — ที่เดียวที่ตัดสินว่า modal หรือ toast */
  const report = useCallback((messages: string[]) => {
    if (errorMode === 'modal') setErrorReport({ headerIssues: [], rowIssues: [], otherIssues: messages });
    else showToast(messages[0], 'error');
  }, [errorMode, showToast]);

  const handleFile = useCallback(async (file: File) => {
    setErrorReport(null);
    try {
      let sheet: ParsedSheet;
      try {
        sheet = rowsToSheet(await readFileToRows(file), { skipMetadataRow });
      } catch (err) {
        console.error('bulk read error:', err);
        report([
          `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown'}`,
          'รองรับเฉพาะไฟล์ .xlsx, .xls, .csv',
        ]);
        return;
      }
      if (sheet.headers.length === 0 || sheet.rows.length === 0) {
        report(['ไฟล์ว่างเปล่า — ต้องมี header (แถว 1) + ข้อมูลอย่างน้อย 1 แถว']);
        return;
      }

      const { items, emptyMessage, issues } = parse(sheet);
      // โหมด modal: มีปัญหาแม้ข้อเดียว = ไม่ยิง API ยกไปโชว์รวดเดียว
      if (hasIssues(issues)) {
        setErrorReport(issues!);
        return;
      }
      if (items.length === 0) {
        report([emptyMessage || 'ไม่พบแถวที่แก้ไขได้ในไฟล์']);
        return;
      }

      setParsedItems(items);
      setStep('checking');

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        report([data.error || 'ตรวจสอบไม่สำเร็จ — ลองอีกครั้ง']);
        setStep('upload');
        return;
      }
      // ผูกเลขบรรทัดในไฟล์กลับเข้าผลลัพธ์ — API ตอบมาเรียงตามลำดับที่ส่งไป
      // ผู้ใช้จะได้รู้ว่า error อยู่บรรทัดไหนของไฟล์ ไม่ใช่แค่ลำดับที่เท่าไร
      data.results = (data.results as (TResult & BulkItemBase)[]).map((row, index) => ({
        ...row,
        __rowNum: items[index]?.__rowNum,
      }));
      setDryRun(data);
      // พรีวิวชุดใหม่เริ่มที่หน้า 1 เสมอ — ตั้งตรงนี้ ไม่ใช่ใน effect ที่ฟัง `dryRun`
      // (setState ใน effect ทำให้ render ซ้อนรอบโดยไม่จำเป็น · eslint ห้ามไว้ด้วย)
      setPreviewPage(1);
      setStep('preview');
    } catch (err) {
      console.error('bulk parse error:', err);
      report(['เชื่อมต่อ server ไม่ได้ — ลองอีกครั้ง']);
      setStep('upload');
    }
  }, [endpoint, parse, report, skipMetadataRow]);

  const confirmImport = useCallback(async () => {
    setConfirmOpen(false);
    setStep('importing');
    try {
      const res = await apiFetch(endpoint, {
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
      showToast(summaryText(data.summary), data.summary.errors > 0 ? 'error' : 'success');
    } catch (err) {
      console.error('bulk import error:', err);
      showToast('บันทึกไม่สำเร็จ', 'error');
      setStep('preview');
    }
  }, [endpoint, parsedItems, showToast, summaryText]);

  const reset = useCallback(() => {
    setStep('upload');
    setParsedItems([]);
    setDryRun(null);
    setFinalRun(null);
  }, []);

  return {
    step, parsedItems, dryRun, finalRun,
    errorReport, clearErrorReport: () => setErrorReport(null),
    confirmOpen, setConfirmOpen,
    previewPage, setPreviewPage, previewPerPage, setPreviewPerPage,
    handleFile, confirmImport, reset,
  };
}
