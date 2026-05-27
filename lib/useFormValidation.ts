'use client';

import { useRef, useCallback } from 'react';
import type { FormInputHandle } from '@/components/ui/FormInput';

/**
 * Collects refs from `<FormInput>` components and validates them all at once.
 *
 * Drop into any form to:
 *  - Trigger validation on every field at submit time
 *  - Auto-focus the first invalid field
 *  - Know if the form is valid before sending to the server
 *
 * Each FormInput's built-in validation rules (`required`, `pattern`, `validate`,
 * `min`/`max`/`minLength`/`maxLength`) run automatically. External errors set
 * via the `error` prop are respected.
 *
 * @example
 *   const form = useFormValidation();
 *
 *   <FormInput ref={form.register('name')} label="ชื่อ" required value={name} onChange={...} />
 *   <FormInput ref={form.register('email')} label="อีเมล" required pattern="^[^@]+@[^@]+$" value={email} onChange={...} />
 *
 *   const handleSubmit = async () => {
 *     if (!form.validateAll()) return;  // shows errors + focuses first invalid
 *     await submit({ name, email });
 *   };
 *
 * @example  Reset errors after successful submit:
 *   await submit(...);
 *   form.clearAll();
 */
export interface UseFormValidationReturn {
  /** Register a FormInput with the form. Returns a ref callback. */
  register: (name: string) => (handle: FormInputHandle | null) => void;
  /** Validate every registered field. Returns `true` if all pass. */
  validateAll: () => boolean;
  /** Clear errors on all registered fields. */
  clearAll: () => void;
  /** Get the current error for a single field (null if valid). */
  getError: (name: string) => string | null;
}

export function useFormValidation(): UseFormValidationReturn {
  const handles = useRef<Record<string, FormInputHandle | null>>({});
  const order = useRef<string[]>([]);

  const register = useCallback((name: string) => (handle: FormInputHandle | null) => {
    handles.current[name] = handle;
    if (handle && !order.current.includes(name)) {
      order.current.push(name);
    }
  }, []);

  const validateAll = useCallback(() => {
    let allValid = true;
    let firstInvalid: FormInputHandle | null = null;
    // Iterate in registration order so focus lands on the topmost failing field
    for (const name of order.current) {
      const handle = handles.current[name];
      if (!handle) continue;
      const valid = handle.validate();
      if (!valid && !firstInvalid) {
        firstInvalid = handle;
        allValid = false;
      }
    }
    firstInvalid?.focus();
    return allValid;
  }, []);

  const clearAll = useCallback(() => {
    for (const handle of Object.values(handles.current)) {
      handle?.clearError();
    }
  }, []);

  const getError = useCallback((name: string) => {
    return handles.current[name]?.getError() ?? null;
  }, []);

  return { register, validateAll, clearAll, getError };
}
