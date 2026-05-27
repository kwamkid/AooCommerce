'use client';

import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import Card from './Card';

/* ============================================================
 * Pure CSS/SVG charts — no extra dependencies.
 *
 * For complex/interactive charts (multi-series line, scatter, etc.)
 * install `recharts` and add a wrapper component to this file.
 * ============================================================ */

/* ---------- Stat — single KPI box ---------- */

export type StatTrend = 'up' | 'down' | 'flat';

interface StatProps {
  label: ReactNode;
  /** Main numeric/text value (large) */
  value: ReactNode;
  /** Optional secondary subtitle under the value */
  subtitle?: ReactNode;
  /** Period-over-period delta — pass with trend */
  delta?: ReactNode;
  trend?: StatTrend;
  /** Optional icon shown in the top-right corner */
  icon?: ReactNode;
}

const TREND_STYLES: Record<StatTrend, { cls: string; Icon: typeof TrendingUp }> = {
  up:   { cls: 'text-emerald-600 dark:text-emerald-400', Icon: TrendingUp },
  down: { cls: 'text-red-600 dark:text-red-400',         Icon: TrendingDown },
  flat: { cls: 'text-gray-500 dark:text-slate-400',       Icon: Minus },
};

export function Stat({ label, value, subtitle, delta, trend, icon }: StatProps) {
  const t = trend ? TREND_STYLES[trend] : null;
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-gray-500 dark:text-slate-400">{label}</div>
          <div className="text-2xl font-bold text-gray-900 dark:text-white mt-1 truncate">{value}</div>
          {subtitle && (
            <div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
          )}
          {(delta !== undefined && t) && (
            <div className={`inline-flex items-center gap-1 text-xs font-medium mt-2 ${t.cls}`}>
              <t.Icon className="w-3.5 h-3.5" />
              {delta}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-primary flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ---------- ProgressBar — single horizontal bar ---------- */

interface ProgressBarProps {
  /** 0-100 percent OR pass `value` + `max` */
  value: number;
  max?: number;
  /** Bar color class — default primary */
  toneClass?: string;
  /** Show "X / Y" or custom right-aligned label */
  label?: ReactNode;
  /** Height — default 'md' */
  size?: 'sm' | 'md' | 'lg';
}

const PROGRESS_HEIGHT: Record<NonNullable<ProgressBarProps['size']>, string> = {
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

export function ProgressBar({
  value,
  max = 100,
  toneClass = 'bg-[#F4511E]',
  label,
  size = 'md',
}: ProgressBarProps) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="w-full">
      {label && (
        <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 mb-1.5">
          {label}
        </div>
      )}
      <div className={`w-full bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden ${PROGRESS_HEIGHT[size]}`}>
        <div
          className={`${PROGRESS_HEIGHT[size]} ${toneClass} rounded-full transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ---------- BarChart — vertical bars, no axis (sparkline-y) ---------- */

interface BarChartProps {
  data: { label: ReactNode; value: number }[];
  /** Max bar height in pixels — default 120 */
  height?: number;
  /** Bar color class — default primary */
  toneClass?: string;
  /** Show value above the bar */
  showValues?: boolean;
  /** Number formatter for the value labels */
  formatValue?: (v: number) => string;
}

export function BarChart({
  data,
  height = 120,
  toneClass = 'bg-[#F4511E]',
  showValues = false,
  formatValue = (v) => v.toLocaleString('th-TH'),
}: BarChartProps) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end justify-around gap-2 w-full" style={{ height: height + 32 }}>
      {data.map((d, i) => {
        const h = (d.value / max) * height;
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="flex flex-col items-center justify-end flex-1" style={{ height }}>
              {showValues && d.value > 0 && (
                <div className="text-xs font-medium text-gray-700 dark:text-slate-300 mb-1">
                  {formatValue(d.value)}
                </div>
              )}
              <div
                className={`w-full max-w-[40px] ${toneClass} rounded-t transition-all hover:opacity-80`}
                style={{ height: `${h}px` }}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400 text-center truncate w-full">
              {d.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Sparkline — tiny SVG line chart ---------- */

interface SparklineProps {
  /** Numeric series — line drawn left-to-right */
  data: number[];
  width?: number;
  height?: number;
  /** Stroke color — supports tailwind text-* via currentColor */
  strokeClass?: string;
  /** Fill area under the line */
  fillClass?: string;
}

export function Sparkline({
  data,
  width = 120,
  height = 32,
  strokeClass = 'text-[#F4511E]',
  fillClass,
}: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const areaPath = `M0,${height} L${points} L${width},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={strokeClass}>
      {fillClass && <path d={areaPath} className={`${fillClass} fill-current opacity-20`} />}
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
