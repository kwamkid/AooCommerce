'use client';

import { AlertCircle, AlertTriangle, FileSpreadsheet, Download } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';

export interface BulkErrorReport {
  headerIssues: string[];
  rowIssues: string[];
  otherIssues: string[];
}

interface BulkErrorModalProps {
  /** Pass the report to open; pass null to close. */
  report: BulkErrorReport | null;
  onClose: () => void;
  /** Optional handler — when present, a "ดาวน์โหลด Template ใหม่" button shows in the footer. */
  onDownloadTemplate?: () => void | Promise<void>;
}

/**
 * Shared error modal for bulk imports. Groups validation errors into 3 sections:
 *   - Header / Column      (missing columns)
 *   - ข้อมูลในแถว           (per-row issues, brand/category not found, etc.)
 *   - อื่นๆ                 (file read errors, server errors)
 *
 * Each section is hidden when empty so the user only sees relevant info.
 */
export default function BulkErrorModal({ report, onClose, onDownloadTemplate }: BulkErrorModalProps) {
  const total =
    (report?.headerIssues.length || 0) +
    (report?.rowIssues.length || 0) +
    (report?.otherIssues.length || 0);

  return (
    <Modal
      open={!!report}
      onClose={onClose}
      size="lg"
      icon={<AlertCircle className="w-6 h-6 text-red-500" />}
      title="ไฟล์มีปัญหา"
      footer={
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          {onDownloadTemplate && (
            <Button
              variant="secondary"
              icon={<Download className="w-4 h-4" />}
              onClick={() => {
                onClose();
                void onDownloadTemplate();
              }}
            >
              ดาวน์โหลด Template ใหม่
            </Button>
          )}
          <Button variant="primary" onClick={onClose}>
            ปิด
          </Button>
        </div>
      }
    >
      {report && (
        <div className="p-5 space-y-4 text-sm">
          <p className="text-gray-600 dark:text-slate-400">
            พบ <strong className="text-red-600 dark:text-red-400">{total} ปัญหา</strong>
            {' '}— กรุณาแก้ทั้งหมดในไฟล์ Excel แล้วอัพโหลดใหม่
          </p>

          {report.headerIssues.length > 0 && (
            <ErrorSection
              icon={<FileSpreadsheet className="w-4 h-4" />}
              title="Header / Column"
              tone="red"
              issues={report.headerIssues}
            />
          )}

          {report.rowIssues.length > 0 && (
            <ErrorSection
              icon={<AlertCircle className="w-4 h-4" />}
              title="ข้อมูลในแถว"
              tone="red"
              issues={report.rowIssues}
              scrollable
            />
          )}

          {report.otherIssues.length > 0 && (
            <ErrorSection
              icon={<AlertTriangle className="w-4 h-4" />}
              title="อื่นๆ"
              tone="amber"
              issues={report.otherIssues}
            />
          )}
        </div>
      )}
    </Modal>
  );
}

interface ErrorSectionProps {
  icon: React.ReactNode;
  title: string;
  issues: string[];
  tone: 'red' | 'amber';
  scrollable?: boolean;
}

function ErrorSection({ icon, title, issues, tone, scrollable = false }: ErrorSectionProps) {
  const wrapper =
    tone === 'amber'
      ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
      : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300';
  const bodyTone =
    tone === 'amber' ? 'text-amber-700 dark:text-amber-300' : 'text-red-700 dark:text-red-300';

  return (
    <div className={`border rounded-lg p-3 ${wrapper}`}>
      <h4 className="font-semibold mb-2 flex items-center gap-2">
        {icon}
        {title} ({issues.length})
      </h4>
      <ul className={`space-y-1 pl-6 list-disc ${bodyTone} ${scrollable ? 'max-h-72 overflow-y-auto' : ''}`}>
        {issues.map((msg, i) => (
          <li key={i}>{msg}</li>
        ))}
      </ul>
    </div>
  );
}
