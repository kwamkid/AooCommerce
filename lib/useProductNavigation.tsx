'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { productReturnUrl } from '@/lib/product-navigation';

/** Explicit return destination also works in a user-opened tab with no history. */
export function useProductNavigation() {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = productReturnUrl(params.get('returnTo'));
  const [dirty, setDirty] = useState(false);
  const { confirm, confirmDialog } = useConfirmDialog();

  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  const allowLeave = async () => !dirty || await confirm({
    title: 'ยังมีข้อมูลที่ไม่ได้บันทึก',
    description: 'ต้องการออกจากหน้านี้และทิ้งการแก้ไขหรือไม่?',
    confirmLabel: 'ทิ้งการแก้ไข',
    cancelLabel: 'แก้ไขต่อ',
    variant: 'danger',
  });
  const back = async () => {
    if (await allowLeave()) router.push(returnTo);
  };
  return { returnTo, setDirty, back, allowLeave, confirmDialog };
}
