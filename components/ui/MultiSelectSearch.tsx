'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

interface MultiSelectSearchProps {
  value: string[];
  onChange: (ids: string[]) => void;
  options: MultiSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Text shown when 0 selected and field is collapsed */
  emptyLabel?: string;
  /** Show "เลือกทั้งหมด" button in dropdown header */
  showSelectAll?: boolean;
  /** Render the trigger as one of: 'chips' (default — shows selected chips inline) | 'count' (shows count text only) */
  triggerStyle?: 'chips' | 'count';
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Max selected chips to show inline before collapsing to "+N more" (default: 8) */
  maxVisibleChips?: number;
  className?: string;
}

export default function MultiSelectSearch({
  value,
  onChange,
  options,
  placeholder = 'เลือก...',
  searchPlaceholder = 'พิมพ์เพื่อค้นหา...',
  emptyLabel,
  showSelectAll = true,
  triggerStyle = 'chips',
  icon,
  disabled,
  maxVisibleChips = 8,
  className,
}: MultiSelectSearchProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedOptions = useMemo(
    () => value.map(id => options.find(o => o.id === id)).filter((o): o is MultiSelectOption => !!o),
    [value, options]
  );

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o =>
      o.label.toLowerCase().includes(q) ||
      (o.subtitle && o.subtitle.toLowerCase().includes(q))
    );
  }, [options, search]);

  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(o => selectedSet.has(o.id));

  // Position dropdown via portal so it doesn't clip
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
      zIndex: 9999,
    });
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const toggleOption = useCallback((id: string) => {
    if (selectedSet.has(id)) {
      onChange(value.filter(v => v !== id));
    } else {
      onChange([...value, id]);
    }
  }, [value, selectedSet, onChange]);

  const removeChip = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(value.filter(v => v !== id));
  }, [value, onChange]);

  const handleSelectAllFiltered = useCallback(() => {
    if (allFilteredSelected) {
      // Deselect all filtered
      const filteredIds = new Set(filteredOptions.map(o => o.id));
      onChange(value.filter(v => !filteredIds.has(v)));
    } else {
      // Select all filtered (union with existing)
      const merged = new Set([...value, ...filteredOptions.map(o => o.id)]);
      onChange(Array.from(merged));
    }
  }, [allFilteredSelected, filteredOptions, value, onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  }, [onChange]);

  // Visible chips (cap to maxVisibleChips, show "+N more")
  const visibleChips = selectedOptions.slice(0, maxVisibleChips);
  const hiddenCount = selectedOptions.length - visibleChips.length;

  return (
    <>
      <div
        ref={triggerRef}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`relative min-h-[42px] w-full px-3 py-2 border rounded-lg cursor-pointer transition flex items-center gap-2 ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-gray-50 dark:bg-slate-700/30'
            : open
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-gray-200 dark:border-slate-700 hover:border-gray-300 bg-white dark:bg-slate-700/50'
        } ${className || ''}`}
      >
        {icon && <span className="flex-shrink-0 text-gray-400">{icon}</span>}
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-1.5">
          {selectedOptions.length === 0 ? (
            <span className="text-gray-400 dark:text-slate-500 text-sm">
              {emptyLabel || placeholder}
            </span>
          ) : triggerStyle === 'count' ? (
            <span className="text-sm text-gray-700 dark:text-slate-300">
              เลือกแล้ว {selectedOptions.length} รายการ
            </span>
          ) : (
            <>
              {visibleChips.map(opt => (
                <span
                  key={opt.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 dark:bg-orange-900/20 text-[#F4511E] dark:text-orange-400 rounded-md text-sm font-medium border border-orange-200 dark:border-orange-800/50"
                >
                  {opt.icon}
                  <span className="truncate max-w-[180px]">{opt.label}</span>
                  <button
                    type="button"
                    onClick={e => removeChip(opt.id, e)}
                    className="hover:bg-orange-200 dark:hover:bg-orange-800/50 rounded p-0.5 -mr-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="text-xs text-gray-500 dark:text-slate-400 px-1">+{hiddenCount} เพิ่มเติม</span>
              )}
            </>
          )}
        </div>
        {selectedOptions.length > 0 && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300 p-0.5 rounded"
            title="ล้างทั้งหมด"
          >
            <X className="w-4 h-4" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropdownRef}
          style={dropdownStyle}
          className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-xl overflow-hidden"
        >
          {/* Search bar */}
          <div className="p-2 border-b border-gray-100 dark:border-slate-700 sticky top-0 bg-white dark:bg-slate-800 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 dark:border-slate-600 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white dark:bg-slate-700/50 text-gray-900 dark:text-white"
              />
            </div>
            {showSelectAll && filteredOptions.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="mt-1.5 w-full text-left px-2 py-1 text-xs text-primary hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded font-medium"
              >
                {allFilteredSelected
                  ? `ยกเลิกการเลือกทั้งหมด${search ? ' (ที่ค้นหา)' : ''} (${filteredOptions.length})`
                  : `เลือกทั้งหมด${search ? ' (ที่ค้นหา)' : ''} (${filteredOptions.length})`}
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-72 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400 dark:text-slate-500">
                ไม่พบรายการ
              </div>
            ) : (
              filteredOptions.map(opt => {
                const isSelected = selectedSet.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleOption(opt.id)}
                    className={`w-full px-3 py-2 text-left flex items-center gap-2.5 transition hover:bg-gray-50 dark:hover:bg-slate-700/50 ${
                      isSelected ? 'bg-orange-50/40 dark:bg-orange-900/10' : ''
                    }`}
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition ${
                      isSelected
                        ? 'bg-primary'
                        : 'border-2 border-gray-300 dark:border-slate-500'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                    </div>
                    {opt.icon && <span className="flex-shrink-0">{opt.icon}</span>}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 dark:text-white truncate">{opt.label}</div>
                      {opt.subtitle && (
                        <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{opt.subtitle}</div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer summary */}
          {selectedOptions.length > 0 && (
            <div className="px-3 py-2 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-700/30 text-xs text-gray-500 dark:text-slate-400 flex items-center justify-between">
              <span>เลือกแล้ว {selectedOptions.length} รายการ</span>
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-red-500 hover:text-red-600 font-medium"
              >
                ล้างทั้งหมด
              </button>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}
