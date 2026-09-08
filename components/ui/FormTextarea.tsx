'use client';

// ช่องข้อความหลายบรรทัด — คู่ของ FormInput (หน้าตา/ระยะ/สีขอบชุดเดียวกัน)
//
// เดิมทุกหน้าพิมพ์ `<textarea className="w-full px-4 py-2.5 border …">` กันเอง
// (บรอดแคสต์ · ที่อยู่ · หมายเหตุ) แก้สีโฟกัสทีหนึ่งต้องไล่แก้ทุกหน้า
// ตัวนี้มีป้าย · คำอธิบาย · ตัวนับอักขระ (เมื่อส่ง maxLength) · ข้อความผิดพลาด ให้ครบในตัว
import { useId, type TextareaHTMLAttributes } from 'react';

interface FormTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'> {
  label?: string;
  hint?: string;
  error?: string | null;
  /** โชว์ตัวนับ "n/max" ใต้ช่อง (ต้องส่ง maxLength ด้วย) — ค่าเริ่มต้นเปิดเมื่อมี maxLength */
  showCount?: boolean;
  className?: string;
  containerClassName?: string;
}

export default function FormTextarea({
  label, hint, error, showCount, className = '', containerClassName = '',
  id, required, maxLength, value, rows = 4, ...rest
}: FormTextareaProps) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  const hasError = !!error;
  const length = typeof value === 'string' ? value.length : 0;
  const count = (showCount ?? maxLength != null) && maxLength != null;

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={textareaId} className="field-label">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <textarea
        id={textareaId}
        required={required}
        maxLength={maxLength}
        value={value}
        rows={rows}
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
        className={`w-full px-3 py-2.5 text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg border focus:outline-none focus:ring-2 transition-colors resize-none ${
          hasError
            ? 'border-red-400 focus:ring-red-400/40 focus:border-red-500'
            : 'border-gray-300 dark:border-slate-600 focus:ring-primary/40 focus:border-primary'
        } ${className}`}
        {...rest}
      />
      {(hasError || hint || count) && (
        <div className="mt-1 flex items-start justify-between gap-3">
          {hasError ? (
            <p id={`${textareaId}-error`} className="helper-text text-red-600 dark:text-red-400">{error}</p>
          ) : hint ? (
            <p id={`${textareaId}-hint`} className="helper-text">{hint}</p>
          ) : <span />}
          {count && (
            <span className={`helper-text tabular-nums flex-shrink-0 ${length > maxLength ? 'text-red-600 dark:text-red-400' : ''}`}>
              {length.toLocaleString()}/{maxLength.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
