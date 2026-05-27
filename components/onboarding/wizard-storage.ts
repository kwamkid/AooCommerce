'use client';

import { useEffect, useState } from 'react';

export const WIZARD_KEYS = {
  company:   'aoo-wiz-company',
  channels:  'aoo-wiz-channels',
  warehouse: 'aoo-wiz-warehouse',
  carriers:  'aoo-wiz-carriers',
  payment:   'aoo-wiz-payment',
} as const;

// useState that hydrates from sessionStorage on mount and writes back on change.
// Used by wizard step pages so user-entered data survives going back/forward.
// Cleared in clearWizardState() when the wizard finishes.
export function useWizardState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw);
      // Shallow-merge so newly-added fields in `initial` still get their defaults.
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && initial && typeof initial === 'object' && !Array.isArray(initial)) {
        return { ...(initial as object), ...parsed } as T;
      }
      return parsed as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch { /* quota / private mode: ignore */ }
  }, [key, state]);

  return [state, setState];
}

export function clearWizardState() {
  if (typeof window === 'undefined') return;
  try {
    Object.values(WIZARD_KEYS).forEach(k => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}
