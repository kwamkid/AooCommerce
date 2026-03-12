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
  /** Width of input — default w-full */
  width?: string;
}

/**
 * Input with a static postfix label (e.g. ฿, %, ชิ้น, กก.)
 *
 * Usage:
 *   <PostfixInput value={price} onChange={setPrice} postfix="฿" />
 *   <PostfixInput value={qty} onChange={setQty} postfix="ชิ้น" type="number" />
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
}: PostfixInputProps) {
  return (
    <div className={className} data-error={error ? 'true' : undefined}>
      <div className={`flex rounded-lg border ${error ? 'border-red-400' : 'border-gray-300 dark:border-slate-500'} overflow-hidden ${width || 'w-fit'}`}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className={`h-[42px] px-3 text-base text-gray-900 dark:text-white bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#F4511E] border-none disabled:opacity-40 disabled:cursor-not-allowed ${inputClassName || 'w-28'}`}
        />
        <span className="px-3 h-[42px] text-base font-medium border-l border-gray-300 dark:border-slate-500 bg-gray-50 dark:bg-slate-700 text-gray-500 dark:text-slate-400 flex items-center flex-shrink-0">
          {postfix}
        </span>
      </div>
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
      {helperText && <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}
