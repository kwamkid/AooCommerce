import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle, X } from 'lucide-react';

export type AlertTone = 'danger' | 'warning' | 'info' | 'success';

interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'title'> {
  tone?: AlertTone;
  /** Title row (bold). Optional — body alone is fine. */
  title?: ReactNode;
  /** Body content. */
  children?: ReactNode;
  /** Override the default leading icon. */
  icon?: ReactNode;
  /** If provided, shows an X close button calling this on click. */
  onClose?: () => void;
}

const TONE_CLASSES: Record<AlertTone, { bg: string; border: string; text: string; icon: ReactNode }> = {
  danger:  { bg: 'bg-red-50 dark:bg-red-900/20',       border: 'border-red-200 dark:border-red-800',     text: 'text-red-700 dark:text-red-400',     icon: <AlertCircle className="w-5 h-5 text-red-500" /> },
  warning: { bg: 'bg-amber-50 dark:bg-amber-900/20',   border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', icon: <AlertTriangle className="w-5 h-5 text-amber-500" /> },
  info:    { bg: 'bg-blue-50 dark:bg-blue-900/20',     border: 'border-blue-200 dark:border-blue-800',   text: 'text-blue-700 dark:text-blue-300',   icon: <Info className="w-5 h-5 text-blue-500" /> },
  success: { bg: 'bg-green-50 dark:bg-green-900/20',   border: 'border-green-200 dark:border-green-800', text: 'text-green-700 dark:text-green-400', icon: <CheckCircle className="w-5 h-5 text-green-500" /> },
};

/**
 * Colored info/warning/error banner with icon + optional title + body.
 *
 * Replaces inline `<div className="bg-red-50 border border-red-200 ...">` etc found
 * across the app (~15+ inline copies).
 */
export default function Alert({
  tone = 'info',
  title,
  icon,
  onClose,
  className = '',
  children,
  ...rest
}: AlertProps) {
  const t = TONE_CLASSES[tone];
  return (
    <div
      className={`${t.bg} border ${t.border} rounded-lg p-4 flex items-start gap-3 ${className}`}
      {...rest}
    >
      <div className="flex-shrink-0 mt-0.5">{icon ?? t.icon}</div>
      <div className={`flex-1 min-w-0 ${t.text}`}>
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={title ? 'text-sm mt-1' : ''}>{children}</div>}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className={`flex-shrink-0 ${t.text} hover:opacity-70 transition-opacity`}
          aria-label="ปิด"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  );
}
