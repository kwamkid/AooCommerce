'use client';

// Hook เดียวเป็นเจ้าของ marketplace accounts ทุก platform ของแท็บ "เชื่อมต่อ Marketplace"
// — fetch ครั้งเดียว (?platform=all) แทนการยิง endpoint เดิม 3 รอบ แล้วแบ่งฝั่ง client
// — refetch() ใช้หลังทุก write (disconnect / sync / refresh logo) ได้เลย เพราะเป็น call เดียวอยู่แล้ว

import { useState, useCallback, useMemo } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useFetchOnce } from '@/lib/use-fetch-once';

export type MarketplacePlatform = 'shopee' | 'tiktok' | 'lazada';

export interface MarketplaceAccount {
  id: string;
  platform: MarketplacePlatform | null; // แถวเก่าก่อนมี column = shopee
  shop_id: number;
  shop_name: string | null;
  is_active: boolean;
  last_sync_at: string | null;
  last_product_sync_at: string | null;
  access_token_expires_at: string | null;
  refresh_token_expires_at: string | null;
  auto_sync_stock: boolean;
  auto_sync_product_info: boolean;
  /** คลังที่ร้านนี้ตัด/ซิงค์สต็อก — null = ใช้คลัง default ของบริษัท */
  warehouse_id: string | null;
  connection_status: 'connected' | 'expired' | 'disconnected';
  linked_product_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  /** ร้าน TikTok ที่ดึงรูปโปรไฟล์จากบัญชีได้ (ตั้ง TIKTOK_CLIENT_* แล้ว) */
  profile_link_available?: boolean;
}

export function useMarketplaceAccounts(enabled: boolean) {
  const [accounts, setAccounts] = useState<MarketplaceAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const res = await apiFetch('/api/marketplace/accounts?platform=all');
      if (res.ok) {
        const data = await res.json();
        setAccounts(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('Failed to fetch marketplace accounts:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFetchOnce(() => { refetch(); }, enabled);

  // Optimistic patch (ใช้กับ toggle auto-sync) — rollback โดยเรียกซ้ำด้วยค่าเดิม
  const patchAccount = useCallback((id: string, patch: Partial<MarketplaceAccount>) => {
    setAccounts(prev => prev.map(a => (a.id === id ? { ...a, ...patch } : a)));
  }, []);

  const byPlatform = useMemo(() => {
    const shopee: MarketplaceAccount[] = [];
    const tiktok: MarketplaceAccount[] = [];
    const lazada: MarketplaceAccount[] = [];
    for (const a of accounts) {
      if (!a.is_active) continue;
      if (a.platform === 'tiktok') tiktok.push(a);
      else if (a.platform === 'lazada') lazada.push(a);
      else shopee.push(a); // null = แถว legacy ก่อนมี platform column
    }
    return { shopee, tiktok, lazada };
  }, [accounts]);

  return { ...byPlatform, loading, refetch, patchAccount };
}
