// Shared resolver: turn a stored shipping_carrier code (or free-form name)
// into the display label from the carriers table. Used by every place that
// renders the shipping label PDF or lists carriers in UI.
//
// Two access patterns:
//  - Async: `resolveCarrierLabel`, `buildTrackingUrl` — for non-React contexts (PDF, services).
//  - Sync (cache-backed): `useCarriers()`, `getCarrierLabelSync()`, `getTrackingUrlSync()` —
//    for components that render dropdowns. Components subscribe to cache updates so
//    invalidating after a settings edit re-renders all listeners.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface CarrierLookupItem {
  id: string;
  code: string;
  name: string;
  tracking_url_template: string | null;
  shippop_courier_code: string | null;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
}

let cache: CarrierLookupItem[] | null = null;
let inflight: Promise<CarrierLookupItem[]> | null = null;
const subscribers = new Set<() => void>();

async function fetchAll(): Promise<CarrierLookupItem[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await apiFetch('/api/carriers');
      if (!res.ok) return [];
      const json = await res.json();
      cache = (json.carriers as CarrierLookupItem[]) || [];
      // Notify subscribers (useCarriers consumers)
      subscribers.forEach(fn => { try { fn(); } catch { /* ignore */ } });
      return cache;
    } catch {
      return [];
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Async resolver: stored value → display label (raw fallback). */
export async function resolveCarrierLabel(value: string | null | undefined): Promise<string> {
  if (!value) return '';
  const list = await fetchAll();
  const match = list.find(c => c.code === value);
  return match ? match.name : value;
}

/** Resolve many at once (returns map keyed by input value). */
export async function resolveCarrierLabels(values: Array<string | null | undefined>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(values.filter((v): v is string => !!v)));
  const list = await fetchAll();
  const out: Record<string, string> = {};
  for (const v of unique) {
    const m = list.find(c => c.code === v);
    out[v] = m ? m.name : v;
  }
  return out;
}

/** Async builder for tracking URL using carrier's template. */
export async function buildTrackingUrl(code: string | null | undefined, trackingNumber: string | null | undefined): Promise<string | null> {
  if (!code || !trackingNumber) return null;
  const list = await fetchAll();
  const m = list.find(c => c.code === code);
  if (!m?.tracking_url_template) return null;
  return m.tracking_url_template.replace('{tracking}', encodeURIComponent(trackingNumber));
}

/** Force refresh the cache and notify subscribers. */
export async function invalidateCarrierCache() {
  cache = null;
  await fetchAll();
}

// ─── Sync helpers (cache-backed; assume cache populated by useCarriers) ──

/** Sync label resolver. Falls back to raw value if cache miss. */
export function getCarrierLabelSync(code: string | null | undefined): string {
  if (!code) return '';
  const m = cache?.find(c => c.code === code);
  return m ? m.name : code;
}

/** Sync tracking URL builder. Returns null if no template. */
export function getTrackingUrlSync(code: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  if (!code || !trackingNumber) return null;
  const m = cache?.find(c => c.code === code);
  if (!m?.tracking_url_template) return null;
  return m.tracking_url_template.replace('{tracking}', encodeURIComponent(trackingNumber));
}

// ─── React hook ──────────────────────────────────────────────────────

interface UseCarriersResult {
  carriers: CarrierLookupItem[];
  loading: boolean;
  /** Active subset, sorted (use this for dropdowns) */
  active: CarrierLookupItem[];
  /** Synchronous label lookup */
  getLabel: (code: string | null | undefined) => string;
  /** Synchronous tracking URL builder */
  getTrackingUrl: (code: string | null | undefined, trackingNumber: string | null | undefined) => string | null;
}

/**
 * React hook to access the carriers list. First call triggers a fetch;
 * subsequent calls (in the same tab) return cached data instantly.
 * Re-renders when the cache is invalidated.
 */
export function useCarriers(): UseCarriersResult {
  const [, force] = useState(0);
  const [loading, setLoading] = useState(cache === null);

  useEffect(() => {
    let mounted = true;
    if (cache === null) {
      fetchAll().finally(() => { if (mounted) { setLoading(false); force(n => n + 1); } });
    }
    const sub = () => { if (mounted) force(n => n + 1); };
    subscribers.add(sub);
    return () => {
      mounted = false;
      subscribers.delete(sub);
    };
  }, []);

  const list = cache || [];
  const active = list.filter(c => c.is_active);

  return {
    carriers: list,
    loading,
    active,
    getLabel: getCarrierLabelSync,
    getTrackingUrl: getTrackingUrlSync,
  };
}
