// คัดลอกข้อความ + แจ้งผลด้วย toast — ที่เดียวของทั้งระบบ
//
// เดิมแต่ละหน้าเรียก navigator.clipboard.writeText() เองแล้วเด้ง toast กันคนละแบบ
// ("คัดลอกลิงก์แล้ว" / "คัดลอกแล้ว" / ไม่เด้งเลย) และไม่มีที่ไหน catch เลยสักที่ —
// เบราว์เซอร์บล็อก clipboard (หน้า http, หรือไม่ได้เกิดจากการกดของผู้ใช้โดยตรง)
// ผู้ใช้จะกดแล้วเงียบ นึกว่าคัดลอกได้แล้วไปวางได้ของเก่า
//
// ใช้กับปุ่ม/เมนูที่ "คัดลอกทันที" — ถ้าเป็นช่องแสดงค่าให้ผู้ใช้เห็นด้วย ใช้ <CopyField>
'use client';

import { useCallback } from 'react';
import { useToast } from '@/lib/toast-context';

export function useCopy() {
  const { showToast } = useToast();

  /**
   * @param label สิ่งที่คัดลอก เช่น 'ลิงก์', 'เลขที่ใบเสร็จ' — ว่างได้
   * @returns true เมื่อคัดลอกสำเร็จ
   */
  return useCallback(async (text: string, label?: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(label ? `คัดลอก${label}แล้ว` : 'คัดลอกแล้ว', 'success');
      return true;
    } catch {
      showToast('คัดลอกไม่สำเร็จ — ลองเลือกข้อความแล้วคัดลอกเอง', 'error');
      return false;
    }
  }, [showToast]);
}
