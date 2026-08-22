'use client';

import { createContext, useContext, useEffect, useCallback, useState, useRef, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';

interface MarketplaceIssue {
  account_id: string;
  shop_name: string | null;
  platform: string;
  type: 'expired' | 'disconnected';
  message: string;
}

export interface HeaderSummary {
  stockConfig: { stockEnabled: boolean; maxWarehouses: number | null; allowOversell: boolean };
  lowStockCount: number;
  chatUnread: number;
  ordersReadyCount: number;
  marketplaceHealth: {
    expired_count: number;
    inactive_count: number;
    error_count: number;
    total_issues: number;
    issues: MarketplaceIssue[];
    /** platform ที่ circuit breaker เปิดอยู่ (quota/rate limit หมด — พัก sync จนถึง until) */
    quota_paused?: { platform: string; until: string | null }[];
  };
}

interface HeaderSummaryContextValue {
  summary: HeaderSummary | null;
  refresh: () => Promise<void>;
}

const HeaderSummaryContext = createContext<HeaderSummaryContextValue | undefined>(undefined);

/**
 * Provides Sidebar + Header badge data via a single consolidated API call,
 * replacing 5 separate per-page fetches with one. Subscribes to Supabase
 * Realtime for orders + chat tables and to the in-page `orders-count-changed`
 * custom event so badges update without polling. Marketplace health refreshes
 * on a 5-minute interval (rare token-expiry checks).
 */
export function HeaderSummaryProvider({ children }: { children: ReactNode }) {
  const { userProfile } = useAuth();
  const { currentCompany } = useCompany();
  const [summary, setSummary] = useState<HeaderSummary | null>(null);
  const fetchingRef = useRef(false);

  const userId = userProfile?.id;
  const companyId = currentCompany?.id;

  const refresh = useCallback(async () => {
    if (!userId || !companyId) return;
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const res = await apiFetch('/api/header/summary');
      if (!res.ok) return;
      const data = (await res.json()) as HeaderSummary;
      setSummary(data);
    } catch {
      // non-fatal — keep last value
    } finally {
      fetchingRef.current = false;
    }
  }, [userId, companyId]);

  // Initial fetch + realtime subscriptions
  useEffect(() => {
    if (!userId || !companyId) {
      setSummary(null);
      return;
    }

    refresh();

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedRefresh = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(refresh, 500);
    };

    window.addEventListener('orders-count-changed', debouncedRefresh);

    const channel = supabase
      .channel(`header-summary-${companyId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'line_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'line_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fb_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fb_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopee_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shopee_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lazada_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lazada_contacts', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .subscribe();

    const marketplaceInterval = setInterval(refresh, 5 * 60 * 1000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener('orders-count-changed', debouncedRefresh);
      supabase.removeChannel(channel);
      clearInterval(marketplaceInterval);
    };
  }, [userId, companyId, refresh]);

  return (
    <HeaderSummaryContext.Provider value={{ summary, refresh }}>
      {children}
    </HeaderSummaryContext.Provider>
  );
}

export function useHeaderSummary() {
  const ctx = useContext(HeaderSummaryContext);
  if (!ctx) {
    throw new Error('useHeaderSummary must be used within a HeaderSummaryProvider');
  }
  return ctx;
}
