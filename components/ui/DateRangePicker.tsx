'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';
import { format, parse, isValid, startOfMonth, endOfMonth, subDays, startOfDay, addMonths, subMonths } from 'date-fns';
import { Calendar, X, ChevronLeft, ChevronRight } from 'lucide-react';

// Re-export DateValueType so consumers don't need to change imports
export type DateValueType = {
  startDate: Date | string | null;
  endDate: Date | string | null;
} | null;

interface DateRangePickerProps {
  value: DateValueType;
  onChange: (value: DateValueType) => void;
  asSingle?: boolean;
  useRange?: boolean;
  showShortcuts?: boolean;
  showFooter?: boolean;
  placeholder?: string;
  displayFormat?: string;
  disabled?: boolean;
  readOnly?: boolean;
  popupDirection?: 'down' | 'up';
  popupAlign?: 'left' | 'right';
}

// Helpers
function toDate(v: Date | string | null | undefined): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return isValid(v) ? v : undefined;
  const d = new Date(v);
  return isValid(d) ? d : undefined;
}

function toISOString(d: Date | undefined): string | null {
  if (!d) return null;
  return format(d, 'yyyy-MM-dd');
}

function formatDisplay(d: Date | undefined, fmt?: string): string {
  if (!d) return '';
  if (fmt === 'short') {
    return `${d.getDate()} ${THAI_MONTHS_SHORT[d.getMonth()]}`;
  }
  return format(d, 'dd/MM/yyyy');
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

const THAI_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

type ViewMode = 'calendar' | 'months' | 'years';

interface Shortcut {
  label: string;
  getValue: () => { from: Date; to: Date };
}

const SHORTCUTS: Shortcut[] = [
  { label: 'วันนี้', getValue: () => { const t = startOfDay(new Date()); return { from: t, to: t }; } },
  { label: 'เมื่อวาน', getValue: () => { const y = subDays(startOfDay(new Date()), 1); return { from: y, to: y }; } },
  { label: '7 วันที่แล้ว', getValue: () => ({ from: subDays(startOfDay(new Date()), 6), to: startOfDay(new Date()) }) },
  { label: '30 วันที่แล้ว', getValue: () => ({ from: subDays(startOfDay(new Date()), 29), to: startOfDay(new Date()) }) },
  { label: 'เดือนนี้', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'เดือนที่แล้ว', getValue: () => { const pm = subMonths(new Date(), 1); return { from: startOfMonth(pm), to: endOfMonth(pm) }; } },
];

export default function DateRangePicker({
  value,
  onChange,
  asSingle = false,
  useRange = true,
  showShortcuts = true,
  showFooter = true,
  placeholder,
  displayFormat,
  disabled = false,
  readOnly = false,
  popupDirection = 'down',
  popupAlign = 'left',
}: DateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [displayMonth, setDisplayMonth] = useState<Date>(new Date());
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(new Date().getFullYear() / 12) * 12);

  // Internal selection state (for range: pending first click)
  const isSingle = asSingle || !useRange;

  const startDate = useMemo(() => toDate(value?.startDate), [value?.startDate]);
  const endDate = useMemo(() => toDate(value?.endDate), [value?.endDate]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setViewMode('calendar');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setViewMode('calendar'); }
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [open]);

  // Sync displayMonth when value changes
  useEffect(() => {
    if (startDate) setDisplayMonth(startDate);
  }, [startDate]);

  const handleSingleSelect = useCallback((date: Date | undefined) => {
    if (!date) return;
    const iso = toISOString(date);
    onChange({ startDate: iso, endDate: iso });
    setOpen(false);
    setViewMode('calendar');
  }, [onChange]);

  const handleRangeSelect = useCallback((range: DateRange | undefined) => {
    if (!range) return;
    const from = range.from;
    const to = range.to;
    if (from && to) {
      onChange({ startDate: toISOString(from), endDate: toISOString(to) });
      if (!showFooter) {
        setOpen(false);
        setViewMode('calendar');
      }
    } else if (from) {
      // First click of range — intermediate state
      onChange({ startDate: toISOString(from), endDate: null });
    }
  }, [onChange, showFooter]);

  const handleShortcut = useCallback((shortcut: Shortcut) => {
    const { from, to } = shortcut.getValue();
    onChange({ startDate: toISOString(from), endDate: toISOString(to) });
    setOpen(false);
    setViewMode('calendar');
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ startDate: null, endDate: null });
  }, [onChange]);

  const handleMonthClick = useCallback((monthIndex: number) => {
    const newDate = new Date(displayMonth.getFullYear(), monthIndex, 1);
    setDisplayMonth(newDate);
    setViewMode('calendar');
  }, [displayMonth]);

  const handleYearClick = useCallback((year: number) => {
    const newDate = new Date(year, displayMonth.getMonth(), 1);
    setDisplayMonth(newDate);
    setViewMode('months');
  }, [displayMonth]);

  // Display text
  const displayText = useMemo(() => {
    if (!startDate) return '';
    const fmt = displayFormat;
    if (isSingle) return formatDisplay(startDate, fmt);
    if (!endDate) return formatDisplay(startDate, fmt) + ' ~ ';
    return `${formatDisplay(startDate, fmt)} ~ ${formatDisplay(endDate, fmt)}`;
  }, [startDate, endDate, isSingle, displayFormat]);

  const hasValue = !!startDate;

  // DayPicker selected value
  const selected = useMemo(() => {
    if (isSingle) return startDate;
    if (!startDate) return undefined;
    return { from: startDate, to: endDate } as DateRange;
  }, [isSingle, startDate, endDate]);

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <button
        type="button"
        onClick={() => { if (!disabled && !readOnly) setOpen(!open); }}
        className={`w-full h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm font-normal bg-white dark:bg-slate-700 text-left flex items-center gap-2 transition-colors ${
          open ? 'ring-2 ring-[#F4511E] border-transparent' : 'hover:border-gray-400 dark:hover:border-slate-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Calendar className="w-4 h-4 text-amber-500 flex-shrink-0" />
        {displayText ? (
          <span className="text-gray-900 dark:text-white truncate flex-1">{displayText}</span>
        ) : (
          <span className="text-gray-400 dark:text-slate-400 truncate flex-1">{placeholder || 'เลือกวันที่'}</span>
        )}
        {hasValue && !disabled && !readOnly && (
          <span
            onClick={handleClear}
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-slate-600 rounded transition-colors flex-shrink-0"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </span>
        )}
      </button>

      {/* Popup */}
      {open && (
        <div className={`absolute z-50 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-xl shadow-xl overflow-hidden ${popupDirection === 'up' ? 'bottom-full mb-1' : 'mt-1'} ${popupAlign === 'right' ? 'right-0' : 'left-0'}`}>
          <div className="flex">
            {/* Shortcuts */}
            {showShortcuts && !isSingle && (
              <div className="w-36 border-r border-gray-100 dark:border-slate-700 py-2 flex flex-col">
                {SHORTCUTS.map((s) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => handleShortcut(s)}
                    className="px-3 py-1.5 text-sm text-gray-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-700 dark:hover:text-amber-400 text-left transition-colors"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {/* Calendar area */}
            <div className="p-3">
              {/* Custom Header */}
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'calendar') setDisplayMonth(subMonths(displayMonth, 1));
                    else if (viewMode === 'years') setYearPageStart(p => p - 12);
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-gray-500" />
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === 'months' ? 'calendar' : 'months')}
                    className="px-2 py-1 text-base font-bold text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    {THAI_MONTHS_FULL[displayMonth.getMonth()]}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode(viewMode === 'years' ? 'calendar' : 'years');
                      setYearPageStart(Math.floor(displayMonth.getFullYear() / 12) * 12);
                    }}
                    className="px-2 py-1 text-base font-bold text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    {displayMonth.getFullYear() + 543}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (viewMode === 'calendar') setDisplayMonth(addMonths(displayMonth, 1));
                    else if (viewMode === 'years') setYearPageStart(p => p + 12);
                  }}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              {/* Calendar View */}
              {viewMode === 'calendar' && (
                <div>
                  {isSingle ? (
                    <DayPicker
                      mode="single"
                      selected={startDate}
                      onSelect={handleSingleSelect}
                      month={displayMonth}
                      onMonthChange={setDisplayMonth}
                      formatters={{
                        formatWeekdayName: (date) => format(date, 'EEE').toUpperCase(),
                      }}
                      hideNavigation
                      classNames={{
                        months: '',
                        month: '',
                        month_caption: 'hidden',
                        nav: 'hidden',
                        month_grid: 'w-full border-collapse',
                        weekdays: '',
                        weekday: 'text-xs font-semibold text-gray-400 dark:text-slate-500 pb-2 w-10 text-center',
                        week: '',
                        day: 'text-center p-0',
                        day_button: 'w-10 h-10 text-sm rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-gray-700 dark:text-slate-300 focus:outline-none',
                        today: 'font-bold text-amber-600 dark:text-amber-400 ring-2 ring-amber-400 dark:ring-amber-500 rounded-full',
                        selected: '!bg-amber-500 !text-white !rounded-full hover:!bg-amber-600',
                        outside: 'text-gray-300 dark:text-slate-600',
                        disabled: 'text-gray-300 dark:text-slate-600 cursor-not-allowed',
                      }}
                    />
                  ) : (
                    <DayPicker
                      mode="range"
                      selected={selected as DateRange | undefined}
                      onSelect={handleRangeSelect}
                      month={displayMonth}
                      onMonthChange={setDisplayMonth}
                      formatters={{
                        formatWeekdayName: (date) => format(date, 'EEE').toUpperCase(),
                      }}
                      hideNavigation
                      classNames={{
                        months: '',
                        month: '',
                        month_caption: 'hidden',
                        nav: 'hidden',
                        month_grid: 'w-full border-collapse',
                        weekdays: '',
                        weekday: 'text-xs font-semibold text-gray-400 dark:text-slate-500 pb-2 w-10 text-center',
                        week: '',
                        day: 'text-center p-0',
                        day_button: 'w-10 h-10 text-sm rounded-full hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors text-gray-700 dark:text-slate-300 focus:outline-none',
                        today: 'font-bold text-amber-600 dark:text-amber-400 ring-2 ring-amber-400 dark:ring-amber-500 rounded-full',
                        selected: '!bg-amber-100 dark:!bg-amber-900/30 !text-amber-800 dark:!text-amber-200',
                        range_start: '!bg-amber-500 !text-white !rounded-l-full !rounded-r-none',
                        range_end: '!bg-amber-500 !text-white !rounded-r-full !rounded-l-none',
                        range_middle: '!bg-amber-100 dark:!bg-amber-900/30 !rounded-none !text-amber-800 dark:!text-amber-200',
                        outside: 'text-gray-300 dark:text-slate-600',
                        disabled: 'text-gray-300 dark:text-slate-600 cursor-not-allowed',
                      }}
                    />
                  )}
                </div>
              )}

              {/* Month Selector */}
              {viewMode === 'months' && (
                <div className="grid grid-cols-3 gap-2 py-2" style={{ width: 280 }}>
                  {THAI_MONTHS_SHORT.map((name, i) => {
                    const isActive = displayMonth.getMonth() === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleMonthClick(i)}
                        className={`py-3 text-base font-bold rounded-lg transition-colors ${
                          isActive
                            ? 'bg-amber-500 text-white'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Year Selector */}
              {viewMode === 'years' && (
                <div className="grid grid-cols-3 gap-2 py-2" style={{ width: 280 }}>
                  {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((year) => {
                    const isActive = displayMonth.getFullYear() === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => handleYearClick(year)}
                        className={`py-3 text-base font-bold rounded-lg transition-colors ${
                          isActive
                            ? 'bg-amber-500 text-white'
                            : 'text-gray-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                        }`}
                      >
                        {year + 543}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Footer */}
              {showFooter && !isSingle && (
                <div className="flex items-center justify-end gap-2 pt-2 mt-2 border-t border-gray-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setViewMode('calendar'); }}
                    className="px-3 py-1.5 text-xs text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); setViewMode('calendar'); }}
                    disabled={!startDate || !endDate}
                    className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ตกลง
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
