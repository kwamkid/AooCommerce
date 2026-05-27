'use client';

import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';

interface BulkPreviewBarProps {
  /** Title shown next to the icon (e.g. "ตรวจสอบรายการก่อนสร้าง"). */
  title?: ReactNode;
  /** Icon shown before the title (e.g. <PackagePlus />). */
  icon?: ReactNode;
  /** Inline badges describing dry-run outcome (created N / updated N / errors N). */
  badges?: ReactNode;
  /** Confirm button label — default "ยืนยัน". */
  confirmLabel?: ReactNode;
  /** Disable confirm — e.g. when 0 valid rows to commit. */
  confirmDisabled?: boolean;
  /** Triggered when user clicks confirm. */
  onConfirm: () => void;
  /** Triggered when user clicks cancel — typically resets the upload state. */
  onCancel: () => void;
}

/**
 * Sticky preview header bar shown above the dry-run results table.
 * Stays visible as the user scrolls through long lists so the confirm
 * button is always reachable.
 */
export default function BulkPreviewBar({
  title,
  icon,
  badges,
  confirmLabel = 'ยืนยัน',
  confirmDisabled = false,
  onConfirm,
  onCancel,
}: BulkPreviewBarProps) {
  return (
    <Card padding="sm" className="sticky top-0 z-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {icon}
          {title && <span className="font-semibold text-gray-900 dark:text-white">{title}</span>}
          {badges}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={onCancel}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={onConfirm} disabled={confirmDisabled} iconRight={<ArrowRight className="w-4 h-4" />}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Card>
  );
}
