'use client';

import { useState, useRef, useEffect } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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

      {/* Mobile: dropdown */}
      <div className="relative sm:hidden" ref={ref}>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
          className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {open && (
          <div className="absolute right-0 bottom-full mb-1 w-44 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-50 py-1">
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
          </div>
        )}
      </div>
    </>
  );
}
