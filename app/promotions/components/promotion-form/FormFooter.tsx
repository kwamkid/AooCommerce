'use client';

import { Save, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { UsePromotionFormReturn } from './usePromotionForm';

interface Props {
  hook: UsePromotionFormReturn;
}

export default function FormFooter({ hook }: Props) {
  const {
    router,
    isEdit,
    saving,
    shopeeDeals,
    setConfirmDialog,
    handleSubmit,
    showToast,
    promotionId,
  } = hook;

  return (
    <div className="flex items-center justify-end gap-3 pt-2 pb-6">
      {isEdit && (
        <button
          type="button"
          onClick={() => {
            const hasOngoing = shopeeDeals.some(d => d.status === 'ongoing');
            const dealCount = shopeeDeals.length;
            setConfirmDialog({
              message: 'ลบโปรโมชั่นนี้?',
              detail: dealCount > 0
                ? hasOngoing
                  ? `โปรโมชั่นนี้กำลัง active อยู่บน Shopee ${dealCount} ร้าน — deal จะถูกปิดทันที`
                  : `โปรโมชั่นนี้ sync กับ Shopee ${dealCount} ร้าน — deal จะถูกลบจาก Shopee`
                : undefined,
              confirmLabel: dealCount > 0 ? 'ลบทั้งหมด (รวม Shopee)' : 'ยืนยันลบ',
              onConfirm: async () => {
                setConfirmDialog(null);
                try {
                  if (dealCount > 0) {
                    await apiFetch(`/api/shopee/deals?promotion_id=${promotionId}`, { method: 'DELETE' });
                  }
                  await apiFetch(`/api/promotions/${promotionId}`, { method: 'DELETE' });
                  showToast('ลบโปรโมชั่นสำเร็จ');
                  router.push('/promotions');
                } catch {
                  showToast('เกิดข้อผิดพลาดในการลบ', 'error');
                }
              },
            });
          }}
          className="flex items-center gap-2 px-5 py-2.5 text-base font-medium text-red-600 dark:text-red-400 bg-white dark:bg-slate-800 border border-red-300 dark:border-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          ลบ
        </button>
      )}
      <button
        onClick={() => router.push('/promotions')}
        className="px-5 py-2.5 text-base font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
      >
        ยกเลิก
      </button>
      <button
        onClick={handleSubmit}
        disabled={saving}
        className="flex items-center gap-2 px-5 py-2.5 text-base font-medium text-white bg-primary rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
      >
        <Save className="w-4 h-4" />
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
