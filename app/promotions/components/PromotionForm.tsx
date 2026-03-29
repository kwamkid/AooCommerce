'use client';

import { ArrowLeft } from 'lucide-react';
import { usePromotionForm } from './promotion-form/usePromotionForm';
import GeneralInfoCard from './promotion-form/GeneralInfoCard';
import BundleSetSection from './promotion-form/BundleSetSection';
import QtyDiscountSection from './promotion-form/QtyDiscountSection';
import BuyGetSection from './promotion-form/BuyGetSection';
import FormFooter from './promotion-form/FormFooter';
import FormModals from './promotion-form/FormModals';

export default function PromotionForm({ promotionId }: { promotionId?: string }) {
  const hook = usePromotionForm(promotionId);
  const { router, isEdit, form, setForm, loadingPromo } = hook;

  if (loadingPromo) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const isBuyGet = form.promotion_type === 'buy_get_free' || form.promotion_type === 'buy_get_discount';

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header with back button + toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/promotions')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600 dark:text-slate-400" />
          </button>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {isEdit ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่น'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setForm(prev => ({ ...prev, is_active: !prev.is_active }))}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              form.is_active ? 'bg-primary' : 'bg-gray-300'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
              form.is_active ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
          <span className="text-base text-gray-500 dark:text-slate-400">
            {form.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
          </span>
        </div>
      </div>

      {/* Type selector + General info + Marketplace */}
      <GeneralInfoCard hook={hook} />

      {/* Type-specific items section */}
      {isBuyGet && <BuyGetSection hook={hook} />}
      {form.promotion_type === 'bundle_set' && <BundleSetSection hook={hook} />}
      {form.promotion_type === 'qty_discount' && <QtyDiscountSection hook={hook} />}

      {/* Shopee sync status + modals (rendered inline where needed) */}
      <FormModals hook={hook} />

      {/* Save/Cancel/Delete buttons */}
      <FormFooter hook={hook} />
    </div>
  );
}
