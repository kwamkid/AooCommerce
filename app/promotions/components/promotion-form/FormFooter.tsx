'use client';

import { Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
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
    <div className="flex justify-end gap-3 pt-2 pb-6">
      {isEdit && (
        <Button
          variant="danger"
          icon={<Trash2 className="w-4 h-4" />}
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
        >
          ลบ
        </Button>
      )}
      <Button variant="secondary" onClick={() => router.push('/promotions')}>
        ยกเลิก
      </Button>
      <SaveButton loading={saving} onClick={handleSubmit} />
    </div>
  );
}
