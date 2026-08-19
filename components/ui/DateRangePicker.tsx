'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { DayPicker, DateRange } from 'react-day-picker';
import { format, isValid, startOfMonth, endOfMonth, subDays, startOfDay, addMonths, subMonths } from 'date-fns';
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
  /** Minimum selectable date — dates before this are disabled */
  minDate?: Date;
  /**
   * วันในสัปดาห์ที่เลือกไม่ได้ (0=อาทิตย์ … 6=เสาร์)
   * เช่นร้านที่หยุดวันอาทิตย์ ส่ง [0] แล้ววันอาทิตย์จะกดไม่ได้ทั้งปฏิทิน
   */
  disabledDaysOfWeek?: number[];
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

// Shared DayPicker classNames
const DAY_PICKER_SINGLE_CLASSES = {
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
  // วงแหวนรอบปุ่มด้านใน ไม่ใช่รอบ <td> — ปุ่มเป็น rounded-full อยู่แล้ว
  // ขอบจึงเป็นวงกลมพอดี · ขีดเส้นใต้แบบเดิมจางเกินจนหาวันนี้ไม่เจอ
  today: 'font-bold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-amber-400 [&>button]:text-amber-600 dark:[&>button]:text-amber-400',
  selected: '!bg-amber-500 !text-white !rounded-full hover:!bg-amber-600',
  outside: 'text-gray-300 dark:text-slate-600',
  disabled: 'text-gray-300 dark:text-slate-600 cursor-not-allowed',
};

const DAY_PICKER_RANGE_CLASSES = {
  months: '',
  month: '',
  month_caption: 'hidden',
  nav: 'hidden',
  month_grid: 'w-full border-collapse',
  weekdays: '',
  weekday: 'text-xs font-semibold text-gray-400 dark:text-slate-500 pb-2 w-10 text-center',
  week: '',
  day: 'text-center p-0',
  day_button: 'w-10 h-10 text-sm rounded-full hover:bg-amber-200 dark:hover:bg-amber-800/40 transition-colors text-gray-700 dark:text-slate-300 focus:outline-none',
  // วงแหวนรอบปุ่มด้านใน ไม่ใช่รอบ <td> — ปุ่มเป็น rounded-full อยู่แล้ว
  // ขอบจึงเป็นวงกลมพอดี · ขีดเส้นใต้แบบเดิมจางเกินจนหาวันนี้ไม่เจอ
  today: 'font-bold [&>button]:ring-1 [&>button]:ring-inset [&>button]:ring-amber-400 [&>button]:text-amber-600 dark:[&>button]:text-amber-400',
  selected: '!bg-amber-400 dark:!bg-amber-600 !text-white',
  range_start: '!bg-amber-500 !text-white !rounded-l-full',
  range_end: '!bg-amber-500 !text-white !rounded-r-full',
  range_middle: '!bg-amber-400 dark:!bg-amber-600 !rounded-none !text-white',
  outside: 'text-gray-300 dark:text-slate-600',
  disabled: 'text-gray-300 dark:text-slate-600 cursor-not-allowed',
};

// Override for hidden outside days — prevents range background from bleeding into adjacent months
const RANGE_MODIFIERS_CLASSES = {
  hidden: '[&]:!bg-transparent [&]:dark:!bg-transparent [&]:!text-transparent',
};

