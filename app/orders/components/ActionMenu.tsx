'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

export interface ActionItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  className?: string;
  danger?: boolean;
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
      {/* Desktop: inline icons */}
      <div className="hidden sm:flex items-center gap-0.5">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            className={item.className || 'p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700'}
            title={item.label}
          >
            {item.icon}
          </button>
        ))}
      </div>

      {/* Mobile: dropdown via portal */}
      <div className="sm:hidden">
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
            className="fixed w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg py-1"
            style={{
              top: menuPos.top,
              left: menuPos.left - 176, // 176 = w-44 = 11rem
              transform: 'translateY(-100%)',
              zIndex: 9999,
            }}
          >
            {items.map((item) => (
              <button
                key={item.key}
                onClick={(e) => { e.stopPropagation(); setOpen(false); item.onClick(e); }}
                className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                  item.danger ? 'text-red-500' : 'text-gray-700 dark:text-slate-300'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
      </div>
    </>
  );
}
