'use client';

import { useState, useCallback, ReactNode } from 'react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

interface ConfirmOptions {
  title: string;
  description?: string;
  children?: ReactNode;
  icon?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  confirmIcon?: ReactNode;
}

/**
 * Hook that replaces native `confirm()` with ConfirmDialog component.
 *
 * Usage:
 * ```tsx
 * const { confirmDialog, confirm } = useConfirmDialog();
 *
 * const handleDelete = async () => {
 *   const ok = await confirm({
 *     title: 'ลบรายการนี้?',
 *     description: 'ไม่สามารถกู้คืนได้',
 *     variant: 'danger',
 *     confirmLabel: 'ลบ',
 *   });
 *   if (!ok) return;
 *   // proceed with delete...
 * };
 *
 * return <>{confirmDialog}{/* rest of UI *\/}</>
 * ```
 */
export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    options: ConfirmOptions;
    resolve: ((value: boolean) => void) | null;
  }>({
    open: false,
    options: { title: '' },
    resolve: null,
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      setState({ open: true, options, resolve });
    });
  }, []);

  const handleClose = useCallback(() => {
    state.resolve?.(false);
    setState({ open: false, options: { title: '' }, resolve: null });
  }, [state]);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState({ open: false, options: { title: '' }, resolve: null });
  }, [state]);

  const confirmDialog = (
    <ConfirmDialog
      open={state.open}
      onClose={handleClose}
      onConfirm={handleConfirm}
      title={state.options.title}
      description={state.options.description}
      icon={state.options.icon}
      confirmLabel={state.options.confirmLabel}
      cancelLabel={state.options.cancelLabel}
      variant={state.options.variant}
      confirmIcon={state.options.confirmIcon}
    >
      {state.options.children}
    </ConfirmDialog>
  );

  return { confirmDialog, confirm };
}
