'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Check, Loader2, ChevronDown } from 'lucide-react';

export interface EntitySearchOption {
  id: string;
  label: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

interface EntitySearchInputProps {
  value: string;
  onChange: (id: string, option: EntitySearchOption) => void;
  onClear?: () => void;
  options: EntitySearchOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  /** Custom display when selected (overrides default selected card) */
  selectedDisplay?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
  helperText?: string;
  /** Called when search text changes — for API-based search. When provided, internal filtering is skipped. */
  onSearchChange?: (search: string) => void;
  /** Show loading spinner in the dropdown */
  loading?: boolean;
  /** Minimum characters before showing dropdown (default: 0 for client-side, useful for API search) */
  minSearchLength?: number;
  /** Auto-focus the input when mounted */
  autoFocus?: boolean;
  /** Custom empty state message */
  emptyMessage?: string;
}

export default function EntitySearchInput({
  value,
  onChange,
  onClear,
  options,
  placeholder = 'ค้นหา...',
  selectedDisplay,
  icon,
  disabled,
  helperText,
  onSearchChange,
  loading,
  minSearchLength = 0,
  autoFocus,
  emptyMessage,
}: EntitySearchInputProps) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  // Internal flag: true from the moment user types until parent loading cycle completes
  const [pendingSearch, setPendingSearch] = useState(false);
  // Mobile fullscreen modal mode
  const [mobileModal, setMobileModal] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find(o => o.id === value);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

  // Track when parent loading has started so we only clear pendingSearch after loading completes
  const loadingStartedRef = useRef(false);
  useEffect(() => {
    if (loading) {
      loadingStartedRef.current = true;
    } else if (loadingStartedRef.current) {
      // loading went true→false: API call finished
      loadingStartedRef.current = false;
      setPendingSearch(false);
    }
  }, [loading]);

  // Also clear pendingSearch when options change (for parents that don't use loading prop)
  const prevOptionsLenRef = useRef(options.length);
  useEffect(() => {
    if (pendingSearch && options.length !== prevOptionsLenRef.current) {
      setPendingSearch(false);
    }
    prevOptionsLenRef.current = options.length;
  }, [options.length, pendingSearch]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Effective loading: either parent says loading, or we just fired onSearchChange and parent hasn't responded yet
  const isLoading = loading || (pendingSearch && onSearchChange != null);

  // When onSearchChange is provided (API mode), skip internal filtering — options are already filtered
  const filtered = onSearchChange
    ? options
    : search
      ? options.filter(o =>
          o.label.toLowerCase().includes(search.toLowerCase()) ||
          o.subtitle?.toLowerCase().includes(search.toLowerCase())
        )
      : options;

  // Click outside to close (desktop only)
  useEffect(() => {
    if (!open || mobileModal) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        setPendingSearch(false);
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, mobileModal]);

  // Reset highlight when search changes
  useEffect(() => {
    setHighlightIdx(search ? 0 : -1);
  }, [search]);

  // Calculate dropdown position — desktop only (fixed, so it floats above everything)
  useEffect(() => {
    if (!open || mobileModal || !inputRef.current) return;
    const update = () => {
      if (!inputRef.current) return;
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, mobileModal]);

  // Lock body scroll when mobile modal is open
  useEffect(() => {
    if (!mobileModal) return;
    document.body.style.overflow = 'hidden';
    // Transfer focus from proxy input to modal input.
    // On iOS, keyboard stays open if focus moves between inputs without delay.
    requestAnimationFrame(() => {
      mobileInputRef.current?.focus();
    });
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileModal]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightIdx < 0 || !listRef.current) return;
    const items = listRef.current.querySelectorAll('[data-option]');
    items[highlightIdx]?.scrollIntoView({ block: 'nearest' });
  }, [highlightIdx]);

