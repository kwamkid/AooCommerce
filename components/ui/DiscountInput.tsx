'use client';

export type DiscountType = 'percent' | 'fixed_discount';

interface DiscountInputProps {
  value: string;
  discountType: DiscountType;
  onValueChange: (value: string) => void;
  onTypeChange: (type: DiscountType) => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Show helper text below input */
  helperText?: string;
  /** Compact mode for inline/table use — smaller height & font */
  compact?: boolean;
  className?: string;
}

/**
 * Input with toggle button suffix — click to switch between % and ฿.
 * Layout: [ input | % ] or [ input | ฿ ]
 *
 * Usage:
 *   <DiscountInput
 *     value={form.discount_value}
 *     discountType={form.discount_type}
 *     onValueChange={v => setForm(prev => ({ ...prev, discount_value: v }))}
 *     onTypeChange={t => setForm(prev => ({ ...prev, discount_type: t }))}
 *   />
 */
export default function DiscountInput({
  value,
  discountType,
  onValueChange,
  onTypeChange,
  error,
  disabled,
  placeholder = '0',
  helperText,
  compact,
  className,
}: DiscountInputProps) {
  const toggle = () => {
    onTypeChange(discountType === 'percent' ? 'fixed_discount' : 'percent');
  };

  const inputH = compact ? 'h-[30px]' : 'h-[42px]';
  const inputW = compact ? 'w-16' : 'w-28';
  const fontSize = compact ? 'text-sm' : 'text-base';
  const px = compact ? 'px-2' : 'px-3';

  return (
    <div className={className}>
      <div className="flex rounded-lg border border-gray-300 dark:border-slate-500 overflow-hidden w-fit">
        <input
          type="number"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          placeholder={placeholder}
          min={0}
          max={discountType === 'percent' ? 100 : undefined}
          disabled={disabled}
          className={`${inputW} ${inputH} ${px} ${fontSize} text-right text-gray-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F4511E] border-none disabled:opacity-40 disabled:cursor-not-allowed`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          className={`${px} ${inputH} ${fontSize} font-medium border-l border-gray-300 dark:border-slate-500 transition-colors bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-600 disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {discountType === 'percent' ? '%' : '฿'}
        </button>
      </div>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      {helperText && <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}
