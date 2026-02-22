'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { DEFAULT_FEATURES, DEFAULT_PRESET, type FeatureFlags, type BusinessPreset } from '@/lib/features';

interface FeaturesContextType {
  features: FeatureFlags;
  preset: BusinessPreset;
  loading: boolean;
  fetched: boolean; // true after API data has been loaded at least once
  refreshFeatures: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const { currentCompany } = useCompany();
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);
  const [preset, setPreset] = useState<BusinessPreset>(DEFAULT_PRESET);
  const [loading, setLoading] = useState(true);
  const [fetched, setFetched] = useState(false);

  const fetchFeatures = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/settings/features');
      if (res.ok) {
        const data = await res.json();
        setPreset(data.preset || DEFAULT_PRESET);
        setFeatures(data.features || DEFAULT_FEATURES);
        setFetched(true);
      }
    } catch {
      // Keep defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  // Use stable IDs instead of object references to prevent re-fetch on every re-render
  const userId = userProfile?.id;
  const companyId = currentCompany?.id;

  useEffect(() => {
    if (userId && companyId) {
      fetchFeatures();
    } else {
      setLoading(false);
    }
  }, [userId, companyId, fetchFeatures]);

  const value = useMemo(() => ({
    features, preset, loading, fetched, refreshFeatures: fetchFeatures,
  }), [features, preset, loading, fetched, fetchFeatures]);

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
