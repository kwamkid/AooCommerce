'use client';

import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { Upload, Download, FileSpreadsheet, Loader2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface BulkUploadCardProps {
  /** Title shown above buttons (default = generic 3-step description). */
  title?: ReactNode;
  /** Subtitle / brief description shown under the title. */
  subtitle?: ReactNode;
  /** Triggered when the user picks a file. */
  onFile: (file: File) => void;
  /** Optional template download handler. When omitted, the download button is hidden. */
  onDownloadTemplate?: () => void | Promise<void>;
  /** Disable upload (e.g., while options are still loading). */
  disabled?: boolean;
  /** Label override for the upload button. */
  uploadLabel?: ReactNode;
  /** Label override for the template-download button. */
  downloadLabel?: ReactNode;
  /** Help text rendered inside the gray bottom box. */
  help?: ReactNode;
  /** File input accept attr — defaults to common spreadsheet formats. */
  accept?: string;
}

/**
 * Shared "drop / pick a file" card used by all /products/bulk/* pages.
 * Standardizes layout, button styles, and help-text formatting.
 */
export default function BulkUploadCard({
  title,
  subtitle,
  onFile,
  onDownloadTemplate,
  disabled = false,
  uploadLabel,
  downloadLabel = 'ดาวน์โหลด Template',
  help,
  accept = '.xlsx,.xls,.csv',
}: BulkUploadCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFile(file);
    // reset so the same file can be re-selected
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card padding="lg">
      <div className="text-center space-y-5">
        <div className="w-16 h-16 bg-gray-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto">
          <FileSpreadsheet className="w-8 h-8 text-gray-400" />
        </div>
        {(title || subtitle) && (
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
            )}
            {subtitle && (
              <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">{subtitle}</p>
            )}
          </div>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {onDownloadTemplate && (
            <Button variant="secondary" onClick={() => void onDownloadTemplate()} icon={<Download className="w-4 h-4" />}>
              {downloadLabel}
            </Button>
          )}
          <Button
            variant="primary"
            size="lg"
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            icon={disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          >
            {disabled ? 'กำลังโหลด...' : (uploadLabel || 'อัพโหลดไฟล์')}
          </Button>
          <input ref={fileRef} type="file" accept={accept} onChange={handleChange} className="hidden" />
        </div>
        {help && (
          <div className="text-left bg-gray-50 dark:bg-slate-700/50 rounded-lg p-4 text-sm text-gray-600 dark:text-slate-400">
            {help}
          </div>
        )}
      </div>
    </Card>
  );
}
