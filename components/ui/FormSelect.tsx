'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface FormSelectOption {
  id: string;
  label: string;
  /** Secondary text shown below label */
  subtitle?: string;
  /** React node icon shown before label */
  icon?: React.ReactNode;
  /** Indent level for hierarchical lists (0 = top, 1 = nested under parent). */
  level?: number;
  /** Override label in the trigger only (list still shows `label`).
   *  Use for breadcrumb display, e.g. `"เสื้อผ้า > เสื้อยืด"`. */
  triggerLabel?: string;
}

export type FormSelectSize = 'sm' | 'md' | 'lg';

/** Trigger height classes — defined in globals.css under .form-control-{size}.
 *  Heights match `.btn-{size}` so triggers line up with buttons in toolbars. */
const TRIGGER_SIZE: Record<FormSelectSize, string> = {
  sm: 'form-control-sm',
  md: 'form-control-md',
  lg: 'form-control-lg',
};

interface FormSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Icon shown inside the trigger button (left side) */
  icon?: React.ReactNode;
  disabled?: boolean;
  /** Trigger size — must align with Button when used in toolbars. Default 'md' (40px). */
  size?: FormSelectSize;
  /** Enable search when options > this threshold (default: 5) */
  searchThreshold?: number;
  /** If set, show a "clear/all" option at top that resets value. Label = this string (e.g. "ทั้งหมด") */
  clearLabel?: string;
  /** Value to set when clearLabel option is selected (default: '') */
  clearValue?: string;
  /** Render dropdown via portal to escape overflow:hidden containers */
  portal?: boolean;
}

