'use client';

import { useRef, useEffect, useState } from 'react';
import { Columns3 } from 'lucide-react';

interface ColumnSettingsDropdownProps<T extends string> {
  configs: { key: T; label: string; alwaysVisible?: boolean }[];
  visible: Set<T>;
  toggle: (key: T) => void;
}

export default function ColumnSettingsDropdown<T extends string>({
  configs,
  visible,
  toggle,
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
        className="btn-filter-icon"
        title="ตั้งค่าคอลัมน์"
      >
        <Columns3 className="w-5 h-5 text-gray-500" />
      </button>
      {show && (
        <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg z-10 py-1">
          <div className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-slate-400 uppercase border-b border-gray-100 dark:border-slate-700">
            แสดงคอลัมน์
          </div>
          {configs.filter(c => !c.alwaysVisible).map(col => (
            <label key={col.key} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer">
              <input
                type="checkbox"
                checked={visible.has(col.key)}
                onChange={() => toggle(col.key)}
                className="w-3.5 h-3.5 text-[#F4511E] border-gray-300 dark:border-slate-500 rounded focus:ring-[#F4511E]"
              />
              <span className="text-sm text-gray-700 dark:text-slate-300">{col.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
