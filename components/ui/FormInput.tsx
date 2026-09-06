'use client';

import {
  forwardRef, useImperativeHandle, useRef, useState, useCallback,
  type InputHTMLAttributes, type ReactNode,
} from 'react';
import { AlertCircle } from 'lucide-react';

export type FormInputSize = 'sm' | 'md' | 'lg';

/**
 * Imperative handle exposed via `ref` — lets a parent run validation
 * or focus the input from outside (e.g. on form submit).
 *
 * Use with the {@link useFormValidation} hook for batch validate-all-fields:
 * @example
 *   const form = useFormValidation();
 *   <FormInput ref={form.register('name')} required ... />
 *   <FormInput ref={form.register('email')} required pattern="^[^@]+@[^@]+$" ... />
 *   // on submit:
 *   if (!form.validateAll()) return;
 */
export interface FormInputHandle {
  /** Run validation, store the error, return `true` if valid. */
  validate: () => boolean;
  /** Clear the displayed error without re-validating. */
  clearError: () => void;
  /** Move keyboard focus to the input. */
  focus: () => void;
  /** Read-only — current displayed error (external `error` prop OR internal validation error). */
  getError: () => string | null;
}

interface FormInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Label above the input. If omitted, no label is rendered. */
  label?: ReactNode;
  /** Asterisk on label + enforced by validation (empty string fails). */
  required?: boolean;
  /** Override the default "ต้องกรอกข้อมูล" required message. */
  requiredMessage?: string;
  /** Custom error message when `pattern` regex fails. Default: "รูปแบบไม่ถูกต้อง". */
  patternMessage?: string;
  /** Custom validator — return error string to fail, return null/undefined to pass. */
  validate?: (value: string) => string | null | undefined;
  /** Helper text below the input (gray). Hidden when error is shown. */
  hint?: ReactNode;
  /** External error (server-side, cross-field). Overrides internal validation error. */
  error?: ReactNode;
  /** Leading icon (left of input). */
  icon?: ReactNode;
  /** Trailing label (right of input — e.g. "฿", "%", "kg"). */
  postfix?: ReactNode;
  /** Default 'md'. Affects height + padding. */
  size?: FormInputSize;
  /** Wraps the whole component (label + input + hint). For grid layouts. */
  containerClassName?: string;
}

const SIZE_CLASSES: Record<FormInputSize, string> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-base',
  lg: 'h-11 text-base',
};

/**
 * Standard form text input with built-in label, validation, error, hint, icon, and postfix.
 *
 * Designed to be the ONE place to style inputs in AooCommerce — change the focus
 * ring color here and every form across the app picks it up.
 *
 * ## Validation behavior
 * - Built-in rules: `required`, `minLength`, `maxLength`, `min`, `max`, `pattern`, `validate`
 * - Runs **on blur** after first user interaction
 * - Re-runs on **each change** once an error is showing (clears as user fixes)
 * - Parent can trigger via `ref.current.validate()` on form submit
 * - External `error` prop overrides internal validation (use for server-side errors)
 *
 * @example  Standalone with built-in validation
 *   <FormInput
 *     label="อีเมล"
 *     required
 *     pattern="^[^@]+@[^@]+\\.[^@]+$"
 *     patternMessage="รูปแบบอีเมลไม่ถูกต้อง"
 *     value={email}
 *     onChange={(e) => setEmail(e.target.value)}
 *   />
 *
 * @example  Form submit with validateAll (see useFormValidation)
 *   const form = useFormValidation();
 *   <FormInput ref={form.register('name')} label="ชื่อ" required />
 *   <FormInput ref={form.register('phone')} label="เบอร์" pattern="^\\d{10}$" />
 *   const onSave = () => {
 *     if (!form.validateAll()) return;  // focuses first invalid + shows all errors
 *     submit();
 *   };
 *
 * @example  Custom validator
 *   <FormInput
 *     label="รหัสสินค้า"
 *     validate={(v) => v.includes(' ') ? 'ห้ามมีช่องว่าง' : null}
 *   />
 */