  const handleSelect = useCallback((option: EntitySearchOption) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPendingSearch(false);
    onChange(option.id, option);
    setOpen(false);
    setMobileModal(false);
    setSearch('');
  }, [onChange]);

  const handleClear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPendingSearch(false);
    onClear?.();
    setSearch('');
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [onClear]);

  const closeMobileModal = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setPendingSearch(false);
    setMobileModal(false);
    setOpen(false);
    setSearch('');
  }, []);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    if (!open) setOpen(true);
    if (onSearchChange) {
      setPendingSearch(val.length >= minSearchLength);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(val);
      }, 300);
    }
  }, [open, onSearchChange, minSearchLength]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!open) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIdx(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIdx(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIdx >= 0 && filtered[highlightIdx]) {
          handleSelect(filtered[highlightIdx]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (mobileModal) {
          closeMobileModal();
        } else {
          if (debounceRef.current) clearTimeout(debounceRef.current);
          setPendingSearch(false);
          setOpen(false);
          setSearch('');
        }
        break;
    }
  }, [open, filtered, highlightIdx, handleSelect, mobileModal, closeMobileModal]);

  // Shared option list renderer
  const renderOptions = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        </div>
      );
    }
    if (filtered.length === 0) {
      return (
        <div className="px-3 py-4 text-sm text-gray-400 dark:text-slate-500 text-center">
          {emptyMessage || 'ไม่พบผลลัพธ์'}
        </div>
      );
    }
    return filtered.map((o, idx) => (
      <button
        key={o.id}
        data-option
        type="button"
        onClick={() => handleSelect(o)}
        onMouseEnter={() => setHighlightIdx(idx)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-base transition-colors ${
          idx === highlightIdx
            ? 'bg-gray-50 dark:bg-slate-700'
            : ''
        } text-gray-700 dark:text-slate-300`}
      >
        {o.icon && <span className="flex-shrink-0">{o.icon}</span>}
        <div className="flex-1 min-w-0 text-left">
          <div className="truncate font-medium">{o.label}</div>
          {o.subtitle && (
            <div className="text-xs text-gray-400 dark:text-slate-500 truncate">{o.subtitle}</div>
          )}
        </div>
      </button>
    ));
  };

  // Show selected state
  if (value && selected) {
    if (selectedDisplay) {
      return (
        <div className="relative" ref={containerRef}>
          {selectedDisplay}
          {!disabled && onClear && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5 text-gray-400" />
            </button>
          )}
        </div>
      );
    }

    return (
      <div ref={containerRef} className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-900/20 border border-[#F4511E]/30 rounded-lg">
        {selected.icon && <span className="flex-shrink-0">{selected.icon}</span>}
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium text-gray-900 dark:text-slate-200 truncate">{selected.label}</div>
          {selected.subtitle && (
            <div className="text-xs text-gray-500 dark:text-slate-400 truncate">{selected.subtitle}</div>
          )}
        </div>
        <Check className="w-4 h-4 text-[#F4511E] flex-shrink-0" />
        {!disabled && onClear && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1 hover:bg-orange-100 dark:hover:bg-orange-900/40 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>
    );
  }

  // Show search input
  return (
    <div className="relative" ref={containerRef} onKeyDown={handleKeyDown}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500">
          {icon || <Search className="w-4 h-4" />}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          onFocus={() => {
            if (!isMobile) {
              if (search || options.length <= 20) setOpen(true);
            }
          }}
          onClick={() => {
            if (isMobile && !disabled) {
              // On iOS, the keyboard opens because this input gets focus from tap.
              // We open the modal and transfer focus to modal input via requestAnimationFrame
              // so the keyboard stays open.
              setMobileModal(true);
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          className={`w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E] transition-colors ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
      </div>

      {/* Desktop Dropdown — fixed, floats above everything */}
      {open && !mobileModal && (search.length >= minSearchLength) && (search || options.length <= 20) && (
        <div style={dropdownStyle} className="z-[100] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden flex flex-col">
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1 flex-1">
            {renderOptions()}
          </div>
        </div>
      )}

      {/* Mobile Modal (top sheet with backdrop) */}
      {mobileModal && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[199] bg-black/40" onClick={closeMobileModal} />
          {/* Panel — centered */}
          <div className="fixed inset-x-4 top-[15vh] z-[200] bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-h-[55vh] flex flex-col">
            {/* Search input */}
            <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-slate-700">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500">
                  {icon || <Search className="w-4 h-4" />}
                </span>
                <input
                  ref={mobileInputRef}
                  type="text"
                  value={search}
                  onChange={e => handleSearchChange(e.target.value)}
                  placeholder={placeholder}
                  autoComplete="off"
                  autoCorrect="off"
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-700 text-gray-900 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-[#F4511E]/50 focus:border-[#F4511E]"
                />
              </div>
              <button
                type="button"
                onClick={closeMobileModal}
                className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Result list */}
            <div ref={listRef} className="flex-1 overflow-y-auto">
              {(search.length >= minSearchLength) && (search || options.length <= 20)
                ? renderOptions()
                : (
                  <div className="px-3 py-8 text-sm text-gray-400 dark:text-slate-500 text-center">
                    พิมพ์เพื่อค้นหา...
                  </div>
                )
              }
            </div>
          </div>
        </>
      )}

      {helperText && !open && (
        <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">{helperText}</p>
      )}
    </div>
  );
}
