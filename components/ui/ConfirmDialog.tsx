'use client';

import type { ReactNode } from 'react';
import Button from './Button';
import Modal from './Modal';

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
  /** Show loading state on confirm button */
  loading?: boolean;
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
  loading,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} size="md" hideCloseButton>
      <div>
        <div className="text-center mb-5">
          {icon && (
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center mx-auto mb-3">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h3>
          {description && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 whitespace-pre-line">{description}</p>
          )}
        </div>

        {children && <div className="mb-5">{children}</div>}

        {/* ปุ่มของกลาง — เดิมเขียนสี/ขนาดเองจนเพี้ยนจาก <Button> ที่ใช้ทั้งระบบ */}
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={onClose}>{cancelLabel}</Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            fullWidth
            loading={loading}
            icon={confirmIcon}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
