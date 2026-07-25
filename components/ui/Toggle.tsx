'use client';

import { Loader2 } from 'lucide-react';

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** Shows a spinner inside the thumb + disables interaction. Use during async save. */
  loading?: boolean;
  /** Accessibility label — read by screen readers. */
  'aria-label'?: string;
}

/**
 * iOS-style on/off switch. Used in settings/* pages and feature toggles.
 *
 * Replaces local Toggle copies that lived in app/settings/{warehouses,chat-channels,
 * pos-terminals,payment-channels}/page.tsx.
 */
export default function Toggle({ checked, onChange, disabled, loading, ...rest }: ToggleProps) {
  const isInteractive = !disabled && !loading;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={loading || undefined}
      onClick={() => isInteractive && onChange(!checked)}
      disabled={!isInteractive}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-gray-300 dark:bg-slate-600'
      } ${
        loading ? 'cursor-wait' : disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
      }`}
      {...rest}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform flex items-center justify-center ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      >
        {loading && <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />}
      </span>
    </button>
  );
}
