'use client';

import {
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  RefreshCw,
  Send,
  Loader2,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import PushDealModal from '../PushDealModal';
import type { UsePromotionFormReturn } from './usePromotionForm';

interface Props {
  hook: UsePromotionFormReturn;
}

export default function FormModals({ hook }: Props) {
  const {
    router,
    isEdit,
    form,
    marketplaceAccounts,
    platformPrices,
    shopeeDeals, setShopeeDeals,
    showSyncConfirm, setShowSyncConfirm,
    syncingShopee,
    syncResults, setSyncResults,
    confirmDialog, setConfirmDialog,
    savedPromotionId, setSavedPromotionId,
    showPushModal, setShowPushModal,
    pushSingleAccountId, setPushSingleAccountId,
    lightboxSrc, setLightboxSrc,
    hasLocalChanges,
    handleSyncShopee,
    promotionId,
  } = hook;

  return (
    <>
      {/* Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
          onClick={() => setLightboxSrc(null)}
          role="dialog"
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxSrc}
            alt="Product"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Confirm Dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-sm w-full p-6">
            <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">{confirmDialog.message}</p>
            {confirmDialog.detail && (
              <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">{confirmDialog.detail}</p>
            )}
            {confirmDialog.content && <div className="mb-4">{confirmDialog.content}</div>}
            {!confirmDialog.detail && !confirmDialog.content && <div className="mb-4" />}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] transition-colors"
              >
                {confirmDialog.confirmLabel || 'ยืนยัน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Deal Modal */}
      {showPushModal && (promotionId || savedPromotionId) && (
        <PushDealModal
          promotionId={(promotionId || savedPromotionId)!}
          promotionName={form.name}
          startDate={form.dateRange?.startDate ? String(form.dateRange.startDate) : null}
          endDate={form.dateRange?.endDate ? String(form.dateRange.endDate) : null}
          singleAccountId={pushSingleAccountId}
          discountType={form.discount_type}
          onClose={async () => {
            setShowPushModal(false);
            setPushSingleAccountId(undefined);
            router.push('/promotions');
          }}
          onResults={async (results) => {
            console.log('[onResults] results:', results);
            const failedAccountIds = results.filter(r => !r.success).map(r => r.account_id);
            console.log('[onResults] failedAccountIds:', failedAccountIds);
            if (failedAccountIds.length > 0) {
              const { setPlatformPrices } = hook;
              setPlatformPrices(prev => prev.map(p =>
                failedAccountIds.includes(p.account_id) ? { ...p, is_enabled: false } : p
              ));
              const pid = promotionId || savedPromotionId;
              if (pid) {
                await Promise.all(failedAccountIds.map(accId =>
                  apiFetch('/api/shopee/deals/toggle', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ promotion_id: pid, account_id: accId, action: 'disable' }),
                  }).catch(() => { /* silent */ })
                ));
              }
            }
          }}
        />
      )}

      {/* Sync Confirm Dialog */}
      {showSyncConfirm && (
        <div className="fixed inset-0 z-[999] bg-black/50 flex items-center justify-center p-4" onClick={() => { if (!syncingShopee) { setShowSyncConfirm(false); router.push('/promotions'); } }}>
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            {syncResults ? (
              <>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">ผลลัพธ์การ Sync</h3>
                <div className="space-y-3 mb-5 max-h-[60vh] overflow-y-auto">
                  {syncResults.map((r, idx) => (
                    <div key={idx} className={`rounded-lg ${r.success ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                      <div className="flex items-center gap-2 py-2 px-3">
                        {r.success
                          ? <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                          : <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                        }
                        <span className="text-sm font-medium text-gray-700 dark:text-slate-300 flex-1">{r.shop_name}</span>
                        {r.error && <span className="text-xs text-red-500">{r.error}</span>}
                      </div>
                      {r.details && r.details.length > 0 && (
                        <div className="px-3 pb-2 space-y-0.5">
                          {r.details.map((d, di) => (
                            <div key={di} className="text-xs text-gray-500 dark:text-slate-400 pl-6">
                              {d}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-3">
                  {(() => {
                    const existingIds = new Set(shopeeDeals.map(d => d.account_id));
                    const hasNewPlatforms = platformPrices.some(p => p.is_enabled && !existingIds.has(p.account_id));
                    return hasNewPlatforms ? (
                      <button
                        onClick={() => { setShowSyncConfirm(false); setSyncResults(null); setShowPushModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 text-base font-medium text-[#F4511E] bg-white dark:bg-slate-700 border border-[#F4511E] rounded-lg hover:bg-orange-50 dark:hover:bg-slate-600 transition-colors"
                      >
                        <Send className="w-4 h-4" />
                        Push ร้านใหม่
                      </button>
                    ) : null;
                  })()}
                  <button
                    onClick={() => { setShowSyncConfirm(false); setSyncResults(null); router.push('/promotions'); }}
                    className="px-5 py-2 text-base font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] transition-colors"
                  >
                    ตกลง
                  </button>
                </div>
              </>
            ) : (
              (() => {
                const existingDealAccountIds = new Set(shopeeDeals.map(d => d.account_id));
                const newPlatformAccounts = platformPrices.filter(p => p.is_enabled && !existingDealAccountIds.has(p.account_id));
                const hasExisting = shopeeDeals.length > 0;
                const hasNew = newPlatformAccounts.length > 0;
                return (
                  <>
                    <div className="flex items-center gap-3 mb-3">
                      <img src="/marketplace/shopee.svg" alt="" className="w-6 h-6" />
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white">อัพเดตไป Shopee ด้วยไหม?</h3>
                    </div>

                    {hasExisting && (
                      <>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">
                          อัพเดต deal ที่มีอยู่ ({shopeeDeals.length} ร้าน):
                        </p>
                        <div className="space-y-1 mb-3">
                          {shopeeDeals.map((deal) => {
                            const account = marketplaceAccounts.find(a => a.id === deal.account_id);
                            const isDisabled = platformPrices.find(p => p.account_id === deal.account_id)?.is_enabled === false;
                            return (
                              <div key={deal.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 py-1">
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isDisabled ? 'bg-red-500' : deal.status === 'ongoing' ? 'bg-green-500' : 'bg-blue-500'}`} />
                                <span>{account?.shop_name || deal.account_id}</span>
                                {isDisabled && <span className="text-xs text-red-500">(จะปิด deal)</span>}
                                {!isDisabled && deal.status === 'ongoing' && <span className="text-xs text-green-600">ongoing</span>}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    {hasNew && (
                      <>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mb-1">
                          สร้าง deal ใหม่ ({newPlatformAccounts.length} ร้าน):
                        </p>
                        <div className="space-y-1 mb-3">
                          {newPlatformAccounts.map((pp) => {
                            const account = marketplaceAccounts.find(a => a.id === pp.account_id);
                            return (
                              <div key={pp.account_id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-300 py-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 flex-shrink-0" />
                                {account?.shop_name || pp.account_id}
                                <span className="text-xs text-orange-600">ใหม่</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}

                    <div className="flex justify-center gap-3 mt-5">
                      <button
                        onClick={() => { setShowSyncConfirm(false); router.push('/promotions'); }}
                        disabled={syncingShopee}
                        className="px-4 py-2 text-base font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-600 transition-colors"
                      >
                        ข้าม
                      </button>
                      <button
                        onClick={async () => {
                          const pid = savedPromotionId || promotionId;
                          if (!pid) return;

                          if (!hasExisting && hasNew) {
                            setShowSyncConfirm(false);
                            setShowPushModal(true);
                            return;
                          }

                          await handleSyncShopee();

                          if (hasNew) {
                            setSyncResults(null);
                            setShowSyncConfirm(false);
                            setShowPushModal(true);
                          }
                        }}
                        disabled={syncingShopee}
                        className="flex items-center gap-2 px-4 py-2 text-base font-medium text-white bg-[#F4511E] rounded-lg hover:bg-[#E64A19] disabled:opacity-50 transition-colors"
                      >
                        {syncingShopee ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            กำลัง Sync...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-4 h-4" />
                            อัพเดต Shopee
                          </>
                        )}
                      </button>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}

      {/* Shopee Sync Status (edit mode only) */}
      {isEdit && shopeeDeals.length > 0 && (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img src="/marketplace/shopee.svg" alt="Shopee" className="w-5 h-5" />
              <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300">สถานะ Shopee Deal</h2>
              {hasLocalChanges && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <AlertTriangle className="w-3 h-3" />
                  มีการแก้ไขที่ยังไม่ sync
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setSavedPromotionId(promotionId || null); setShowSyncConfirm(true); }}
              disabled={syncingShopee || !hasLocalChanges}
              title={!hasLocalChanges ? 'ไม่มีการเปลี่ยนแปลงที่ต้อง sync' : undefined}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#F4511E] hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${syncingShopee ? 'animate-spin' : ''}`} />
              Sync ตอนนี้
            </button>
          </div>
          <div className="space-y-2">
            {shopeeDeals.map((deal) => {
              const account = marketplaceAccounts.find(a => a.id === deal.account_id);
              const shopName = account?.shop_name || deal.account_id;
              const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
                ongoing: { label: 'กำลังดำเนินการ', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
                upcoming: { label: 'รอเริ่ม', color: 'text-blue-600 dark:text-blue-400', icon: Clock },
                expired: { label: 'หมดอายุ', color: 'text-gray-400 dark:text-slate-500', icon: Clock },
              };
              const sc = statusConfig[deal.status] || { label: deal.status, color: 'text-gray-500', icon: Clock };
              const StatusIcon = sc.icon;
              return (
                <div key={deal.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50 dark:bg-slate-700/50">
                  <div className="flex items-center gap-2">
                    <img src="/marketplace/shopee.svg" alt="" className="w-4 h-4" />
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{shopName}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`flex items-center gap-1 text-xs font-medium ${sc.color}`}>
                      <StatusIcon className="w-3.5 h-3.5" />
                      {sc.label}
                    </span>
                    {deal.updated_at && (
                      <span className="text-xs text-gray-400 dark:text-slate-500">
                        อัพเดต: {new Date(deal.updated_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
