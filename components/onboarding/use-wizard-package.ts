'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

interface WizardPackage {
  stockEnabled: boolean;
  maxWarehouses: number | null;
  loaded: boolean;
}

// Fetches the active subscription's package gates once per session so the
// wizard can hide steps the current plan doesn't support (e.g. Free package
// has stock_enabled=false → no warehouse step). Default is permissive
// (stockEnabled=true) so the UI doesn't flash a hidden step during the brief
// pre-fetch render.
export function useWizardPackage(): WizardPackage {
  const [state, setState] = useState<WizardPackage>({
    stockEnabled: true,
    maxWarehouses: null,
    loaded: false,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch('/api/onboarding/package-info');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setState({
          stockEnabled: data.stockEnabled !== false,
          maxWarehouses: data.maxWarehouses ?? null,
          loaded: true,
        });
      } catch { /* keep permissive defaults */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}
