'use client';

import { useRef, useEffect, useState } from 'react';
import { Columns3 } from 'lucide-react';
import Checkbox from '@/components/ui/Checkbox';

interface ColumnSettingsDropdownProps<T extends string> {
  configs: { key: T; label: string; alwaysVisible?: boolean }[];
  visible: Set<T>;
  toggle: (key: T) => void;
  buttonClassName?: string;
  dropUp?: boolean;
}

export default function ColumnSettingsDropdown<T extends string>({
  configs,
  visible,
  toggle,
  buttonClassName,
  dropUp,
}: ColumnSettingsDropdownProps<T>) {
  const [show, setShow] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!show) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [show]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setShow(!show)}
        className={buttonClassName || "btn-filter-icon"}
        title="ตั้งค่าคอลัมน์"
      >
        <Columns3 className={buttonClassName ? "w-4 h-4" : "w-5 h-5 text-gray-500"} />
      </button>
      {show && (
        <div className={`absolute right-0 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 py-1 ${dropUp ? 'bottom-full mb-2' : 'mt-2'}`}>
          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase border-b border-gray-100 dark:border-slate-700">
            แสดงคอลัมน์
          </div>
          {configs.filter(c => !c.alwaysVisible).map(col => (
            <div key={col.key} className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700/50">
              <Checkbox checked={visible.has(col.key)} onChange={() => toggle(col.key)} label={col.label} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
