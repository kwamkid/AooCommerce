'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface ActionItem {
  key: string;
  label: React.ReactNode;
  description?: string;
  icon: React.ReactNode;
  /** Optional node rendered at the far right of the menu item (e.g. a print status dot) */
  suffix?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  /** เน้นเมนูที่ต้องเด่นจริง ๆ เท่านั้น (เช่น 'text-primary font-medium' ของ "พิมพ์ทั้งหมด")
   *  — สี/ระยะปกติมาจาก `.action-menu-item` ห้ามส่งคลาสปุ่มไอคอน (p-1.5 text-gray-400 …) มาที่นี่ */
  className?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

interface ActionMenuProps {
  items: ActionItem[];
  /** Custom trigger content (replaces the default three-dot icon) */
  trigger?: React.ReactNode;
  /** ClassName for the trigger button — required look when using a custom trigger (e.g. "btn btn-md btn-primary") */
  triggerClassName?: string;
  /** Menu opens above (default — table rows) or below the trigger (header buttons) */
  placement?: 'top' | 'bottom';
}

export default function ActionMenu({ items, trigger, triggerClassName, placement = 'top' }: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // Right-aligned; above the button by default, below for header triggers
    setMenuPos({
      top: placement === 'bottom' ? rect.bottom + 4 : rect.top - 4,
      left: rect.right,
    });
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const handleClose = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleScroll = () => setOpen(false);

    document.addEventListener('mousedown', handleClose);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClose);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [open, updatePosition]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className={triggerClassName ?? 'p-1.5 text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700'}
      >
        {trigger ?? <MoreVertical className="w-4 h-4" />}
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed w-max min-w-[11rem] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            transform: placement === 'bottom' ? 'translateX(-100%)' : 'translate(-100%, -100%)',
            zIndex: 9999,
          }}
        >
          {items.map((item, idx) => (
            <div key={item.key}>
              {idx > 0 && item.dividerBefore && <div className="border-t border-gray-200 dark:border-slate-700 my-1" />}
              <button
                onClick={(e) => { e.stopPropagation(); if (item.disabled) return; setOpen(false); item.onClick?.(e); }}
                // หน้าตาทั้งหมดอยู่ที่ `.action-menu-item` ใน globals.css ที่เดียว
                // (เขียนคลาสเต็มเป็น literal เพื่อให้ Tailwind มองเห็น ไม่ถูก purge)
                className={[
                  item.disabled ? 'action-menu-item disabled'
                    : item.danger ? 'action-menu-item danger'
                    : 'action-menu-item',
                  item.className || '',
                ].filter(Boolean).join(' ')}
              >
                {item.icon}
                <span className="flex flex-col flex-1">
                  <span>{item.label}</span>
                  {item.description && <span className="action-menu-item-desc">{item.description}</span>}
                </span>
                {item.suffix}
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
