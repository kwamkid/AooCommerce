'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/lib/auth-context';

interface Company {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  business_type?: string;
  vat_registered?: boolean;
  onboarding_completed_at?: string | null;
  business_channels?: string[];
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

    // ① แจ้งเตือนพามา (`?company=<id>`) — กดแจ้งเตือนของร้าน B ขณะค้างอยู่ร้าน A
    //    ต้องไปโผล่ที่ร้าน B เลย ไม่ใช่ให้ผู้ใช้มานั่งกดสลับเอง
    //    ตั้งค่าตรงนี้ตอน "เริ่มต้น" จึงไม่ต้อง reload หน้า (switchCompany สั่ง reload
    //    ซึ่งจะทำให้หลุดจากหน้าปลายทางที่แจ้งเตือนตั้งใจพามา)
    //    รับเฉพาะ id ที่ผู้ใช้เป็นสมาชิกจริง — ค่าใน URL เชื่อไม่ได้
    const fromNotification = new URLSearchParams(window.location.search).get('company');
    const invited = fromNotification && companies.some((m) => m.company_id === fromNotification)
      ? fromNotification
      : null;
    if (fromNotification) {
      // เก็บ ?company= ออกจาก URL เสมอ — ไม่งั้นค้างอยู่ตอนแชร์ลิงก์/refresh
      const url = new URL(window.location.href);
      url.searchParams.delete('company');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
    if (invited) localStorage.setItem(STORAGE_KEY, invited);

    // ② ไม่มีก็ใช้ค่าที่จำไว้ล่าสุด แล้วค่อยตกไปบริษัทแรก
    const stored = invited || localStorage.getItem(STORAGE_KEY);
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
  const currentCompany = currentMembership?.company || null;
  const companyRoles = currentMembership?.roles || [];
  const loading = !initialized;

  const value = useMemo(() => ({
    currentCompany, companyRoles, companies, switchCompany, loading, refreshCompanies,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [currentCompanyId, companies, loading]);

  return (
    <CompanyContext.Provider value={value}>
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
