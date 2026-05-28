'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Globe } from 'lucide-react';

const PLATFORMS = [
  { id: 'all', label: 'ทุกแพลตฟอร์ม', icon: '' },
  { id: 'facebook', label: 'Facebook', icon: '/social/facebook.svg' },
  { id: 'line', label: 'LINE OA', icon: '/social/line_oa.svg' },
  { id: 'shopee', label: 'Shopee', icon: '/marketplace/shopee.svg' },
  { id: 'tiktok', label: 'TikTok', icon: '/marketplace/tiktok_shop.svg' },
  { id: 'lazada', label: 'Lazada', icon: '/marketplace/lazada.svg' },
  { id: 'instagram', label: 'Instagram', icon: '/social/instagram.svg' },
  { id: 'manual', label: 'เปิดบิลตรง', icon: '' },
];

interface PlatformChipFilterProps {
  value: string;          // 'all' | platform id
  onChange: (value: string) => void;
  className?: string;
}

export default function PlatformChipFilter({ value, onChange, className }: PlatformChipFilterProps) {
  const selected = PLATFORMS.find(p => p.id === value) || PLATFORMS[0];

  return (
    <div className={className || ''}>
      {/* Mobile: dropdown */}
      <MobileDropdown value={value} onChange={onChange} selected={selected} />
      {/* Desktop: chips */}
      <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
        {PLATFORMS.map((p) => {
          const isActive = value === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                isActive
                  ? 'border-gray-800 dark:border-white bg-gray-800 dark:bg-white text-white dark:text-gray-900'
                  : 'border-gray-200 dark:border-slate-600 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {p.icon ? <img src={p.icon} alt="" className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function MobileDropdown({ value, onChange, selected }: {
  value: string;
  onChange: (value: string) => void;
  selected: typeof PLATFORMS[number];
}) {
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

  return (
    <div ref={ref} className="relative sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-2 px-3 h-10 rounded-lg border text-sm font-medium transition-colors ${
          value !== 'all'
            ? 'border-gray-800 dark:border-white bg-gray-800 dark:bg-white text-white dark:text-gray-900'
            : 'border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-300 bg-white dark:bg-slate-700'
        }`}
      >
        {selected.icon ? <img src={selected.icon} alt="" className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
        <span>{selected.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg py-1 min-w-[180px]">
          {PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => { onChange(p.id); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                value === p.id
                  ? 'bg-gray-100 dark:bg-slate-700 font-medium text-gray-900 dark:text-white'
                  : 'text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700'
              }`}
            >
              {p.icon ? <img src={p.icon} alt="" className="w-4 h-4" /> : <Globe className="w-4 h-4 text-gray-400 dark:text-slate-500" />}
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