// Calendar header component (reusable for left/right panels)
function CalendarHeader({
  month,
  onPrev,
  onNext,
  onMonthClick,
  onYearClick,
  showPrev = true,
  showNext = true,
}: {
  month: Date;
  onPrev?: () => void;
  onNext?: () => void;
  onMonthClick: () => void;
  onYearClick: () => void;
  showPrev?: boolean;
  showNext?: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-2">
      {showPrev ? (
        <button
          type="button"
          onClick={onPrev}
          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-500" />
        </button>
      ) : (
        <div className="w-7" />
      )}

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onMonthClick}
          className="px-2 py-1 text-base font-bold text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          {THAI_MONTHS_FULL[month.getMonth()]}
        </button>
        <button
          type="button"
          onClick={onYearClick}
          className="px-2 py-1 text-base font-bold text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          {month.getFullYear() + 543}
        </button>
      </div>

      {showNext ? (
        <button
          type="button"
          onClick={onNext}
          className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          <ChevronRight className="w-5 h-5 text-gray-500" />
        </button>
      ) : (
        <div className="w-7" />
      )}
    </div>
  );
}

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
  disabledDaysOfWeek,
  readOnly = false,
  popupDirection = 'down',
  popupAlign = 'left',
  minDate,
}: DateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('calendar');
  const [displayMonth, setDisplayMonth] = useState<Date>(new Date());
  const [yearPageStart, setYearPageStart] = useState(() => Math.floor(new Date().getFullYear() / 12) * 12);
  // Which side the month/year picker is for: 'left' or 'right' (desktop dual calendar)
  const [pickerSide, setPickerSide] = useState<'left' | 'right'>('left');

  const isSingle = asSingle || !useRange;

  // Disable dates before minDate
  const disabledDays = useMemo(() => {
    const rules: Array<{ before: Date } | { dayOfWeek: number[] }> = [];
    if (minDate) rules.push({ before: minDate });
    if (disabledDaysOfWeek?.length) rules.push({ dayOfWeek: disabledDaysOfWeek });
    return rules.length ? rules : undefined;
  }, [minDate, disabledDaysOfWeek]);

  const startDate = useMemo(() => toDate(value?.startDate), [value?.startDate]);
  const endDate = useMemo(() => toDate(value?.endDate), [value?.endDate]);

  // Range selection phase: 'idle' → 'start_picked' → 'idle'
  // 'idle' = no selection in progress (either empty or complete range)
  // 'start_picked' = start date chosen, waiting for end date
  const [selectionPhase, setSelectionPhase] = useState<'idle' | 'start_picked'>('idle');

  // Right month for dual calendar
  const rightMonth = useMemo(() => addMonths(displayMonth, 1), [displayMonth]);

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

  // We handle range selection manually via onDayClick for full control.
  // DayPicker's onSelect is ignored — we compute start/end ourselves.
  const handleDayClick = useCallback((day: Date) => {
    if (selectionPhase === 'idle') {
      // First click: set start, clear end
      onChange({ startDate: toISOString(day), endDate: null });
      setSelectionPhase('start_picked');
    } else {
      // Second click: set end (ensure start < end)
      const currentStart = startDate;
      if (currentStart && day < currentStart) {
        // Clicked before start — swap: clicked becomes start, old start becomes end
        onChange({ startDate: toISOString(day), endDate: toISOString(currentStart) });
      } else {
        onChange({ startDate: currentStart ? toISOString(currentStart) : toISOString(day), endDate: toISOString(day) });
      }
      setSelectionPhase('idle');
      if (!showFooter) {
        setOpen(false);
        setViewMode('calendar');
      }
    }
  }, [selectionPhase, startDate, onChange, showFooter]);

  // no-op — we handle everything in onDayClick
  const handleRangeSelect = useCallback((_range: DateRange | undefined) => {
    // intentionally empty
  }, []);

  const handleShortcut = useCallback((shortcut: Shortcut) => {
    const { from, to } = shortcut.getValue();
    onChange({ startDate: toISOString(from), endDate: toISOString(to) });
    setSelectionPhase('idle');
    setOpen(false);
    setViewMode('calendar');
  }, [onChange]);

  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onChange({ startDate: null, endDate: null });
    setSelectionPhase('idle');
  }, [onChange]);

  const handleMonthClick = useCallback((monthIndex: number) => {
    if (pickerSide === 'right') {
      // Right panel: set so that right month is the selected month
      const newDate = new Date(displayMonth.getFullYear(), monthIndex - 1, 1);
      setDisplayMonth(newDate);
    } else {
      const newDate = new Date(displayMonth.getFullYear(), monthIndex, 1);
      setDisplayMonth(newDate);
    }
    setViewMode('calendar');
  }, [displayMonth, pickerSide]);

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

  // Month/Year Selector panel
  function MonthYearSelector() {
    const targetMonth = pickerSide === 'right' ? rightMonth : displayMonth;
    return (
      <>
        {viewMode === 'months' && (
          <div className="grid grid-cols-3 gap-2 py-2" style={{ width: 280 }}>
            {THAI_MONTHS_SHORT.map((name, i) => {
              const isActive = targetMonth.getMonth() === i;
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

        {viewMode === 'years' && (
          <div className="grid grid-cols-3 gap-2 py-2" style={{ width: 280 }}>
            {Array.from({ length: 12 }, (_, i) => yearPageStart + i).map((year) => {
              const isActive = targetMonth.getFullYear() === year;
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
      </>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <button
        type="button"
        onClick={() => { if (!disabled && !readOnly) { setOpen(!open); if (!open) setSelectionPhase('idle'); } }}
        className={`w-full h-[42px] px-3 border border-gray-300 dark:border-slate-500 rounded-lg text-sm font-normal bg-white dark:bg-slate-700 text-left flex items-center gap-2 transition-colors ${
          open ? 'ring-2 ring-primary border-transparent' : 'hover:border-gray-400 dark:hover:border-slate-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Calendar className={`w-4 h-4 flex-shrink-0 ${readOnly ? 'text-gray-400 dark:text-slate-500' : 'text-amber-500'}`} />
        {displayText ? (
          <span className={`truncate flex-1 ${readOnly ? 'text-gray-400 dark:text-slate-500' : 'text-gray-900 dark:text-white'}`}>{displayText}</span>
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
              {/* Single mode OR Mobile range (1 calendar) */}
              {isSingle ? (
                <>
                  <CalendarHeader
                    month={displayMonth}
                    onPrev={() => {
                      if (viewMode === 'calendar') setDisplayMonth(subMonths(displayMonth, 1));
                      else if (viewMode === 'years') setYearPageStart(p => p - 12);
                    }}
                    onNext={() => {
                      if (viewMode === 'calendar') setDisplayMonth(addMonths(displayMonth, 1));
                      else if (viewMode === 'years') setYearPageStart(p => p + 12);
                    }}
                    onMonthClick={() => { setPickerSide('left'); setViewMode(viewMode === 'months' ? 'calendar' : 'months'); }}
                    onYearClick={() => { setPickerSide('left'); setViewMode(viewMode === 'years' ? 'calendar' : 'years'); setYearPageStart(Math.floor(displayMonth.getFullYear() / 12) * 12); }}
                  />
                  {viewMode === 'calendar' ? (
                    <DayPicker
                      mode="single"
                      selected={startDate}
                      onSelect={handleSingleSelect}
                      month={displayMonth}
                      onMonthChange={setDisplayMonth}
                      formatters={{ formatWeekdayName: (date) => format(date, 'EEE').toUpperCase() }}
                      hideNavigation
                      disabled={disabledDays}
                      classNames={DAY_PICKER_SINGLE_CLASSES}
                    />
                  ) : (
                    <MonthYearSelector />
                  )}
                </>
              ) : (
                <>
                  {/* ── Mobile: 1 calendar ── */}
                  <div className="md:hidden">
                    <CalendarHeader
                      month={displayMonth}
                      onPrev={() => {
                        if (viewMode === 'calendar') setDisplayMonth(subMonths(displayMonth, 1));
                        else if (viewMode === 'years') setYearPageStart(p => p - 12);
                      }}
                      onNext={() => {
                        if (viewMode === 'calendar') setDisplayMonth(addMonths(displayMonth, 1));
                        else if (viewMode === 'years') setYearPageStart(p => p + 12);
                      }}
                      onMonthClick={() => { setPickerSide('left'); setViewMode(viewMode === 'months' ? 'calendar' : 'months'); }}
                      onYearClick={() => { setPickerSide('left'); setViewMode(viewMode === 'years' ? 'calendar' : 'years'); setYearPageStart(Math.floor(displayMonth.getFullYear() / 12) * 12); }}
                    />
                    {viewMode === 'calendar' ? (
                      <DayPicker
                        mode="range"
                        selected={selected as DateRange | undefined}
                        onSelect={handleRangeSelect}
                        onDayClick={handleDayClick}
                        month={displayMonth}
                        onMonthChange={setDisplayMonth}
                        formatters={{ formatWeekdayName: (date) => format(date, 'EEE').toUpperCase() }}
                        hideNavigation
                        showOutsideDays={false}
                        disabled={disabledDays}
                        classNames={DAY_PICKER_RANGE_CLASSES}
                        modifiersClassNames={RANGE_MODIFIERS_CLASSES}
                      />
                    ) : (
                      <MonthYearSelector />
                    )}
                  </div>

                  {/* ── Desktop: 2 calendars side by side ── */}
                  <div className="hidden md:block">
                    {viewMode === 'calendar' ? (
                      <div className="flex gap-4">
                        {/* Left calendar */}
                        <div>
                          <CalendarHeader
                            month={displayMonth}
                            onPrev={() => setDisplayMonth(subMonths(displayMonth, 1))}
                            showNext={false}
                            onMonthClick={() => { setPickerSide('left'); setViewMode('months'); }}
                            onYearClick={() => { setPickerSide('left'); setViewMode('years'); setYearPageStart(Math.floor(displayMonth.getFullYear() / 12) * 12); }}
                          />
                          <DayPicker
                            mode="range"
                            selected={selected as DateRange | undefined}
                            onSelect={handleRangeSelect}
                        onDayClick={handleDayClick}
                            month={displayMonth}
                            onMonthChange={setDisplayMonth}
                            formatters={{ formatWeekdayName: (date) => format(date, 'EEE').toUpperCase() }}
                            hideNavigation
                            showOutsideDays={false}
                            disabled={disabledDays}
                            classNames={DAY_PICKER_RANGE_CLASSES}
                            modifiersClassNames={RANGE_MODIFIERS_CLASSES}
                          />
                        </div>

                        {/* Divider */}
                        <div className="w-px bg-gray-100 dark:bg-slate-700" />

                        {/* Right calendar */}
                        <div>
                          <CalendarHeader
                            month={rightMonth}
                            onNext={() => setDisplayMonth(addMonths(displayMonth, 1))}
                            showPrev={false}
                            onMonthClick={() => { setPickerSide('right'); setViewMode('months'); }}
                            onYearClick={() => { setPickerSide('right'); setViewMode('years'); setYearPageStart(Math.floor(rightMonth.getFullYear() / 12) * 12); }}
                          />
                          <DayPicker
                            mode="range"
                            selected={selected as DateRange | undefined}
                            onSelect={handleRangeSelect}
                        onDayClick={handleDayClick}
                            month={rightMonth}
                            onMonthChange={(m) => setDisplayMonth(subMonths(m, 1))}
                            formatters={{ formatWeekdayName: (date) => format(date, 'EEE').toUpperCase() }}
                            hideNavigation
                            showOutsideDays={false}
                            disabled={disabledDays}
                            classNames={DAY_PICKER_RANGE_CLASSES}
                            modifiersClassNames={RANGE_MODIFIERS_CLASSES}
                          />
                        </div>
                      </div>
                    ) : (
                      <MonthYearSelector />
                    )}
                  </div>
                </>
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
