'use client';

import { createContext, useContext, useEffect, useCallback, useState, useRef, type ReactNode } from 'react';
import { apiFetch } from '@/lib/api-client';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';

// รูปร่างเดียวกับที่ตัวเฝ้าคืนมา — `import type` ถูกลบตอน compile จึงไม่ลาก
// โค้ดฝั่ง server (supabaseAdmin) เข้ามาใน bundle ของเบราว์เซอร์
import type { WatchdogIssue as MarketplaceIssue } from '@/lib/marketplace/watchdog';

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
    /** platform+scope ที่ circuit breaker เปิดอยู่ (quota/rate limit หมด — พักจนถึง until)
     *  scope = ส่วนที่พัก (order/chat/fulfillment/… · 'all' = ทั้ง platform) */
    quota_paused?: { platform: string; scope?: string; until: string | null }[];
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

    // แชทมาถี่กว่าออเดอร์มาก (ร้านหนึ่ง 125–250 ข้อความ/วัน) และทุกแท็บที่เปิดค้างก็ฟังเหมือนกันหมด
    // — ถ้าใช้ debounce 500ms เหมือนออเดอร์ ทุกข้อความจะกลายเป็น /api/header/summary หนึ่งใบ
    // (~9 query) ต่อแท็บ · ตัวเลขกระดิ่งช้าไป 5 วิไม่มีใครเดือดร้อน จึงใช้ **throttle ท้ายหน้าต่าง**:
    // event แรกจองคิวไว้ 5 วิ · ที่มาระหว่างนั้นถูกกลืน · ยิงแล้วค่อยเปิดหน้าต่างใหม่
    const CHAT_THROTTLE_MS = 5000;
    let chatThrottleTimer: ReturnType<typeof setTimeout> | null = null;
    const throttledChatRefresh = () => {
      if (chatThrottleTimer) return;
      chatThrottleTimer = setTimeout(() => {
        chatThrottleTimer = null;
        refresh();
      }, CHAT_THROTTLE_MS);
    };

    window.addEventListener('orders-count-changed', debouncedRefresh);

    const channel = supabase
      .channel(`header-summary-${companyId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` }, debouncedRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'line_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'line_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fb_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'fb_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'shopee_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'shopee_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'lazada_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lazada_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tiktok_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tiktok_contacts', filter: `company_id=eq.${companyId}` }, throttledChatRefresh)
      .subscribe();

    const marketplaceInterval = setInterval(refresh, 5 * 60 * 1000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (chatThrottleTimer) clearTimeout(chatThrottleTimer);
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
