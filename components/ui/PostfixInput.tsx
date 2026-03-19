'use client';

interface PostfixInputProps {
  value: string | number;
  onChange: (value: string) => void;
  postfix: string;
  type?: 'text' | 'number';
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number | string;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  className?: string;
  inputClassName?: string;
  /** Width of the group — default w-fit */
  width?: string;
  /** Compact mode — smaller for summary cards / tables */
  compact?: boolean;
}

/**
 * Input with a static postfix label (e.g. ฿, %, ชิ้น, กก.)
 * Style matches DiscountInput (rounded-l input + rounded-r label)
 */
export default function PostfixInput({
  value,
  onChange,
  postfix,
  type = 'number',
  placeholder = '0',
  min,
  max,
  step,
  disabled,
  error,
  helperText,
  className,
  inputClassName,
  width,
  compact,
}: PostfixInputProps) {
  const h = compact ? 'py-1.5' : 'py-2';
  const fontSize = compact ? 'text-sm' : 'text-sm';

  return (
    <div className={className} data-error={error ? 'true' : undefined}>
      <div className={`flex items-stretch ${width || 'w-fit'}`}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={`${h} px-2 ${fontSize} text-right border border-gray-300 dark:border-slate-600 rounded-l-lg rounded-r-none border-r-0 bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]/50 disabled:opacity-40 disabled:cursor-not-allowed ${inputClassName || (compact ? 'w-16' : 'w-24')}`}
        />
        <span className={`px-2 ${h} ${fontSize} font-medium border border-gray-300 dark:border-slate-600 rounded-r-lg bg-gray-50 dark:bg-slate-600 text-gray-500 dark:text-slate-300 flex items-center justify-center min-w-[26px] flex-shrink-0`}>
          {postfix}
        </span>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      {helperText && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}