export default function FormSelect({
  value,
  onChange,
  options,
  placeholder = '-- เลือก --',
  searchPlaceholder = 'ค้นหา...',
  icon,
  disabled,
  size = 'md',
  searchThreshold = 7,
  clearLabel,
  clearValue = '',
  portal = false,
}: FormSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [portalPos, setPortalPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find(o => o.id === value);
  const showSearch = options.length > searchThreshold;

  const filtered = search
    ? options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase()) ||
        o.subtitle?.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  // Build full list: clearLabel option + filtered options
  const allItems: { id: string; label: string; isClear?: boolean; icon?: React.ReactNode; subtitle?: string; level?: number }[] = [];
  if (clearLabel && !search) {
    allItems.push({ id: clearValue, label: clearLabel, isClear: true });
  }
  filtered.forEach(o => allItems.push(o));

  // Click outside to close (check both container and portal dropdown)
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (portal && dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, portal]);

  // Portal positioning: calculate dropdown position from trigger button
  useEffect(() => {
    if (!open || !portal || !containerRef.current) {
      setPortalPos(null);
      return;
    }
    const updatePos = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownH = dropdownRef.current?.offsetHeight || 280;
      // If not enough space below, show above
      const showAbove = spaceBelow < dropdownH && rect.top > spaceBelow;
      setPortalPos({
        top: showAbove ? rect.top - dropdownH - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePos();
    // Close on outside scroll (dropdown would float detached from trigger), but
    // ignore scrolls inside the dropdown's own scrollable list.
    const handleScroll = (e: Event) => {
      if (dropdownRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setSearch('');
    };
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open, portal]);

  // Focus search when opened
  useEffect(() => {
    if (open && showSearch) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open, showSearch]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIdx(search ? 0 : -1);
  }, [search]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-option]');
    items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  const handleSelect = useCallback((id: string) => {
    onChange(id);
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(prev => Math.min(prev + 1, allItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && allItems[highlightIdx]) {
          handleSelect(allItems[highlightIdx].id);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSearch('');
        break;
    }
  }, [open, allItems, highlightIdx, handleSelect]);

  // For filter mode: show active state when value is selected
  const isActive = clearLabel && value !== clearValue;

  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => {
          if (disabled) return;
          setOpen(!open);
          setSearch('');
          setHighlightIdx(-1);
        }}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 ${TRIGGER_SIZE[size]} border rounded-lg text-left transition-colors ${
          open
            ? 'border-gray-400 dark:border-slate-400 ring-2 ring-gray-300/50 dark:ring-slate-400/50 bg-white dark:bg-slate-800'
            : isActive
              ? 'border-gray-400 dark:border-slate-400 bg-white dark:bg-slate-800'
              : 'border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-800 hover:border-gray-400 dark:hover:border-slate-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {icon && <span className="flex-shrink-0 text-gray-400 dark:text-slate-400">{icon}</span>}
        {selected?.icon && <span className="flex-shrink-0">{selected.icon}</span>}
        <span className={`flex-1 truncate ${
          selected ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-400'
        }`}>
          {selected?.triggerLabel || selected?.label || (clearLabel && value === clearValue ? clearLabel : placeholder)}
        </span>
        <ChevronDown className={`w-4 h-4 flex-shrink-0 transition-transform text-gray-400 dark:text-slate-400 ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {open && (() => {
        const dropdown = (
          <div
            ref={dropdownRef}
            className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden ${
              portal ? 'fixed z-[9999]' : 'absolute z-40 top-full mt-1 left-0 right-0'
            }`}
            // `minWidth` instead of fixed `width` lets the dropdown grow if its
            // longest option exceeds the trigger width (prevents truncation like
            // "7 วันล่า..." when the trigger is auto-sized).
            style={portal && portalPos ? { top: portalPos.top, left: portalPos.left, minWidth: portalPos.width, maxWidth: 'min(420px, calc(100vw - 16px))' } : undefined}
          >
            {/* Search */}
            {showSearch && (
              <div className="px-2 py-2 border-b border-gray-100 dark:border-slate-700">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder={searchPlaceholder}
                    className="w-full pl-8 pr-3 py-1.5 text-base border border-gray-200 dark:border-slate-600 rounded-md bg-gray-50 dark:bg-slate-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            )}

            {/* Options list */}
            <div ref={listRef} className="max-h-[240px] overflow-y-auto py-1">
              {allItems.map((o, idx) => {
                const level = !o.isClear ? (o.level || 0) : 0;
                return (
                <button
                  key={o.isClear ? '__clear__' : o.id}
                  data-option
                  type="button"
                  onClick={() => handleSelect(o.id)}
                  style={level > 0 ? { paddingLeft: `${16 + level * 20}px` } : undefined}
                  // Mouse-hover highlight is CSS-only (no setState on every
                  // mouseenter) — avoids re-rendering the whole list on hover.
                  // Keyboard nav still uses `highlightIdx` state.
                  className={`w-full flex items-center gap-2.5 px-4 py-2 pr-8 text-sm transition-colors hover:bg-gray-50 dark:hover:bg-slate-700 ${
                    idx === highlightIdx
                      ? 'bg-gray-50 dark:bg-slate-700'
                      : ''
                  } ${
                    o.id === value
                      ? 'text-primary font-medium'
                      : 'text-gray-700 dark:text-slate-300'
                  }`}
                >
                  {level > 0 && (
                    <span className="text-gray-300 dark:text-slate-600 flex-shrink-0 select-none">└</span>
                  )}
                  {o.icon && <span className="flex-shrink-0">{o.icon}</span>}
                  {/* `whitespace-nowrap` keeps the label intact so the dropdown
                      grows to fit it (capped by maxWidth on the dropdown root).
                      Was previously `min-w-0 truncate` — that forced labels like
                      "7 วันล่าสุด" to render as "7 วันล่า…" even with extra space. */}
                  <div className="flex-1 text-left">
                    <div className="whitespace-nowrap">{o.label}</div>
                    {o.subtitle && (
                      <div className="text-xs text-gray-400 dark:text-slate-500 whitespace-nowrap">{o.subtitle}</div>
                    )}
                  </div>
                  {o.id === value && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                </button>
                );
              })}
              {allItems.length === 0 && (
                <div className="px-3 py-4 text-sm text-gray-400 dark:text-slate-500 text-center">
                  ไม่พบผลลัพธ์
                </div>
              )}
            </div>
          </div>
        );
        return portal ? createPortal(dropdown, document.body) : dropdown;
      })()}
    </div>
  );
}
