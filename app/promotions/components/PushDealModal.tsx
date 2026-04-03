'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Send, Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { pushPromotionToShopee } from '@/lib/marketplace/push/shopee';
import type { PushProgress } from '@/lib/marketplace/push/types';

// ─── Types ──────────────────────────────────────────────

interface Platform {
  id: string;
  platform: string;
  account_id: string | null;
  bundle_price: number | null;
  is_enabled: boolean;
}

interface ShopeeDeal {
  id: string;
  account_id: string;
  external_deal_id: number;
  status: string;
  deal_type: string;
}

interface MarketplaceAccount {
  id: string;
  shop_name: string;
  platform: string;
}

type ShopStatus = 'idle' | 'pushing' | 'success' | 'partial_success' | 'error' | 'already_pushed';

interface ShopRow {
  account_id: string;
  shop_name: string;
  platform: string;
  bundle_price: number | null;
  status: ShopStatus;
  error?: string;
  warning?: string;
  external_deal_id?: number;
  progress?: PushProgress;
}

interface PushResult {
  account_id: string;
  success: boolean;
  error?: string;
}

interface Props {
  promotionId: string;
  promotionName: string;
  startDate: string | null;
  endDate: string | null;
  onClose: () => void;
  onResults?: (results: PushResult[]) => void | Promise<void>;
  /** If set, only push this single account (skip others) */
  singleAccountId?: string;
  /** Discount type for display (percent shows %, otherwise shows ฿) */
  discountType?: string;
}

// ─── Component ──────────────────────────────────────────

