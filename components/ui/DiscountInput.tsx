'use client';

export type DiscountType = 'percent' | 'fixed_discount';

interface DiscountInputProps {
  value: string;
  discountType: DiscountType;
  onValueChange: (value: string) => void;
  onTypeChange: (type: DiscountType) => void;
  onBlur?: () => void;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
  helperText?: string;
  /** Compact mode for inline/table use — smaller height & font */
  compact?: boolean;
  className?: string;
  /** Width of the entire input group */
  width?: string;
}

/**
 * Input with toggle button suffix — click to switch between % and ฿.
 * Style matches ItemsTable inline discount column.
 * Layout: [ input | % ] or [ input | ฿ ]
 */
export default function DiscountInput({
  value,
  discountType,
  onValueChange,
  onTypeChange,
  onBlur,
  error,
  disabled,
  placeholder = '0',
  helperText,
  compact,
  className,
  width,
}: DiscountInputProps) {
  const toggle = () => {
    onTypeChange(discountType === 'percent' ? 'fixed_discount' : 'percent');
  };

  const h = compact ? 'py-1.5' : 'py-2';
  const fontSize = compact ? 'text-sm' : 'text-sm';

  return (
    <div className={className}>
      <div className={`flex items-stretch ${width || ''}`}>
        <input
          type="number"
          value={value}
          onChange={e => onValueChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          min={0}
          max={discountType === 'percent' ? 100 : undefined}
          step={discountType === 'percent' ? '0.1' : '0.01'}
          disabled={disabled}
          className={`${width ? 'w-full' : compact ? 'w-full' : 'w-24'} ${h} ${fontSize} text-center px-2 border border-gray-300 dark:border-slate-600 rounded-l-lg rounded-r-none border-r-0 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed`}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={toggle}
          className={`px-2 ${h} text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-500 transition-colors min-w-[26px] flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          {discountType === 'percent' ? '%' : '฿'}
        </button>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      {helperText && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}
