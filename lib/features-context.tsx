'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { DEFAULT_FEATURES, DEFAULT_PRESET, type FeatureFlags, type BusinessPreset } from '@/lib/features';
import { PERMISSIVE_GATES, type PackageGates } from '@/lib/package-features';

interface FeaturesContextType {
  features: FeatureFlags;
  preset: BusinessPreset;
  gates: PackageGates;
  billExpiryDays: number | null;
  loading: boolean;
  fetched: boolean; // true after API data has been loaded at least once
  refreshFeatures: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined);

interface CachedFeaturesBundle {
  preset: BusinessPreset;
  features: FeatureFlags;
  gates?: PackageGates;
  billExpiryDays: number | null;
}

// localStorage key — per-company so switching companies reads the right cache.
function cacheKey(companyId: string) {
  return `aoo-features:${companyId}`;
}

function readCachedFeatures(companyId: string | undefined): CachedFeaturesBundle | null {
  if (!companyId || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(cacheKey(companyId));
    return raw ? (JSON.parse(raw) as CachedFeaturesBundle) : null;
  } catch {
    return null;
  }
}

function writeCachedFeatures(companyId: string, bundle: CachedFeaturesBundle) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(cacheKey(companyId), JSON.stringify(bundle));
  } catch {
    // Quota / privacy mode — silently ignore; in-memory state still works.
  }
}

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const { currentCompany } = useCompany();
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);
  const [preset, setPreset] = useState<BusinessPreset>(DEFAULT_PRESET);
  const [gates, setGates] = useState<PackageGates>(PERMISSIVE_GATES);
  const [billExpiryDays, setBillExpiryDays] = useState<number | null>(7);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);

  const fetchFeatures = useCallback(async (companyIdForCache: string | undefined) => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/settings/features');
      if (res.ok) {
        const data = await res.json();
        const nextPreset = data.preset || DEFAULT_PRESET;
        const nextFeatures = data.features || DEFAULT_FEATURES;
        const nextGates = (data.gates as PackageGates | undefined) ?? gates;
        const rawDays = data.bill_expiry_days;
        const nextDays = rawDays === 0 ? 0 : (rawDays && rawDays > 0 ? rawDays : 7);

        setPreset(nextPreset);
        setFeatures(nextFeatures);
        if (data.gates) setGates(data.gates as PackageGates);
        setBillExpiryDays(nextDays);
        setFetched(true);
        if (companyIdForCache) {
          writeCachedFeatures(companyIdForCache, {
            preset: nextPreset,
            features: nextFeatures,
            gates: nextGates,
            billExpiryDays: nextDays,
          });
        }
      }
    } catch {
      // Network error — keep whatever we have (cached or all-off defaults)
    } finally {
      setLoading(false);
    }
    // gates is intentionally excluded — including it would loop the callback ref
    // since gates is set inside the same function.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use stable IDs instead of object references to prevent re-fetch on every re-render
  const userId = userProfile?.id;
  const companyId = currentCompany?.id;

  // Hydrate from localStorage as soon as the active company is known so
  // feature-gated UI matches reality on the very first render — eliminates
  // the "delivery_date input flashes then hides" race for returning users.
  useEffect(() => {
    if (!companyId) return;
    const cached = readCachedFeatures(companyId);
    if (!cached) return;
    setPreset(cached.preset);
    setFeatures(cached.features);
    if (cached.gates) setGates(cached.gates);
    setBillExpiryDays(cached.billExpiryDays);
  }, [companyId]);

  useEffect(() => {
    if (userId && companyId) {
      fetchFeatures(companyId);
    } else {
      setLoading(false);
    }
  }, [userId, companyId, fetchFeatures]);

  const refreshFeatures = useCallback(() => fetchFeatures(companyId), [fetchFeatures, companyId]);

  const value = useMemo(() => ({
    features, preset, gates, billExpiryDays, loading, fetched, refreshFeatures,
  }), [features, preset, gates, billExpiryDays, loading, fetched, refreshFeatures]);

  return (
    <FeaturesContext.Provider value={value}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures() {
  const context = useContext(FeaturesContext);
  if (context === undefined) {
    throw new Error('useFeatures must be used within a FeaturesProvider');
  }
  return context;
}
