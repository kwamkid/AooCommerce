'use client';

import { ArrowUp, ArrowDown } from 'lucide-react';

interface ReorderArrowsProps {
  onMoveUp: () => void;
  onMoveDown: () => void;
  /** Disable the up arrow — typically when the row is at the top of the list. */
  disableUp?: boolean;
  /** Disable the down arrow — typically when the row is at the bottom. */
  disableDown?: boolean;
  /** Disable both — typically while a reorder request is pending. */
  disabled?: boolean;
}

/**
 * Vertical column of up/down arrow buttons for manual list reordering.
 *
 * Used by sortable-list settings pages (payment-channels, pos-terminals, …)
 * to let the user shuffle a list one row at a time. The parent owns the
 * actual reorder logic — typically patching a `sort_order` column via API
 * — and tells this component when to grey out each direction.
 *
 * For drag-and-drop reordering use a drag handle instead; these arrows are
 * for cases where the list is short enough that one-at-a-time clicking is
 * preferable and more accessible.
 */
export default function ReorderArrows({
  onMoveUp,
  onMoveDown,
  disableUp,
  disableDown,
  disabled,
}: ReorderArrowsProps) {
  const baseCls = 'p-0.5 text-gray-500 hover:text-primary dark:text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors';
  return (
    <div className="flex flex-col flex-shrink-0">
      <button
        type="button"
        onClick={onMoveUp}
        disabled={disabled || disableUp}
        className={baseCls}
        aria-label="ย้ายขึ้น"
      >
        <ArrowUp className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={onMoveDown}
        disabled={disabled || disableDown}
        className={baseCls}
        aria-label="ย้ายลง"
      >
        <ArrowDown className="w-4 h-4" />
      </button>
    </div>
  );
}
