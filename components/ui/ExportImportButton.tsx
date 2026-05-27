'use client';

import { forwardRef } from 'react';
import { Upload, Download } from 'lucide-react';
import Button, { type ButtonVariant, type ButtonSize } from './Button';

/**
 * Export / Import buttons with the correct icon baked in.
 *
 * AooCommerce convention (matches user's mental model):
 *   Export = ส่งข้อมูล OUT of the system → Upload icon (arrow UP)
 *   Import = นำข้อมูล INTO the system   → Download icon (arrow DOWN)
 *
 * Always prefer these over building a button with the Upload/Download icon
 * inline — the icons are easy to swap by accident.
 */

interface ImportExportButtonProps extends Omit<React.ComponentProps<typeof Button>, 'icon'> {
  /** Override the visible label (default = "Export" / "Import") */
  label?: React.ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const ExportButton = forwardRef<HTMLButtonElement, ImportExportButtonProps>(
  function ExportButton({ label = 'Export', variant = 'secondary', size = 'md', children, ...rest }, ref) {
    return (
      <Button ref={ref} variant={variant} size={size} icon={<Upload className="w-4 h-4" />} {...rest}>
        {children ?? label}
      </Button>
    );
  }
);

export const ImportButton = forwardRef<HTMLButtonElement, ImportExportButtonProps>(
  function ImportButton({ label = 'Import', variant = 'secondary', size = 'md', children, ...rest }, ref) {
    return (
      <Button ref={ref} variant={variant} size={size} icon={<Download className="w-4 h-4" />} {...rest}>
        {children ?? label}
      </Button>
    );
  }
);
