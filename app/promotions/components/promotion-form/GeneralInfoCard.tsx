'use client';

import { useRef } from 'react';
import PriceDiscountCombo, { type PriceMode } from '@/components/ui/PriceDiscountCombo';
import PostfixInput from '@/components/ui/PostfixInput';
import DateRangePicker from '@/components/ui/DateRangePicker';
import ImageUploader from '@/components/ui/ImageUploader';
import {
  Package,
  Gift,
  Tag,
  Percent,
  AlertTriangle,
  Loader2,
  Send,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import {
  type FormState,
  TYPE_OPTIONS,
} from './types';
import type { UsePromotionFormReturn } from './usePromotionForm';

interface Props {
  hook: UsePromotionFormReturn;
}

export default function GeneralInfoCard({ hook }: Props) {
  const {
    isEdit,
    bkkToday,
    form, setForm,
    promotionImages, setPromotionImages,
    errors, setErrors,
    marketplaceAccounts,
    platformPrices, setPlatformPrices,
    activePlatformTab, setActivePlatformTab,
    shopeeDeals, setShopeeDeals,
    confirmDialog, setConfirmDialog,
    togglingShop, setTogglingShop,
    setPushSingleAccountId,
    setShowPushModal,
    togglePriceRef,
    isBundleSet,
    isBundleFixPrice,
    showBundlePrice,
    showBundleDiscount,
    hasOngoingDeal,
    totalDefaultPrice,
    bundlePrice,
    discount,
    discountPercent,
    showToast,
  } = hook;

  return (
    <>
      {/* Promotion Type */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-3">ประเภทโปรโมชั่น</h2>
        <div className="flex flex-wrap gap-3">
          {TYPE_OPTIONS.map(opt => (
            <div key={opt.id} className="relative group">
              <button
                onClick={() => {
                  if (isEdit) return;
                  setForm(prev => ({
                    ...prev,
                    promotion_type: opt.id as FormState['promotion_type'],
                    items: [],
                    tiers: [],
                    bundle_price: '',
                    purchase_min_spend: '',
                    per_gift_num: '1',
                    purchase_limit: '',
                  }));
                }}
                disabled={isEdit}
                className={`flex items-center gap-2.5 px-5 py-3 rounded-xl border-2 transition-all
                  ${form.promotion_type === opt.id
                    ? 'border-primary bg-orange-50 dark:bg-orange-900/20 text-primary'
                    : 'border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 text-gray-600 dark:text-slate-400'}
                  ${isEdit ? 'cursor-not-allowed opacity-60' : ''}
                `}
              >
                {opt.icon}
                <span className="font-semibold text-base whitespace-nowrap">{opt.label}</span>
              </button>
              <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 px-3 py-2 bg-gray-800 dark:bg-slate-900 text-white text-sm rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 whitespace-nowrap z-50 pointer-events-none max-w-xs">
                <span className="whitespace-normal">{opt.desc}</span>
                <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-gray-800 dark:border-t-slate-900" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* General Info — 2-column */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-5">
        <div className={`grid grid-cols-1 ${marketplaceAccounts.length > 0 ? 'lg:grid-cols-[1fr,340px]' : ''} gap-6`}>
          {/* Left column */}
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300">ข้อมูลทั่วไป</h2>

            {/* Row 1: ชื่อ + ระยะเวลา */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div data-error={errors.name ? 'true' : undefined}>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ชื่อโปรโมชั่น *</label>
                <div className="relative">
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => { setForm(prev => ({ ...prev, name: e.target.value.slice(0, 25) })); setErrors(prev => { const { name: _, ...rest } = prev; return rest; }); }}
                    maxLength={25}
                    placeholder={marketplaceAccounts.length > 0 ? 'ชื่อนี้จะแสดงบน Shopee/TikTok' : 'ชื่อที่ลูกค้าเห็น'}
                    className={`w-full h-[42px] px-3 pr-14 border rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent ${errors.name ? 'border-red-400 ring-1 ring-red-400' : 'border-gray-300 dark:border-slate-500'}`}
                  />
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${form.name.length >= 25 ? 'text-red-400' : 'text-slate-400'}`}>
                    {form.name.length}/25
                  </span>
                </div>
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>
              <div data-error={errors.dateRange ? 'true' : undefined}>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ระยะเวลาโปร *</label>
                <DateRangePicker
                  value={form.dateRange}
                  onChange={(v) => { setForm(prev => ({ ...prev, dateRange: v })); setErrors(prev => { const { dateRange: _, ...rest } = prev; return rest; }); }}
                  placeholder="เลือกช่วงวันที่"
                  showShortcuts={false}
                  minDate={bkkToday}
                  readOnly={hasOngoingDeal}
                />
                {errors.dateRange && <p className="text-red-500 text-sm mt-1">{errors.dateRange}</p>}
                {hasOngoingDeal && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Shopee deal กำลัง ongoing — แก้วันที่ไม่ได้
                  </p>
                )}
              </div>
            </div>

            {/* Row 2: ส่วนลด/ราคาเซ็ต + จำกัดการซื้อ */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {isBundleSet && (
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">ส่วนลดเซ็ต *</label>
                  <div className="flex items-start gap-2">
                    <PriceDiscountCombo
                      value={isBundleFixPrice ? form.bundle_price : form.discount_value}
                      mode={form.discount_type === 'fix_price' ? 'fixed_price' : form.discount_type as PriceMode}
                      onValueChange={v => {
                        if (form.discount_type === 'fix_price') {
                          setForm(prev => ({ ...prev, bundle_price: v }));
                        } else {
                          setForm(prev => ({ ...prev, discount_value: v }));
                        }
                      }}
                      onModeChange={m => {
                        const dt = m === 'fixed_price' ? 'fix_price' : m;
                        setForm(prev => ({ ...prev, discount_type: dt as typeof prev.discount_type, discount_value: '', bundle_price: '' }));
                      }}
                      disabled={hasOngoingDeal}
                    />
                  </div>
                  {(errors.bundle_price || errors.discount_value) && (
                    <p data-error="true" className="text-red-500 text-sm mt-1">{errors.bundle_price || errors.discount_value}</p>
                  )}
                  {hasOngoingDeal && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Shopee deal กำลัง ongoing — แก้ส่วนลด/ราคาไม่ได้
                    </p>
                  )}
                  {isBundleFixPrice ? (
                    <>
                      {bundlePrice > 0 && totalDefaultPrice > 0 && (
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                          ราคาปกติ {totalDefaultPrice.toLocaleString()} → ลด {discount.toLocaleString()} ({discountPercent.toFixed(0)}%)
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                      {form.discount_type === 'percent'
                        ? `ลด ${parseFloat(form.discount_value) || 0}% จากราคาปกติของแต่ละสินค้า`
                        : `ลด ${(parseFloat(form.discount_value) || 0).toLocaleString()} บาท จากราคาปกติของแต่ละสินค้า`}
                    </p>
                  )}
                </div>
              )}
              {!isBundleSet && showBundlePrice && (
                <div>
                  <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">
                    {form.promotion_type === 'buy_get_discount' ? 'ราคารวม *' : 'ราคาเซ็ต *'}
                  </label>
                  <PostfixInput
                    value={form.bundle_price}
                    onChange={v => setForm(prev => ({ ...prev, bundle_price: v }))}
                    postfix="฿"
                    placeholder="0"
                    min={0}
                    error={errors.bundle_price}
                    helperText={bundlePrice > 0 && totalDefaultPrice > 0
                      ? `ราคาปกติ ${totalDefaultPrice.toLocaleString()} → ลด ${discount.toLocaleString()} (${discountPercent.toFixed(0)}%)`
                      : undefined}
                  />
                </div>
              )}
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">จำกัดการซื้อต่อคน</label>
                <PostfixInput
                  value={form.purchase_limit}
                  onChange={v => setForm(prev => ({ ...prev, purchase_limit: v }))}
                  postfix="ครั้ง"
                  placeholder="ไม่จำกัด"
                  min={1}
                  max={100}
                  error={errors.purchase_limit}
                  helperText={marketplaceAccounts.length > 0 ? 'ลูกค้า 1 คนซื้อได้สูงสุดกี่ครั้ง (Shopee: 1-100)' : 'ลูกค้า 1 คนซื้อได้สูงสุดกี่ครั้ง'}
                />
              </div>
            </div>

            {/* Description + Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
              <div className="flex flex-col">
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">คำอธิบาย</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={marketplaceAccounts.length > 0 ? 'แสดงในหน้ารายละเอียด + ส่งไป Shopee/TikTok' : 'แสดงในหน้ารายละเอียดโปรโมชั่น'}
                  className="w-full flex-1 min-h-[120px] px-3 py-2 border border-gray-300 dark:border-slate-500 rounded-lg bg-white dark:bg-slate-800 text-base text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                />
              </div>
              <div>
                <label className="block text-base text-gray-600 dark:text-slate-400 mb-1">รูปภาพ</label>
                <ImageUploader
                  images={promotionImages}
                  onImagesChange={setPromotionImages}
                  maxImages={5}
                />
              </div>
            </div>
          </div>

          {/* Right column — เลือกร้านที่จะ Sync */}
          {marketplaceAccounts.length > 0 && (
            <MarketplacePanel hook={hook} />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Marketplace Panel (right column) ─────────────────────

function MarketplacePanel({ hook }: Props) {
  const {
    isEdit,
    promotionId,
    form, setForm,
    promotionImages,
    errors,
    marketplaceAccounts,
    platformPrices, setPlatformPrices,
    activePlatformTab, setActivePlatformTab,
    shopeeDeals, setShopeeDeals,
    setConfirmDialog,
    togglingShop, setTogglingShop,
    setPushSingleAccountId,
    setShowPushModal,
    togglePriceRef,
    isBundleSet,
    isBundleFixPrice,
    showBundlePrice,
    showBundleDiscount,
    bundlePrice,
    showToast,
    savedPromotionId,
  } = hook;

  const pid = promotionId;

  const platforms = [...new Set(marketplaceAccounts.map(a => a.platform))];
  const PLATFORM_META: Record<string, { label: string; icon: string }> = {
    shopee: { label: 'Shopee', icon: '/marketplace/shopee.svg' },
    tiktok: { label: 'TikTok', icon: '/marketplace/tiktok_shop.svg' },
    lazada: { label: 'Lazada', icon: '/marketplace/lazada.svg' },
    line_shopping: { label: 'LINE Shopping', icon: '/social/line_oa.svg' },
  };
  const currentTab = activePlatformTab || platforms[0];
  const tabAccounts = marketplaceAccounts.filter(a => a.platform === currentTab);

  return (
    <div className="lg:border-l lg:border-gray-200 lg:dark:border-slate-700 lg:pl-6">
      <h2 className="text-base font-semibold text-gray-700 dark:text-slate-300 mb-1">เลือกร้านที่จะ Sync</h2>
      <p className="text-xs text-gray-400 dark:text-slate-500 mb-3">
        เปิดร้านที่ต้องการส่งโปรโมชั่น{isBundleFixPrice && bundlePrice ? ` · ราคาเซ็ต ฿${bundlePrice.toLocaleString()}` : ''}{showBundleDiscount && form.discount_value ? ` · ลด ${form.discount_type === 'percent' ? `${form.discount_value}%` : `฿${parseFloat(form.discount_value).toLocaleString()}`}` : ''}{(showBundlePrice || showBundleDiscount) ? ' — กรอกค่าเฉพาะร้าน หรือเว้นว่างใช้ค่าหลัก' : ''}
      </p>

      {/* Platform tabs */}
      {platforms.length > 1 && (
        <div className="flex items-center gap-0.5 mb-3 border-b border-gray-200 dark:border-slate-700">
          {platforms.map(p => {
            const meta = PLATFORM_META[p] || { label: p, icon: '' };
            const isActive = currentTab === p;
            const enabledCount = marketplaceAccounts.filter(a => a.platform === p).filter(a => platformPrices.find(pp => pp.account_id === a.id)?.is_enabled).length;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setActivePlatformTab(p)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300'
                }`}
              >
                {meta.icon && <img src={meta.icon} alt="" className="w-4 h-4" />}
                <span>{meta.label}</span>
                {enabledCount > 0 && (
                  <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-primary text-white text-[10px] font-bold leading-none">{enabledCount}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Single platform header */}
      {platforms.length === 1 && (
        <div className="flex items-center gap-1.5 mb-3">
          {PLATFORM_META[platforms[0]]?.icon && (
            <img src={PLATFORM_META[platforms[0]].icon} alt="" className="w-4 h-4" />
          )}
          <span className="text-xs font-medium text-gray-500 dark:text-slate-400">
            {PLATFORM_META[platforms[0]]?.label || platforms[0]}
          </span>
        </div>
      )}

      {/* Shop list */}
      <div className="space-y-2.5">
        {tabAccounts.map((account) => {
          const pp = platformPrices.find(p => p.account_id === account.id);
          const isEnabled = pp?.is_enabled ?? false;
          const meta = PLATFORM_META[account.platform];
          const existingDeal = shopeeDeals.find(d => d.account_id === account.id);
          const isOngoing = existingDeal?.status === 'ongoing';
          return (
            <div key={account.id}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={togglingShop === account.id}
                  onClick={() => {
                    // New promo (not saved yet) → just flip local state
                    if (!pid) {
                      setPlatformPrices(prev => {
                        const exists = prev.some(p => p.account_id === account.id);
                        if (!exists) return [...prev, { account_id: account.id, bundle_price: '', is_enabled: true }];
                        return prev.map(p => p.account_id === account.id ? { ...p, is_enabled: !p.is_enabled } : p);
                      });
                      return;
                    }

                    // Toggle OFF (disable)
                    if (isEnabled) {
                      setConfirmDialog({
                        message: existingDeal
                          ? `ปิด deal ร้าน "${account.shop_name}"?`
                          : `ปิดร้าน "${account.shop_name}"?`,
                        detail: existingDeal ? 'Deal จะถูก end บน Shopee ทันที' : undefined,
                        confirmLabel: 'ปิด deal',
                        onConfirm: async () => {
                          setConfirmDialog(null);
                          setTogglingShop(account.id);
                          try {
                            const res = await apiFetch('/api/shopee/deals/toggle', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ promotion_id: pid, account_id: account.id, action: 'disable' }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
                            setPlatformPrices(prev => prev.map(p =>
                              p.account_id === account.id ? { ...p, is_enabled: false } : p
                            ));
                            setShopeeDeals(prev => prev.filter(d => d.account_id !== account.id));
                            showToast(`ปิด deal ร้าน ${account.shop_name} สำเร็จ`);
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
                          } finally {
                            setTogglingShop(null);
                          }
                        },
                      });
                      return;
                    }

                    // Toggle ON (enable)
                    if (!form.dateRange?.startDate || !form.dateRange?.endDate) {
                      showToast('กรุณาตั้งวันเริ่มต้น/สิ้นสุดก่อนเปิดร้าน', 'error');
                      return;
                    }

                    const currentPlatform = platformPrices.find(p => p.account_id === account.id);
                    const promoType = form.promotion_type;
                    const isPercent = form.discount_type === 'percent';
                    const isFixedDiscount = form.discount_type === 'fixed_discount';
                    const showPriceInput = promoType === 'bundle_set' || promoType === 'buy_get_discount';
                    const currentPrice = showPriceInput
                      ? (currentPlatform?.bundle_price || (isPercent || isFixedDiscount ? form.discount_value : form.bundle_price) || '')
                      : '';
                    const inputLabel = isPercent ? 'ส่วนลด' : isFixedDiscount ? 'ส่วนลด' : promoType === 'buy_get_discount' ? 'ราคาพิเศษ' : 'ราคา Bundle';
                    const inputSuffix = isPercent ? '%' : '฿';

                    const warningItems = (() => {
                      switch (promoType) {
                        case 'bundle_set':
                          return ['ราคา / ส่วนลด', 'วันเริ่มต้น', 'จำนวนขั้นต่ำ'];
                        case 'buy_get_free':
                          return ['วันเริ่มต้น', 'จำนวนขั้นต่ำ', 'สินค้าหลัก / ของแถม'];
                        case 'buy_get_discount':
                          return ['ราคาพิเศษ', 'วันเริ่มต้น', 'สินค้าหลัก / สินค้าลดราคา'];
                        case 'qty_discount':
                          return ['ส่วนลดต่อขั้น', 'วันเริ่มต้น', 'จำนวนขั้นต่ำ'];
                        default:
                          return ['ราคา / ส่วนลด', 'วันเริ่มต้น'];
                      }
                    })();

                    setConfirmDialog({
                      message: `สร้าง deal ร้าน "${account.shop_name}" บน Shopee?`,
                      content: (
                        <div className="space-y-3 mt-2">
                          {showPriceInput && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-500 dark:text-slate-400 whitespace-nowrap">{inputLabel}</span>
                            <div className="relative flex-1">
                              <input
                                ref={togglePriceRef}
                                type="number"
                                defaultValue={currentPrice}
                                placeholder="เว้นว่างใช้ค่าหลัก"
                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-primary focus:border-transparent"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">{inputSuffix}</span>
                            </div>
                          </div>
                          )}
                          <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-xs text-amber-700 dark:text-amber-400 space-y-1">
                            <p className="font-medium">สิ่งที่แก้ไม่ได้หลังสร้าง deal (ถ้า deal เริ่มแล้ว):</p>
                            <ul className="list-disc ml-4 space-y-0.5">
                              {warningItems.map(item => <li key={item}>{item}</li>)}
                            </ul>
                            <p>ถ้าต้องการแก้ → ปิด deal แล้วสร้างใหม่</p>
                          </div>
                        </div>
                      ),
                      confirmLabel: 'สร้าง deal',
                      onConfirm: async () => {
                        setConfirmDialog(null);
                        setTogglingShop(account.id);
                        try {
                          const inputPrice = togglePriceRef.current?.value || '';
                          setPlatformPrices(prev => {
                            const exists = prev.some(p => p.account_id === account.id);
                            if (!exists) return [...prev, { account_id: account.id, bundle_price: inputPrice, is_enabled: true }];
                            return prev.map(p => p.account_id === account.id ? { ...p, bundle_price: inputPrice, is_enabled: true } : p);
                          });

                          const togglePlatforms = platformPrices.map(p => {
                            const acc = marketplaceAccounts.find(a => a.id === p.account_id);
                            if (p.account_id === account.id) {
                              return { platform: acc?.platform || 'shopee', account_id: p.account_id, bundle_price: parseFloat(inputPrice) || null, is_enabled: true };
                            }
                            return { platform: acc?.platform || 'shopee', account_id: p.account_id, bundle_price: parseFloat(p.bundle_price) || null, is_enabled: p.is_enabled };
                          });
                          await apiFetch(`/api/promotions/${pid}`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              name: form.name.trim(),
                              promotion_type: form.promotion_type,
                              status: form.is_active ? 'active' : 'inactive',
                              start_date: form.dateRange?.startDate || null,
                              end_date: form.dateRange?.endDate || null,
                              image: promotionImages[0]?.image_url || null,
                              description: form.description || null,
                              bundle_price: parseFloat(form.bundle_price) || null,
                              discount_type: isBundleSet ? form.discount_type : null,
                              discount_value: isBundleSet && form.discount_type !== 'fix_price' ? (parseFloat(form.discount_value) || null) : null,
                              purchase_min_spend: form.promotion_type === 'buy_get_free' ? 0 : (parseFloat(form.purchase_min_spend) || null),
                              per_gift_num: form.promotion_type === 'buy_get_free'
                                ? (form.items.filter(i => i.role === 'gift').length || 1)
                                : (parseInt(form.per_gift_num) || null),
                              purchase_limit: parseInt(form.purchase_limit) || null,
                              items: form.items.map((item, idx) => ({
                                variation_id: (item.variation_id && item.variation_id !== item.product_id) ? item.variation_id : null,
                                product_id: item.product_id || null,
                                role: item.role,
                                quantity: item.quantity,
                                special_price: item.special_price,
                                sort_order: idx,
                              })),
                              tiers: form.tiers.map(t => ({
                                min_qty: t.min_qty,
                                discount_type: t.discount_type,
                                discount_value: t.discount_value,
                              })),
                              platforms: togglePlatforms,
                            }),
                          });

                          const res = await apiFetch('/api/shopee/deals/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ promotion_id: pid, account_id: account.id, action: 'enable' }),
                          });
                          const data = await res.json();
                          if (!res.ok) {
                            if (data.error_code === 'DUPLICATE_DEAL') {
                              showToast('มีดีลที่ยัง active อยู่บน Shopee — รอ 10 นาทีแล้วค่อยเปิดใหม่', 'error');
                            } else {
                              throw new Error(data.error || 'เกิดข้อผิดพลาด');
                            }
                            return;
                          }
                          setPushSingleAccountId(account.id);
                          setShowPushModal(true);
                        } catch (err) {
                          showToast(err instanceof Error ? err.message : 'เกิดข้อผิดพลาด', 'error');
                        } finally {
                          setTogglingShop(null);
                        }
                      },
                    });
                  }}
                  className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors flex-shrink-0 ${
                    togglingShop === account.id ? 'bg-gray-300 opacity-50 cursor-wait' : isEnabled ? 'bg-primary' : 'bg-gray-300'
                  }`}
                >
                  {togglingShop === account.id ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-3 h-3 border-2 border-gray-500 border-t-transparent rounded-full animate-spin" />
                    </span>
                  ) : (
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform shadow-sm ${
                      isEnabled ? 'translate-x-[13px]' : 'translate-x-[2px]'
                    }`} />
                  )}
                </button>
                <div className="flex items-center gap-1 min-w-0 flex-1">
                  {meta?.icon && <img src={meta.icon} alt="" className="w-3.5 h-3.5 flex-shrink-0" />}
                  <span className={`text-sm truncate ${isEnabled || isOngoing ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'}`}>
                    {account.shop_name}
                  </span>
                  {existingDeal && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      isOngoing
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                    }`}>
                      {isOngoing ? 'ongoing' : 'synced'}
                    </span>
                  )}
                </div>
                {(showBundlePrice || showBundleDiscount) && (
                  <>
                    <input
                      type="number"
                      value={pp?.bundle_price ?? ''}
                      onChange={e => {
                        setPlatformPrices(prev => prev.map(p =>
                          p.account_id === account.id ? { ...p, bundle_price: e.target.value } : p
                        ));
                      }}
                      disabled={!isEnabled || isOngoing}
                      placeholder={
                        isBundleFixPrice
                          ? (bundlePrice ? String(bundlePrice) : '-')
                          : (form.discount_value || '-')
                      }
                      min={0}
                      max={form.discount_type === 'percent' ? 100 : undefined}
                      className="w-20 h-[32px] px-2 text-sm border border-gray-300 dark:border-slate-500 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-transparent disabled:opacity-40 disabled:cursor-not-allowed text-right"
                    />
                    <span className="text-xs text-gray-400 dark:text-slate-500 flex-shrink-0">
                      {form.discount_type === 'percent' ? '%' : '฿'}
                    </span>
                  </>
                )}
              </div>
              {isOngoing && isEnabled && (
                <p className="ml-9 text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">deal กำลัง run — แก้ราคาไม่ได้ (ปิดได้ = หมดอายุใน 5 นาที)</p>
              )}
              {isOngoing && !isEnabled && (
                <p className="ml-9 text-[10px] text-red-500 dark:text-red-400 mt-0.5">deal จะถูกหมดอายุใน 5 นาทีเมื่อบันทึก</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
