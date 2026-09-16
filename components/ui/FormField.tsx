import type { ReactNode } from 'react';

interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}

/** Label + control + helper text wrapper for controls without built-in labels. */
export default function FormField({ label, hint, children }: FormFieldProps) {
  return (
    <div className="form-field">
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="form-field-hint">{hint}</p>}
    </div>
  );
}
