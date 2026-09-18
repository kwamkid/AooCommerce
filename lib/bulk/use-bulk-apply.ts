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

export interface BulkSummary {
  updated: number;
  unchanged: number;
  errors: number;
  /** บางหน้า (สร้างใหม่) รายงานจำนวนที่สร้างแยกจาก updated */
  created?: number;
}

export interface BulkRunResponse<TResult> {
  results: TResult[];
  summary: BulkSummary;
  dry_run?: boolean;
}

/** แถวที่ parse แล้ว — `__rowNum` ไว้อ้างกลับไปยังบรรทัดในไฟล์ตอนรายงาน error */
export interface BulkItemBase {
  __rowNum?: number;
}

export interface UseBulkApplyOptions<TItem> {
  /** ปลายทางของทั้ง dry-run และของจริง (ต่างกันแค่ `dry_run`) */
  endpoint: string;
  /** แปลงชีตเป็นรายการที่จะส่งขึ้น API — ส่วนเดียวที่แต่ละหน้าต่างกันจริง */
  parse: (sheet: ParsedSheet) => { items: TItem[]; emptyMessage?: string };
  /** เทมเพลตที่มีแถวข้อมูลเมตาเหนือ header (บางหน้าของ bulk create) */
  skipMetadataRow?: boolean;
  /** ข้อความสรุปหลัง Apply สำเร็จ — ไม่ส่งมาก็ใช้ "อัพเดท N, ล้มเหลว N" */
  summaryText?: (summary: BulkSummary) => string;
}

export interface BulkApplyState<TItem, TResult> {
  step: BulkStep;
  parsedItems: TItem[];
  dryRun: BulkRunResponse<TResult> | null;
  finalRun: BulkRunResponse<TResult> | null;
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
  if (summary.updated > 0) parts.push(`อัพเดท ${summary.updated}`);
  if (summary.errors > 0) parts.push(`ล้มเหลว ${summary.errors}`);
  return parts.join(', ') || 'เสร็จสิ้น';
}

export function useBulkApply<TItem extends BulkItemBase, TResult>(
  options: UseBulkApplyOptions<TItem>,
): BulkApplyState<TItem, TResult> {
  const { endpoint, parse, summaryText = defaultSummaryText, skipMetadataRow } = options;
  const { showToast } = useToast();

  const [step, setStep] = useState<BulkStep>('upload');
  const [parsedItems, setParsedItems] = useState<TItem[]>([]);
  const [dryRun, setDryRun] = useState<BulkRunResponse<TResult> | null>(null);
  const [finalRun, setFinalRun] = useState<BulkRunResponse<TResult> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewPerPage, setPreviewPerPage] = useState(50);

  const handleFile = useCallback(async (file: File) => {
    try {
      const sheet = rowsToSheet(await readFileToRows(file), { skipMetadataRow });
      if (sheet.rows.length === 0) {
        showToast('ไฟล์ไม่มีข้อมูล (header + อย่างน้อย 1 แถว)', 'error');
        return;
      }

      const { items, emptyMessage } = parse(sheet);
      if (items.length === 0) {
        showToast(emptyMessage || 'ไม่พบแถวที่แก้ไขได้ในไฟล์', 'error');
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
        showToast(data.error || 'ตรวจสอบไม่สำเร็จ', 'error');
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
      showToast('อ่านไฟล์ไม่สำเร็จ', 'error');
      setStep('upload');
    }
  }, [endpoint, parse, showToast, skipMetadataRow]);

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
    confirmOpen, setConfirmOpen,
    previewPage, setPreviewPage, previewPerPage, setPreviewPerPage,
    handleFile, confirmImport, reset,
  };
}
