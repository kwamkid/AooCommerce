'use client';

import { Percent, Tag } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';

export type PriceMode = 'percent' | 'fixed_discount' | 'fixed_price';

interface PriceDiscountComboProps {
  value: string;
  mode: PriceMode;
  onValueChange: (value: string) => void;
  onModeChange: (mode: PriceMode) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Compact mode — smaller height & font for inline/table use */
  compact?: boolean;
  /** Show red border when invalid */
  error?: boolean;
  className?: string;
}

/**
 * 2-level price input — matches bundle_set discount template:
 *
 *   Level 1:  [ % | ฿ ]     ← ส่วนลด vs ราคาพิเศษ
 *   Level 2:
 *     - ส่วนลด   → [ input | %/฿ toggle ]   (click postfix to switch % ↔ ฿)
 *     - ราคาพิเศษ → [ input | ฿ ]            (static postfix)
 */
export default function PriceDiscountCombo({
  value,
  mode,
  onValueChange,
  onModeChange,
  disabled,
  placeholder = '0',
  compact,
  error,
  className,
}: PriceDiscountComboProps) {
  const h = compact ? 'h-[30px]' : 'h-[42px]';
  const fontSize = compact ? 'text-xs' : 'text-sm';
  const inputW = compact ? 'w-14' : 'w-20';
  const px = compact ? 'px-1.5' : 'px-2';
  const btnPx = compact ? 'px-1.5' : 'px-2';
  const gap = compact ? 'gap-1' : 'gap-2';
  const iconSize = compact ? 'w-3 h-3' : 'w-4 h-4';

  const isFixPrice = mode === 'fixed_price';
  const isDiscount = !isFixPrice; // percent or fixed_discount

  return (
    <div className={`flex items-center ${gap} ${className || ''}`}>
      {/* Level 1: Toggle — ส่วนลด ↔ ราคาพิเศษ */}
      <div className={`flex rounded-lg border border-gray-300 dark:border-slate-500 overflow-hidden ${h} flex-shrink-0`}>
        <Tooltip text="ส่วนลด — ลดเป็น % หรือ บาท จากราคาปกติ">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isFixPrice) {
                onModeChange('percent');
                onValueChange('');
              }
            }}
            className={`${btnPx} ${h} ${fontSize} font-medium transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
              isDiscount
                ? 'bg-primary/10 text-primary'
                : 'bg-gray-50 dark:bg-slate-700 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-600'
            }`}
          >
            <Percent className={iconSize} />
          </button>
        </Tooltip>
        <Tooltip text="ราคาพิเศษ — กำหนดราคาขายตรง เช่น 99 บาท">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              if (!isFixPrice) {
                onModeChange('fixed_price');
                onValueChange('');
              }
            }}
            className={`${btnPx} ${h} ${fontSize} font-medium border-l border-gray-300 dark:border-slate-500 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
              isFixPrice
                ? 'bg-primary/10 text-primary'
                : 'bg-gray-50 dark:bg-slate-700 text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-slate-600'
            }`}
          >
            <Tag className={iconSize} />
          </button>
        </Tooltip>
      </div>

      {/* Level 2: Input */}
      {isFixPrice ? (
        /* ราคาพิเศษ — static ฿ postfix */
        <div className={`flex rounded-lg border overflow-hidden ${h} flex-shrink-0 ${error ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-300 dark:border-slate-500'}`}>
          <input
            type="number"
            value={value}
            onChange={e => onValueChange(e.target.value)}
            placeholder={placeholder}
            min={0}
            disabled={disabled}
            className={`${inputW} ${h} ${px} ${fontSize} text-right text-gray-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary border-none disabled:opacity-40 disabled:cursor-not-allowed`}
          />
          <span className={`${btnPx} ${h} ${fontSize} font-medium border-l border-gray-300 dark:border-slate-500 bg-gray-50 dark:bg-slate-700 text-gray-400 dark:text-slate-500 flex items-center flex-shrink-0`}>
            ฿
          </span>
        </div>
      ) : (
        /* ส่วนลด — clickable %/฿ toggle */
        <div className={`flex rounded-lg border overflow-hidden ${h} flex-shrink-0 ${error ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-300 dark:border-slate-500'}`}>
          <input
            type="number"
            value={value}
            onChange={e => onValueChange(e.target.value)}
            placeholder={placeholder}
            min={0}
            max={mode === 'percent' ? 100 : undefined}
            disabled={disabled}
            className={`${inputW} ${h} ${px} ${fontSize} text-right text-gray-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary border-none disabled:opacity-40 disabled:cursor-not-allowed`}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onModeChange(mode === 'percent' ? 'fixed_discount' : 'percent');
            }}
            className={`${btnPx} ${h} ${fontSize} font-medium border-l border-gray-300 dark:border-slate-500 transition-colors bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {mode === 'percent' ? '%' : '฿'}
          </button>
        </div>
      )}
    </div>
  );
}
