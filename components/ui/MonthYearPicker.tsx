'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { useDropUp } from '@/lib/useDropUp';

const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน',
  'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม',
  'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.',
  'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.',
  'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

interface MonthYearPickerProps {
  month: number;      // 1-12
  year: number;       // CE year (e.g. 2026)
  onChange: (month: number, year: number) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Year range: how many years before current year to show (default: 2) */
  yearsBefore?: number;
  /** Year range: how many years after current year to show (default: 1) */
  yearsAfter?: number;
  portal?: boolean;
}

export default function MonthYearPicker({
  month,
  year,
  onChange,
  placeholder = 'เลือกเดือน/ปี',
  disabled,
  yearsBefore = 2,
  yearsAfter = 1,
  portal = false,
}: MonthYearPickerProps) {
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(year);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const nowYear = new Date().getFullYear();
  const minYear = nowYear - yearsBefore;
  const maxYear = nowYear + yearsAfter;

  // Display value
  const displayText = month && year
    ? `${THAI_MONTHS[month - 1]} ${year + 543}`
    : placeholder;

  // Reset viewYear when opening
  useEffect(() => {
    if (open) setViewYear(year || nowYear);
  }, [open]);

  // Click outside to close
  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (portal && dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open, portal]);

  // Portal positioning — เกณฑ์ "พลิกขึ้น" ใช้ตัวกลาง lib/useDropUp.ts
  // (estimate 300, ไม่มี margin, พลิกเฉพาะตอนข้างบนเหลือมากกว่าข้างล่าง = ค่าเดิม)
  const { dropUp, rect, height: dropdownH } = useDropUp(containerRef, {
    open: open && portal,
    estimatedHeight: 300,
    dropdownRef,
    requireMoreSpaceAbove: true,
  });
  const portalPos = rect
    ? {
        top: dropUp ? rect.top - dropdownH - 4 : rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 280),
      }
    : null;

  // Close on scroll (dropdown would float detached from the trigger)
  useEffect(() => {
    if (!open || !portal) return;
    const handleScroll = () => setOpen(false);
    window.addEventListener('scroll', handleScroll, true);
    return () => window.removeEventListener('scroll', handleScroll, true);
  }, [open, portal]);

  const handleSelect = useCallback((m: number) => {
    onChange(m, viewYear);
    setOpen(false);
  }, [viewYear, onChange]);

  const prevYear = () => setViewYear(v => Math.max(v - 1, minYear));
  const nextYear = () => setViewYear(v => Math.min(v + 1, maxYear));

  const isSelected = (m: number) => m === month && viewYear === year;
  const isCurrentMonth = (m: number) => m === new Date().getMonth() + 1 && viewYear === nowYear;

  const dropdown = open ? (
    <div
      ref={dropdownRef}
      className={`bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg shadow-lg overflow-hidden ${
        portal ? 'fixed z-[9999]' : 'absolute z-40 top-full mt-1 left-0'
      }`}
      style={portal && portalPos
        ? { top: portalPos.top, left: portalPos.left, width: portalPos.width }
        : { minWidth: '280px' }
      }
    >
      {/* Year navigation */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-100 dark:border-slate-700">
        <button
          type="button"
          onClick={prevYear}
          disabled={viewYear <= minYear}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-slate-400" />
        </button>
        <span className="text-base font-semibold text-gray-800 dark:text-white select-none">
          พ.ศ. {viewYear + 543}
        </span>
        <button
          type="button"
          onClick={nextYear}
          disabled={viewYear >= maxYear}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-gray-500 dark:text-slate-400" />
        </button>
      </div>

      {/* Month grid: 4 columns × 3 rows */}
      <div className="grid grid-cols-4 gap-1 p-2">
        {THAI_MONTHS_SHORT.map((label, idx) => {
          const m = idx + 1;
          const sel = isSelected(m);
          const cur = isCurrentMonth(m);
          return (
            <button
              key={m}
              type="button"
              onClick={() => handleSelect(m)}
              className={`px-2 py-2 rounded-md text-sm font-medium transition-colors ${
                sel
                  ? 'bg-primary text-white'
                  : cur
                    ? 'bg-orange-50 dark:bg-orange-900/20 text-primary border border-primary/30'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => { if (!disabled) setOpen(!open); }}
        disabled={disabled}
        className={`w-full flex items-center gap-2 px-3 h-[42px] border rounded-lg text-base text-left transition-colors ${
          open
            ? 'border-gray-400 dark:border-slate-400 ring-2 ring-gray-300/50 dark:ring-slate-400/50 bg-white dark:bg-slate-800'
            : 'border-gray-300 dark:border-slate-500 bg-white dark:bg-slate-800 hover:border-gray-400 dark:hover:border-slate-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <Calendar className="w-4 h-4 flex-shrink-0 text-gray-400 dark:text-slate-400" />
        <span className={`flex-1 truncate ${
          month && year ? 'text-gray-900 dark:text-white' : 'text-gray-400 dark:text-slate-400'
        }`}>
          {displayText}
        </span>
      </button>

      {portal ? (dropdown && createPortal(dropdown, document.body)) : dropdown}
    </div>
  );
}
