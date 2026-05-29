'use client';

import { type ReactNode } from 'react';
import Card from './Card';
import ReorderArrows from './ReorderArrows';

interface ListRowReorder {
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
  disabled?: boolean;
}

interface ListRowProps {
  /** Optional far-left up/down reorder column. */
  reorder?: ListRowReorder;
  /** Left icon — caller styles the box (commonly w-8 h-8 colored square). */
  icon: ReactNode;
  /** Primary line of text. */
  title: ReactNode;
  /** Secondary line under the title. */
  subtitle?: ReactNode;
  /** Right-side actions slot — Toggle, Edit/Delete buttons, ActionMenu, etc. */
  actions?: ReactNode;
  /** Dim the row when the row's underlying record is inactive. */
  inactive?: boolean;
  /** Extra wrapper class on the outer Card. */
  className?: string;
}

/**
 * Horizontal "list row" card used by sortable settings lists
 * (payment-channels, pos-terminals, …). Layout:
 *
 *   [reorder?] [icon] [title / subtitle] [actions]
 *
 * The icon and actions are pure slots so each caller keeps full control
 * over branding (bank logo vs colored box) and action mix (Toggle alone vs
 * Edit + Delete + dropdown). For richer rows that need expandable bodies
 * or clickable avatars, render the row manually rather than forcing the
 * abstraction.
 */
export default function ListRow({
  reorder,
  icon,
  title,
  subtitle,
  actions,
  inactive,
  className,
}: ListRowProps) {
  const wrapperCls = ['overflow-hidden', inactive ? 'opacity-60' : '', className]
    .filter(Boolean)
    .join(' ');

  return (
    <Card padding="none" className={wrapperCls}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        {reorder && <ReorderArrows {...reorder} />}
        <span className="flex-shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-white truncate">{title}</h3>
          {subtitle && (
            <p className="text-sm text-gray-500 dark:text-slate-400 truncate">{subtitle}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </Card>
  );
}
