'use client';

import { useLayoutEffect, useRef, useState } from 'react';

interface PostfixInputProps {
  value: string | number;
  onChange: (value: string) => void;
  onBlur?: () => void;
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
  width?: string;
  compact?: boolean;
}

/**
 * Input with a postfix label inside the border (no bg on postfix).
 * Style: [ 269 ฿ ] — postfix is just text inside the input area.
 */
export default function PostfixInput({
  value,
  onChange,
  onBlur,
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

  // Measure the postfix so long labels ("ออเดอร์", "นาที", "ครั้ง") never overlap the value
  const postfixRef = useRef<HTMLSpanElement>(null);
  const [postfixWidth, setPostfixWidth] = useState(0);

  useLayoutEffect(() => {
    const el = postfixRef.current;
    if (!el) return;
    const measure = () => setPostfixWidth(el.offsetWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [postfix]);

  // right-2 offset (8px) + gap before the value (6px)
  const padRight = postfixWidth ? postfixWidth + 14 : undefined;

  return (
    <div className={className} data-error={error ? 'true' : undefined}>
      <div className={`relative ${width || 'w-fit'}`}>
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          style={padRight ? { paddingRight: padRight } : undefined}
          className={`${h} px-2 pr-6 ${fontSize} text-right border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-40 disabled:cursor-not-allowed ${inputClassName || (compact ? 'w-full' : 'w-24')}`}
        />
        <span ref={postfixRef} className={`absolute right-2 top-1/2 -translate-y-1/2 ${fontSize} text-gray-400 dark:text-slate-500 pointer-events-none whitespace-nowrap`}>
          {postfix}
        </span>
      </div>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      {helperText && <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">{helperText}</p>}
    </div>
  );
}
