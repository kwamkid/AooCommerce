'use client';

import { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, Filter } from 'lucide-react';

export interface DropdownOption {
  id: string;
  label: string;
  icon?: string;        // URL for icon image
  platformIcon?: string; // URL for platform badge overlay
}

interface SearchableDropdownProps {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;         // e.g. "ช่องทาง", "ผู้เปิดบิล"
  searchPlaceholder?: string;  // e.g. "ค้นหาช่องทาง..."
  allLabel?: string;           // e.g. "ทั้งหมด" (default)
  /** Extra fixed options shown before the dynamic list (e.g. "เปิดบิลตรง") */
  extraOptions?: { id: string; label: string; icon?: React.ReactNode }[];
}

export default function SearchableDropdown({
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  allLabel = 'ทั้งหมด',
  extraOptions,
}: SearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selected = options.find(o => o.id === value);
  const selectedExtra = extraOptions?.find(o => o.id === value);
  const isActive = value !== 'all';

  const displayLabel = selected?.label || selectedExtra?.label || placeholder;

  const filteredOptions = options.filter(
    o => !search || o.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative flex-shrink-0" ref={dropdownRef}>
      <button
        onClick={() => {
          setOpen(!open);
          setSearch('');
          setTimeout(() => searchRef.current?.focus(), 50);
        }}
        className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm transition-colors ${
          isActive
            ? 'border-[#F4511E] bg-orange-50 dark:bg-orange-900/20 text-[#F4511E]'
            : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:border-gray-400 dark:hover:border-slate-500'
        }`}
      >
        {/* Selected icon */}
        {selected?.icon ? (
          <div className="relative flex-shrink-0">
            <img src={selected.icon} alt="" className="w-5 h-5 rounded-full object-cover" />
            {selected.platformIcon && (
              <img src={selected.platformIcon} alt="" className="absolute -bottom-0.5 -left-0.5 w-2.5 h-2.5 rounded bg-white dark:bg-slate-800 p-[0.5px]" />
            )}
          </div>
        ) : selected?.platformIcon ? (
          <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
            <img src={selected.platformIcon} alt="" className="w-3 h-3" />
          </div>
        ) : !isActive ? (
          <Filter className="w-4 h-4" />
        ) : null}
        <span className="whitespace-nowrap">{isActive ? displayLabel : placeholder}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full mt-1 right-0 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg z-30 min-w-[220px] py-1">
          {/* Search */}
          <div className="px-2 py-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder || `ค้นหา${placeholder}...`}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#F4511E]"
              />
            </div>
          </div>

          <div className="max-h-[280px] overflow-y-auto">
            {/* "All" option */}
            {!search && (
              <button
                onClick={() => handleSelect('all')}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                  value === 'all' ? 'bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'
                }`}
              >
                <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <Filter className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" />
                </div>
                <span>{allLabel}</span>
              </button>
            )}

            {/* Extra fixed options */}
            {extraOptions?.filter(o => !search || o.label.toLowerCase().includes(search.toLowerCase())).map(o => (
              <button
                key={o.id}
                onClick={() => handleSelect(o.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                  value === o.id ? 'bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'
                }`}
              >
                {o.icon || (
                  <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                    <Filter className="w-3.5 h-3.5 text-gray-400 dark:text-slate-400" />
                  </div>
                )}
                <span>{o.label}</span>
              </button>
            ))}

            {/* Separator between fixed and dynamic */}
            {extraOptions && extraOptions.length > 0 && !search && (
              <div className="h-px bg-gray-200 dark:bg-slate-600 my-1" />
            )}

            {/* Dynamic options */}
            {filteredOptions.map(o => (
              <button
                key={o.id}
                onClick={() => handleSelect(o.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors ${
                  value === o.id ? 'bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] font-medium' : 'text-gray-700 dark:text-slate-300'
                }`}
              >
                <div className="relative flex-shrink-0">
                  {o.icon ? (
                    <img src={o.icon} alt="" className="w-6 h-6 rounded-full object-cover" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-slate-600 flex items-center justify-center">
                      {o.platformIcon && (
                        <img src={o.platformIcon} alt="" className="w-3.5 h-3.5" />
                      )}
                    </div>
                  )}
                  {o.icon && o.platformIcon && (
                    <img src={o.platformIcon} alt="" className="absolute -bottom-0.5 -left-0.5 w-3 h-3 rounded bg-white dark:bg-slate-800 p-[0.5px]" />
                  )}
                </div>
                <span className="truncate">{o.label}</span>
              </button>
            ))}

            {/* No results */}
            {filteredOptions.length === 0 && (!extraOptions || extraOptions.filter(o => o.label.toLowerCase().includes(search.toLowerCase())).length === 0) && (
              <div className="px-3 py-3 text-sm text-gray-400 dark:text-slate-500 text-center">
                ไม่พบผลลัพธ์
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
