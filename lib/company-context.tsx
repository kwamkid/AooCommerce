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
  role: string;
  company: Company;
}

interface CompanyContextType {
  currentCompany: Company | null;
  companyRole: string | null;
  companies: CompanyMembership[];
  switchCompany: (companyId: string) => void;
  loading: boolean;
  refreshCompanies: () => Promise<void>;
}

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

const STORAGE_KEY = 'aoo-current-company-id';

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { session, user } = useAuth();
  const [companies, setCompanies] = useState<CompanyMembership[]>([]);
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCompanies = useCallback(async () => {
    if (!session?.access_token) {
      setCompanies([]);
      setCurrentCompanyId(null);
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      const data = await response.json();
      const memberships: CompanyMembership[] = data.companies || [];
      setCompanies(memberships);

      // Restore from localStorage or use first company
      const stored = localStorage.getItem(STORAGE_KEY);
      const valid = memberships.find((m) => m.company_id === stored);
      setCurrentCompanyId(valid ? stored : memberships[0]?.company_id || null);
    } catch (error) {
      console.error('Error fetching companies:', error);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (user) {
      fetchCompanies();
    } else {
      setCompanies([]);
      setCurrentCompanyId(null);
      setLoading(false);
    }
  }, [user, fetchCompanies]);

  const switchCompany = useCallback((companyId: string) => {
    setCurrentCompanyId(companyId);
    localStorage.setItem(STORAGE_KEY, companyId);
    // Reload page to refresh all data with new company context
    window.location.reload();
  }, []);

  const refreshCompanies = useCallback(async () => {
    await fetchCompanies();
  }, [fetchCompanies]);

  const currentMembership = companies.find((m) => m.company_id === currentCompanyId);

  return (
    <CompanyContext.Provider
      value={{
        currentCompany: currentMembership?.company || null,
        companyRole: currentMembership?.role || null,
        companies,
        switchCompany,
        loading,
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
