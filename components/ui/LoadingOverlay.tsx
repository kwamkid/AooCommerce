'use client';

import { Loader2 } from 'lucide-react';

interface LoadingOverlayProps {
  isOpen: boolean;
  title: string;
  message?: string;
  progress?: number;         // 0-100
  onCancel?: () => void;
  cancelLabel?: string;
}

export default function LoadingOverlay({
  isOpen,
  title,
  message,
  progress,
  onCancel,
  cancelLabel = 'ยกเลิก',
}: LoadingOverlayProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[90vw] max-w-sm p-6 space-y-4 text-center">
        {/* Spinner */}
        <div className="flex justify-center">
          <Loader2 className="w-10 h-10 text-[#F4511E] animate-spin" />
        </div>

        {/* Title */}
        <h3 className="text-base font-medium text-gray-900 dark:text-white">
          {title}
        </h3>

        {/* Message */}
        {message && (
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {message}
          </p>
        )}

        {/* Progress bar */}
        {progress !== undefined && (
          <div className="space-y-1.5">
            <div className="w-full h-2.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F4511E] rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-slate-500">
              {progress}%
            </p>
          </div>
        )}

        {/* Warning */}
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
          กรุณาอย่าปิดหน้านี้ระหว่างดำเนินการ
        </p>

        {/* Cancel button */}
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 text-sm font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            {cancelLabel}
          </button>
        )}
      </div>
    </div>
  );
}
