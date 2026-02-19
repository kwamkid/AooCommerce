'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/auth-context';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
}

interface CompanyMembership {
  company_id: string;
  roles: string[];
  company: Company;
}

interface CompanyContextType {
  currentCompany: Company | null;
  companyRoles: string[];
  companies: CompanyMembership[];
  switchCompany: (companyId: string) => void;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const STORAGE_KEY = 'aoo-current-company-id';

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading, companies: authCompanies, refreshProfile } = useAuth();
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);

  // Sync companies from AuthProvider (no duplicate /api/auth/me call)
  const companies: CompanyMembership[] = authCompanies as CompanyMembership[];

  useEffect(() => {
    if (authLoading) return;

    if (!user || companies.length === 0) {
      setCurrentCompanyId(null);
      setInitialized(true);
      return;
    }

    // Restore from localStorage or use first company
    const stored = localStorage.getItem(STORAGE_KEY);
    const valid = companies.find((m) => m.company_id === stored);
    setCurrentCompanyId(valid ? stored : companies[0]?.company_id || null);
    setInitialized(true);
  }, [user, authLoading, companies]);

  const switchCompany = useCallback((companyId: string) => {
    setCurrentCompanyId(companyId);
    localStorage.setItem(STORAGE_KEY, companyId);
    // Reload page to refresh all data with new company context
    window.location.reload();
  }, []);

  const refreshCompanies = useCallback(async () => {
    // Refresh via AuthProvider which re-fetches /api/auth/me
    await refreshProfile();
  }, [refreshProfile]);

  const currentMembership = companies.find((m) => m.company_id === currentCompanyId);

  return (
    <CompanyContext.Provider
      value={{
        currentCompany: currentMembership?.company || null,
        companyRoles: currentMembership?.roles || [],
        companies,
        switchCompany,
        loading: !initialized,
        refreshCompanies,
      }}
    >
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const context = useContext(CompanyContext);
  if (context === undefined) {
    throw new Error('useCompany must be used within a CompanyProvider');
  }
  return context;
}
