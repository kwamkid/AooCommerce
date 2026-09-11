// Path: components/products/form/parts.tsx
//
// Small pieces shared by ProductFormCard + VariantOptionsEditor (error line · number input look ·
// sellable-stock text) — one place so the card and the variant table read the same.
import { formatNumber } from '@/lib/utils/format';

// Length limits — Shopee is the reference (owner 12 ก.ย. 2026). Shopee TH: item name 20–120
// (the edit page's Shopee tab already enforces 20/120) · tier-variation option value ≤ 20.
export const PRODUCT_NAME_MAX = 120;
export const SHOPEE_NAME_MIN = 20;
export const OPTION_VALUE_MAX = 20;

export const ERROR_TEXT = 'mt-1 text-sm text-red-600 dark:text-red-400';

/** Validation message under a field — every error must be visible next to its field */
export function FieldError({ text }: { text?: string | null }) {
  if (!text) return null;
  return <p className={ERROR_TEXT}>{text}</p>;
}

const NUMBER_BASE =
  'w-full h-[42px] px-3 text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-colors';

/** className for `NumberInput` — same frame as FormInput, red border on error */
export function numberInputClass(error?: boolean, align: 'left' | 'right' = 'left'): string {
  return `${NUMBER_BASE} ${align === 'right' ? 'text-right' : ''} ${
    error ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-slate-600'
  }`;
}

/** พร้อมขาย: unknown = "-" · 0 = red "หมด" · negative = red number */
export function StockText({ available }: { available?: number | null }) {
  if (available == null) return <span className="text-gray-400 dark:text-slate-500">-</span>;
  if (available <= 0) {
    return (
      <span className="font-medium text-red-600 dark:text-red-400 tabular-nums">
        {available === 0 ? 'หมด' : formatNumber(available)}
      </span>
    );
  }
  return <span className="text-gray-900 dark:text-white tabular-nums">{formatNumber(available)}</span>;
}
