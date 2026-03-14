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
  className?: string;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

export default function ActionMenu({ items }: { items: ActionItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    // Position menu above the button, aligned to right edge
    setMenuPos({
      top: rect.top - 4, // 4px gap above button
      left: rect.right,  // right-aligned
    });
  }, []);

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
        className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          className="fixed w-max min-w-[11rem] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1"
          style={{
            top: menuPos.top,
            left: menuPos.left,
            transform: 'translate(-100%, -100%)',
            zIndex: 9999,
          }}
        >
          {items.map((item) => (
            <div key={item.key}>
              {item.dividerBefore && <div className="border-t border-gray-200 dark:border-slate-700 my-1" />}
              <button
                onClick={(e) => { e.stopPropagation(); if (item.disabled) return; setOpen(false); item.onClick?.(e); }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 whitespace-nowrap transition-colors ${
                  item.disabled
                    ? 'text-gray-400 dark:text-slate-500 cursor-default'
                    : item.danger
                      ? 'text-red-500 hover:bg-gray-50 dark:hover:bg-slate-700'
                      : item.className
                        ? `${item.className} hover:bg-gray-50 dark:hover:bg-slate-700`
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
                }`}
              >
                {item.icon}
                <span className="flex flex-col flex-1">
                  <span>{item.label}</span>
                  {item.description && <span className="text-xs font-normal text-gray-400 dark:text-slate-500">{item.description}</span>}
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