const FormInput = forwardRef<FormInputHandle, FormInputProps>(function FormInput(
  {
    label,
    required,
    requiredMessage,
    patternMessage,
    validate,
    hint,
    error,
    icon,
    postfix,
    size = 'md',
    containerClassName = '',
    className = '',
    id,
    value,
    onChange,
    onBlur,
    minLength,
    maxLength,
    min,
    max,
    pattern,
    type,
    ...rest
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalError, setInternalError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const inputId = id ?? (label ? `fi-${Math.random().toString(36).slice(2, 8)}` : undefined);

  // ── Validation runner ──────────────────────────────────
  const runValidation = useCallback((raw: unknown): string | null => {
    const val = raw == null ? '' : String(raw);
    if (required && !val.trim()) return requiredMessage ?? 'ต้องกรอกข้อมูล';
    if (val === '') return null; // empty + not required → valid

    if (minLength != null && val.length < minLength) {
      return `ต้องมีอย่างน้อย ${minLength} ตัวอักษร`;
    }
    if (maxLength != null && val.length > maxLength) {
      return `ไม่เกิน ${maxLength} ตัวอักษร`;
    }
    if (type === 'number') {
      const num = Number(val);
      if (!Number.isFinite(num)) return 'ต้องเป็นตัวเลข';
      if (min != null && num < Number(min)) return `ต้องไม่ต่ำกว่า ${min}`;
      if (max != null && num > Number(max)) return `ต้องไม่เกิน ${max}`;
    }
    if (pattern) {
      try {
        const re = new RegExp(pattern);
        if (!re.test(val)) return patternMessage ?? 'รูปแบบไม่ถูกต้อง';
      } catch { /* invalid regex pattern — skip */ }
    }
    if (validate) {
      const result = validate(val);
      if (result) return result;
    }
    return null;
  }, [required, requiredMessage, type, min, max, minLength, maxLength, pattern, patternMessage, validate]);

  // ── Imperative handle exposed to parent ────────────────
  useImperativeHandle(ref, () => ({
    validate: () => {
      const err = runValidation(value);
      setInternalError(err);
      setTouched(true);
      return !err;
    },
    clearError: () => {
      setInternalError(null);
    },
    focus: () => {
      inputRef.current?.focus();
    },
    getError: () => (error ? String(error) : internalError),
  }), [value, runValidation, error, internalError]);

  // ── Event handlers — wrap user-provided ones ───────────
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setTouched(true);
    const err = runValidation(e.target.value);
    setInternalError(err);
    onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Re-validate on change ONLY if user has already triggered validation
    // (so errors clear live as the user fixes them, but we don't nag before first blur).
    if (touched) {
      const err = runValidation(e.target.value);
      setInternalError(err);
    }
    onChange?.(e);
  };

  // ── Render ─────────────────────────────────────────────
  const displayError = error ?? internalError;
  const hasError = !!displayError;
  const sizeClass = SIZE_CLASSES[size];

  const inputBase = `w-full ${sizeClass} bg-white dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-2 transition-colors`;
  const borderClass = hasError
    ? 'border border-red-400 focus:ring-red-400/40 focus:border-red-500'
    : 'border border-gray-300 dark:border-slate-600 focus:ring-primary/40 focus:border-primary';
  const paddingLeftClass = icon ? 'pl-9' : 'pl-3';
  const paddingRightClass = postfix ? 'pr-12' : hasError ? 'pr-9' : 'pr-3';

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-gray-400 pointer-events-none">
            {icon}
          </span>
        )}
        <input
          ref={inputRef}
          id={inputId}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          min={min}
          max={max}
          pattern={pattern}
          type={type}
          value={value}
          onChange={handleChange}
          onBlur={handleBlur}
          className={`${inputBase} ${borderClass} ${paddingLeftClass} ${paddingRightClass} ${className}`}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...rest}
        />
        {/* Error icon on right (when no postfix takes the slot) */}
        {hasError && !postfix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-red-500 pointer-events-none">
            <AlertCircle className="w-4 h-4" />
          </span>
        )}
        {postfix && (
          // pointer-events-none ให้คลิกทะลุไปโฟกัส input ได้เมื่อ postfix เป็นข้อความ (฿, kg)
          // แต่ปุ่มข้างใน (ตาเปิด/ปิดรหัส) ต้องกดได้ — ไม่งั้นปุ่มโชว์แต่กดไม่ติด (API Key ของ Beam 7 ก.ย. 2026)
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-gray-500 dark:text-slate-400 text-sm pointer-events-none [&_button]:pointer-events-auto [&_a]:pointer-events-auto">
            {postfix}
          </span>
        )}
      </div>
      {hasError ? (
        <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
          {displayError}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-gray-500 dark:text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
});

export default FormInput;
