'use client';

import { useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Search, X } from 'lucide-react';

export interface SearchInputHandle {
  focus: () => void;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when user presses Enter */
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  /** Custom ring color class, e.g. 'focus:ring-[#06C755]'. Default: 'focus:ring-[#F4511E]' */
  ringColor?: string;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

const SearchInput = forwardRef<SearchInputHandle, SearchInputProps>(function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'ค้นหา...',
  className = '',
  ringColor = 'focus:ring-[#F4511E]',
  autoFocus = false,
}, ref) {
  const inputRef = useRef<HTMLInputElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
  }));

  const handleClear = useCallback(() => {
    onChange('');
    inputRef.current?.focus();
  }, [onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onChange('');
    }
    if (e.key === 'Enter' && onSubmit) {
      onSubmit();
    }
  }, [onChange, onSubmit]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={`w-full pl-9 pr-8 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 ${ringColor} focus:border-transparent ${className}`}
      />
      {value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 rounded-full transition-colors"
          tabIndex={-1}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

export default SearchInput;
