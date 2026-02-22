'use client';

import { useEffect, useCallback, ReactNode } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Icon element shown at top */
  icon?: ReactNode;
  /** Title text */
  title: string;
  /** Description text below title */
  description?: string;
  /** Content in the middle (e.g. summary details) */
  children?: ReactNode;
  /** Confirm button label (default: "ยืนยัน") */
  confirmLabel?: string;
  /** Cancel button label (default: "ยกเลิก") */
  cancelLabel?: string;
  /** Confirm button color variant */
  variant?: 'primary' | 'danger';
  /** Confirm button icon */
  confirmIcon?: ReactNode;
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  icon,
  title,
  description,
  children,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  variant = 'primary',
  confirmIcon,
}: ConfirmDialogProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!open) return null;

  const confirmBtnClass = variant === 'danger'
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-[#F4511E] text-white hover:bg-[#D63B0E]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          {icon && (
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-3">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{description}</p>
          )}
        </div>

        {children && <div className="mb-5">{children}</div>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 ${confirmBtnClass}`}
          >
            {confirmIcon}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
