'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';

interface PageHeaderProps {
  /** Page title (h1) — text or any node */
  title: ReactNode;
  /** Optional subtitle/description shown below the title */
  subtitle?: ReactNode;
  /** When set, shows a back arrow that navigates here. Pass empty string or `back="-1"` for router.back(). */
  backHref?: string;
  /** Element rendered on the right side of the header (buttons, badges, etc.) */
  actions?: ReactNode;
  /** Optional icon shown left of the title */
  icon?: ReactNode;
}

/**
 * Shared page header: back arrow + (icon + title + subtitle) + right-side actions slot.
 * Used inside Layout content for sub-pages that need their own title block
 * (e.g. /products/bulk/create, /orders/[id]).
 */
export default function PageHeader({ title, subtitle, backHref, actions, icon }: PageHeaderProps) {
  const router = useRouter();
  const handleBack = () => {
    if (backHref === '-1' || backHref === '') {
      router.back();
    } else if (backHref) {
      router.push(backHref);
    }
  };

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3 min-w-0">
        {backHref !== undefined && (
          <button
            onClick={handleBack}
            aria-label="ย้อนกลับ"
            className="flex-shrink-0 p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
        )}
        {icon && <div className="flex-shrink-0 pt-1">{icon}</div>}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{title}</h1>
          {subtitle && (
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-0.5">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex-shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}
