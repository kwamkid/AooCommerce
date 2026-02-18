'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { DEFAULT_FEATURES, DEFAULT_PRESET, type FeatureFlags, type BusinessPreset } from '@/lib/features';

interface FeaturesContextType {
  features: FeatureFlags;
  preset: BusinessPreset;
  loading: boolean;
  refreshFeatures: () => Promise<void>;
}

const FeaturesContext = createContext<FeaturesContextType | undefined>(undefined);

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const { currentCompany } = useCompany();
  const [features, setFeatures] = useState<FeatureFlags>(DEFAULT_FEATURES);
  const [preset, setPreset] = useState<BusinessPreset>(DEFAULT_PRESET);
  const [loading, setLoading] = useState(true);

  const fetchFeatures = useCallback(async () => {
    try {
      const res = await apiFetch('/api/settings/features');
      if (res.ok) {
        const data = await res.json();
        setPreset(data.preset || DEFAULT_PRESET);
        setFeatures(data.features || DEFAULT_FEATURES);
      }
    } catch {
      // Keep defaults on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userProfile && currentCompany) {
      fetchFeatures();
    } else {
      setLoading(false);
    }
  }, [userProfile, currentCompany, fetchFeatures]);

  return (
    <FeaturesContext.Provider value={{ features, preset, loading, refreshFeatures: fetchFeatures }}>
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
