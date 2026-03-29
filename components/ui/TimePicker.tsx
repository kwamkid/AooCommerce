'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';

interface TimePickerProps {
  value: string; // "HH:mm" format
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  popupDirection?: 'down' | 'up';
}

export default function TimePicker({
  value,
  onChange,
  placeholder = 'เลือกเวลา',
  disabled = false,
  popupDirection = 'down',
}: TimePickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  // Parse value
  const parts = value ? value.split(':') : [];
  const selectedHour = parts.length >= 2 ? parseInt(parts[0], 10) : -1;
  const selectedMinute = parts.length >= 2 ? parseInt(parts[1], 10) : -1;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Scroll to selected values when opening
  useEffect(() => {
    if (!open) return;
    const scrollTo = (ref: React.RefObject<HTMLDivElement | null>, index: number) => {
      if (ref.current && index >= 0) {
        const item = ref.current.children[index] as HTMLElement;
        if (item) {
          ref.current.scrollTop = item.offsetTop - ref.current.offsetTop - 60;
        }
      }
    };
    requestAnimationFrame(() => {
      scrollTo(hourListRef, selectedHour);
      scrollTo(minuteListRef, selectedMinute);
    });
  }, [open, selectedHour, selectedMinute]);

  const setTime = useCallback((h: number, m: number) => {
    const hh = h.toString().padStart(2, '0');
    const mm = m.toString().padStart(2, '0');
    onChange(`${hh}:${mm}`);
  }, [onChange]);

  const selectHour = (h: number) => {
    setTime(h, selectedMinute >= 0 ? selectedMinute : 0);
  };

  const selectMinute = (m: number) => {
    setTime(selectedHour >= 0 ? selectedHour : 0, m);
  };

  const increment = (field: 'hour' | 'minute') => {
    const h = selectedHour >= 0 ? selectedHour : 0;
    const m = selectedMinute >= 0 ? selectedMinute : 0;
    if (field === 'hour') {
      setTime((h + 1) % 24, m);
    } else {
      setTime(h, (m + 1) % 60);
    }
  };

  const decrement = (field: 'hour' | 'minute') => {
    const h = selectedHour >= 0 ? selectedHour : 0;
    const m = selectedMinute >= 0 ? selectedMinute : 0;
    if (field === 'hour') {
      setTime((h + 23) % 24, m);
    } else {
      setTime(h, (m + 59) % 60);
    }
  };

  const displayValue = value
    ? `${parts[0]?.padStart(2, '0')}:${parts[1]?.padStart(2, '0')} น.`
    : '';

  return (
    <div ref={containerRef} className="relative">
      {/* Input display */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={`w-full h-[42px] px-3 border rounded-lg text-sm font-normal text-left flex items-center transition-colors ${
          disabled
            ? 'bg-gray-100 dark:bg-slate-600 cursor-not-allowed opacity-60'
            : 'bg-white dark:bg-slate-700 cursor-pointer'
        } ${
          open
            ? 'ring-2 ring-primary border-transparent'
            : 'border-gray-300 dark:border-slate-600'
        } ${
          displayValue
            ? 'text-gray-900 dark:text-white'
            : 'text-gray-400 dark:text-slate-500'
        }`}
      >
        <span className="flex-1 truncate">{displayValue || placeholder}</span>
        <Clock className="w-4 h-4 text-amber-500 flex-shrink-0 ml-2" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className={`absolute right-0 z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg w-full min-w-[180px] overflow-hidden ${popupDirection === 'up' ? 'bottom-full mb-1' : 'mt-1'}`}>
          {/* Spinners */}
          <div className="flex items-stretch divide-x divide-gray-200 dark:divide-slate-600">
            {/* Hour */}
            <div className="flex-1 flex flex-col items-center">
              <button
                type="button"
                onClick={() => increment('hour')}
                className="w-full flex justify-center py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <div
                ref={hourListRef}
                className="w-full h-[84px] overflow-y-auto scrollbar-thin"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectHour(i)}
                    className={`w-full text-center py-1.5 text-sm transition-colors ${
                      i === selectedHour
                        ? 'bg-amber-500 text-white font-medium'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {i.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => decrement('hour')}
                className="w-full flex justify-center py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>

            {/* Separator label */}
            <div className="flex items-center px-1">
              <span className="text-lg font-bold text-gray-400 dark:text-slate-500">:</span>
            </div>

            {/* Minute */}
            <div className="flex-1 flex flex-col items-center">
              <button
                type="button"
                onClick={() => increment('minute')}
                className="w-full flex justify-center py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
              <div
                ref={minuteListRef}
                className="w-full h-[84px] overflow-y-auto scrollbar-thin"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectMinute(i)}
                    className={`w-full text-center py-1.5 text-sm transition-colors ${
                      i === selectedMinute
                        ? 'bg-amber-500 text-white font-medium'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    {i.toString().padStart(2, '0')}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => decrement('minute')}
                className="w-full flex justify-center py-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Now button + confirm */}
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-slate-600 px-3 py-2">
            <button
              type="button"
              onClick={() => {
                const now = new Date();
                setTime(now.getHours(), now.getMinutes());
              }}
              className="text-xs text-amber-500 hover:text-amber-600 dark:hover:text-amber-400 font-medium transition-colors"
            >
              ตอนนี้
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-1 text-xs bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors font-medium"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
