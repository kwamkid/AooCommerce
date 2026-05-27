'use client';

import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl';

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Optional icon shown left of the title */
  icon?: ReactNode;
  /** Modal width — default '2xl' */
  size?: ModalSize;
  /** Footer area — pinned to the bottom of the body */
  footer?: ReactNode;
  /** Hide the X close button in the header */
  hideCloseButton?: boolean;
  /** Disable closing when backdrop is clicked */
  disableBackdropClose?: boolean;
  children: ReactNode;
}

/**
 * Generic centered modal. Sizes itself to its content.
 * If content overflows the viewport, the body scrolls — header & footer stay sticky.
 */
export default function Modal({
  open,
  onClose,
  title,
  icon,
  size = '2xl',
  footer,
  hideCloseButton = false,
  disableBackdropClose = false,
  children,
}: ModalProps) {
  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const hasHeader = Boolean(title) || !hideCloseButton;

  return (
    <div className="modal-root">
      <div className="modal-backdrop" onClick={disableBackdropClose ? undefined : onClose} />
      <div className={`modal-panel ${SIZE_CLASS[size]}`}>
        {hasHeader && (
          <div className="modal-header">
            <div className="flex items-center min-w-0">
              {icon && <span className="mr-2 flex-shrink-0">{icon}</span>}
              {title && <h3 className="modal-title">{title}</h3>}
            </div>
            {!hideCloseButton && (
              <button type="button" onClick={onClose} aria-label="ปิด" className="modal-close-btn">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