export default function PushDealModal({ promotionId, promotionName, startDate, endDate, onClose, onResults, singleAccountId, discountType }: Props) {
  const [shops, setShops] = useState<ShopRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushingAll, setPushingAll] = useState(false);

  // Fetch platforms + existing deals + account names
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch promotion detail (has platforms + marketplace_deals)
      const [promoRes, accountsRes] = await Promise.all([
        apiFetch(`/api/promotions/${promotionId}`),
        apiFetch('/api/promotions/marketplace-accounts'),
      ]);

      const promoData = await promoRes.json();
      const accountsData = await accountsRes.json();

      const platforms: Platform[] = promoData.platforms || [];
      const deals: ShopeeDeal[] = promoData.marketplace_deals || [];
      const accounts: MarketplaceAccount[] = accountsData.accounts || [];

      // Build account name map
      const accountMap = new Map<string, MarketplaceAccount>();
      for (const a of accounts) accountMap.set(a.id, a);

      // Build deal map (account_id → deal)
      const dealMap = new Map<string, ShopeeDeal>();
      for (const d of deals) dealMap.set(d.account_id, d);

      // Build shop rows from enabled platforms (Shopee only for now)
      // Also include accounts that have existing deals (even if platform toggled off)
      // If singleAccountId is set, only show that one account
      const rows: ShopRow[] = platforms
        .filter(p => (p.is_enabled || dealMap.has(p.account_id!)) && p.account_id && p.platform === 'shopee')
        .filter(p => !singleAccountId || p.account_id === singleAccountId)
        .map(p => {
          const account = accountMap.get(p.account_id!);
          const existingDeal = dealMap.get(p.account_id!);
          return {
            account_id: p.account_id!,
            shop_name: account?.shop_name || 'ไม่ทราบชื่อร้าน',
            platform: p.platform,
            bundle_price: p.bundle_price,
            status: existingDeal ? 'already_pushed' as ShopStatus : 'idle' as ShopStatus,
            external_deal_id: existingDeal?.external_deal_id,
          };
        });

      setShops(rows);
    } catch (err) {
      console.error('PushDealModal loadData error:', err);
    } finally {
      setLoading(false);
    }
  }, [promotionId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Push to a single shop
  const pushToShop = useCallback(async (accountId: string) => {
    if (!startDate || !endDate) {
      // No dates set — mark shop as error
      setShops(prev => prev.map(s =>
        s.account_id === accountId ? { ...s, status: 'error' as ShopStatus, error: 'ยังไม่มีวันเริ่มต้น/สิ้นสุด' } : s
      ));
      return;
    }

    setShops(prev => prev.map(s =>
      s.account_id === accountId ? { ...s, status: 'pushing' as ShopStatus, error: undefined, progress: undefined } : s
    ));

    const result = await pushPromotionToShopee(
      promotionId,
      accountId,
      startDate,
      endDate,
      (progress) => {
        setShops(prev => prev.map(s =>
          s.account_id === accountId ? { ...s, progress } : s
        ));
      },
    );

    const finalStatus = result.success
      ? (result.warning ? 'partial_success' as ShopStatus : 'success' as ShopStatus)
      : 'error' as ShopStatus;

    setShops(prev => prev.map(s =>
      s.account_id === accountId
        ? {
            ...s,
            status: finalStatus,
            error: result.error,
            warning: result.warning,
            external_deal_id: result.external_deal_id,
            progress: undefined,
          }
        : s
    ));

    // Immediately disable toggle in DB when push fails
    if (!result.success) {
      apiFetch('/api/shopee/deals/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotion_id: promotionId, account_id: accountId, action: 'disable' }),
      }).catch(() => { /* silent */ });
    }
  }, [promotionId, startDate, endDate]);

  // Auto-push when singleAccountId is set and data is loaded
  const [autoPushed, setAutoPushed] = useState(false);
  useEffect(() => {
    if (singleAccountId && !loading && shops.length > 0 && !autoPushed) {
      const idleShop = shops.find(s => s.status === 'idle' && s.account_id === singleAccountId);
      if (idleShop) {
        setAutoPushed(true);
        pushToShop(singleAccountId);
      }
    }
  }, [singleAccountId, loading, shops, autoPushed, pushToShop]);

  // Report results to parent
  const reportResults = useCallback(async () => {
    const results = shops
      .filter(s => s.status === 'success' || s.status === 'error' || s.status === 'partial_success')
      .map(s => ({
        account_id: s.account_id,
        success: s.status === 'success' || s.status === 'partial_success',
        error: s.error,
      }));
    if (results.length > 0) await onResults?.(results);
  }, [shops, onResults]);

  // Push all idle shops
  const pushAll = useCallback(async () => {
    const idleShops = shops.filter(s => s.status === 'idle');
    if (idleShops.length === 0) return;

    setPushingAll(true);
    for (const shop of idleShops) {
      await pushToShop(shop.account_id);
    }
    setPushingAll(false);
  }, [shops, pushToShop]);

  const idleCount = shops.filter(s => s.status === 'idle').length;
  const hasDates = !!(startDate && endDate);
  const startInPast = hasDates && new Date(startDate) < new Date();

  const handleClose = async () => {
    await reportResults();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">ส่งโปรโมชั่นไป Shopee</h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5 truncate max-w-[360px]">{promotionName}</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          {!hasDates && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              โปรโมชั่นยังไม่มีวันเริ่มต้น/สิ้นสุด — Shopee ต้องการ
            </div>
          )}

          {startInPast && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 rounded-lg text-sm mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              วันเริ่มต้นผ่านไปแล้ว — ระบบจะปรับเป็นอีก ~1 ชั่วโมงอัตโนมัติ
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : shops.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-slate-400">
              ไม่มีร้านค้า Shopee ที่เปิดใช้งาน
              <br />
              <span className="text-sm">เปิด toggle ร้านค้าที่หน้าแก้ไขโปรโมชั่นก่อน</span>
            </div>
          ) : (
            <div className="space-y-2">
              {shops.map(shop => (
                <div key={shop.account_id}>
                  <div
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                      shop.status === 'error'
                        ? 'bg-red-50 dark:bg-red-900/20'
                        : 'bg-gray-50 dark:bg-slate-700/50'
                    }`}
                  >
                    {/* Shop info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {shop.shop_name}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-slate-400">
                        {shop.bundle_price != null
                          ? discountType === 'percent'
                            ? `ลด ${shop.bundle_price}%`
                            : `฿${shop.bundle_price.toLocaleString('th-TH')}`
                          : 'ใช้ค่าหลัก'}
                      </div>
                    </div>

                    {/* Status / Action */}
                    <div className="flex-shrink-0 ml-3">
                      {shop.status === 'idle' && (
                        <button
                          onClick={() => pushToShop(shop.account_id)}
                          disabled={!hasDates || pushingAll}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                        >
                          <Send className="w-3.5 h-3.5" />
                          ส่ง
                        </button>
                      )}

                      {shop.status === 'pushing' && (
                        <div className="flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="max-w-[140px] truncate">
                            {shop.progress?.message || 'กำลังส่ง...'}
                          </span>
                        </div>
                      )}

                      {shop.status === 'success' && (
                        <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400 font-medium">
                          <CheckCircle2 className="w-4 h-4" />
                          ส่งแล้ว
                        </span>
                      )}

                      {shop.status === 'partial_success' && (
                        <span className="flex items-center gap-1 text-sm text-amber-600 dark:text-amber-400 font-medium" title={shop.warning}>
                          <AlertCircle className="w-4 h-4" />
                          ส่งแล้ว (บางรายการล้มเหลว)
                        </span>
                      )}

                      {shop.status === 'already_pushed' && (
                        <span className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400">
                          <CheckCircle2 className="w-4 h-4" />
                          ส่งแล้ว
                        </span>
                      )}

                      {shop.status === 'error' && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-red-600 dark:text-red-400 font-medium">
                            ล้มเหลว
                          </span>
                          <button
                            onClick={() => pushToShop(shop.account_id)}
                            disabled={!hasDates}
                            className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="ลองอีกครั้ง"
                          >
                            <RefreshCw className="w-3.5 h-3.5 text-red-500" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Error detail */}
                  {shop.status === 'error' && shop.error && (
                    <div className="px-3 py-2 text-sm text-red-600 dark:text-red-400 bg-red-50/50 dark:bg-red-900/10 rounded-b-lg -mt-1 border-x border-b border-red-200 dark:border-red-800/30 whitespace-pre-line">
                      {shop.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            ปิด
          </button>
          {idleCount > 0 && (
            <button
              onClick={pushAll}
              disabled={!hasDates || pushingAll}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {pushingAll ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              ส่งทั้งหมด ({idleCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
