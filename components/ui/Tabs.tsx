// Shared content tabs — แท็บทรงการ์ด (ค่าปกติ) หรือแบบเส้นใต้.
//
// Use for navigating between content panels (e.g. settings sections) or
// switching views within a single page (e.g. chat-channels FB/IG vs LINE).
//
// Two modes:
// - Link-based: pass `href` on each tab → uses Next.js <Link> for route-based tabs.
//   Wire `activeKey` from the current pathname.
// - State-based: pass `onSelect` → caller controls activeKey via local state.
//   (`href` and `onSelect` can coexist; `onSelect` fires first.)
//
// For list-page status tabs with big count badges, use <StatusTabs> instead.
'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export interface TabItem {
  /** Tab identifier — matched against `activeKey` to determine selection. */
  key: string;
  label: ReactNode;
  /** Optional left icon — same node passed straight in. */
  icon?: ReactNode;
  /** Small count pill on the right (rendered only when > 0 or explicitly 0). */
  count?: number;
  /** When set, renders as a Next.js <Link> instead of a <button>. */
  href?: string;
  /** Override the active border + text color (default brand orange). */
  activeColorClass?: string;
  /** Hide entirely (feature-gated tabs etc). */
  hidden?: boolean;
}

interface TabsProps {
  tabs: TabItem[];
  activeKey: string;
  /** Fires before navigation (if `href` set). Useful for resetting form state. */
  onSelect?: (key: string) => void;
  className?: string;
  /**
   * แท็บแบ่งความกว้างเท่า ๆ กันเต็มแถว (แทนที่จะชิดซ้ายตามความยาวคำ)
   * ใช้กับแถบสลับมุมมองบนมือถือ — หน้า PC, จอขาย POS, ตัวเลือกอิโมจิ/สติกเกอร์
   */
  fill?: boolean;
  /** 'sm' = แท็บย่อยในการ์ด (โปรโมชั่นรายแพลตฟอร์ม) · 'md' = ค่าปกติของหน้า */
  size?: 'sm' | 'md';
  /**
   * `card` (ค่าปกติ) = แท็บที่ active ยกขึ้นเป็นการ์ดขาวบนรางสีเทา + ขีดสั้นสีของแท็บ
   * `underline` = แบบเดิม เส้นใต้เต็มความกว้างแท็บ ใช้เมื่อแท็บอยู่บนพื้นที่ไม่มีรางให้วาง
   */
  variant?: 'card' | 'underline';
}

export default function Tabs({ tabs, activeKey, onSelect, className, fill, size = 'md', variant = 'card' }: TabsProps) {
  // Base layout (flex + bottom border + scroll on overflow) is always applied;
  // caller's `className` is merged on top — typically just for spacing overrides
  // like `mb-6` / `mt-0`. Don't use `??` here — that would let a caller passing
  // `className="mb-6"` accidentally drop the flex + border-b and tabs would stack.
  const isCard = variant === 'card';
  const baseCls = isCard
    ? 'flex gap-1 p-1 bg-gray-100 dark:bg-slate-800/80 rounded-xl mb-6 overflow-x-auto'
    : 'flex border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto';
  return (
    <div className={className ? `${baseCls} ${className}` : baseCls}>
      {tabs.filter(t => !t.hidden).map(tab => {
        const isActive = tab.key === activeKey;
        const activeColor = tab.activeColorClass ?? 'border-primary text-primary';
        const sizeCls = size === 'sm' ? 'px-3 py-2 text-xs gap-1.5' : 'px-4 py-2.5 text-base gap-2';
        const fillCls = fill ? 'flex-1 justify-center' : '';
        // `activeColorClass` ใช้ได้ทั้งสองแบบ — แบบการ์ดหยิบเฉพาะสีตัวอักษรไปใช้
        // (`border-*` ที่ติดมาไม่มีผลเพราะไม่มีเส้นใต้) และขีดสั้นวาดด้วย `bg-current`
        // จึงได้สีเดียวกับตัวอักษรเสมอ ไม่ต้องส่งสีซ้ำสองที่
        const cls = isCard
          ? `relative flex items-center ${sizeCls} ${fillCls} font-medium rounded-lg whitespace-nowrap transition-all ${
              isActive
                ? `bg-white dark:bg-slate-700 shadow-sm ${activeColor}`
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-700/40'
            }`
          : `flex items-center ${sizeCls} ${fillCls} font-medium border-b-2 whitespace-nowrap transition-colors ${
              isActive
                ? activeColor
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`;

        const inner = (
          <>
            {tab.icon}
            <span>{tab.label}</span>
            {isCard && isActive && (
              <span
                aria-hidden
                className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-current ${size === 'sm' ? 'bottom-1 h-0.5 w-5' : 'bottom-1.5 h-0.5 w-6'}`}
              />
            )}
            {typeof tab.count === 'number' && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-slate-400'
              }`}>
                {tab.count}
              </span>
            )}
          </>
        );

        if (tab.href) {
          return (
            <Link key={tab.key} href={tab.href} onClick={() => onSelect?.(tab.key)} className={cls}>
              {inner}
            </Link>
          );
        }
        return (
          <button key={tab.key} type="button" onClick={() => onSelect?.(tab.key)} className={cls}>
            {inner}
          </button>
        );
      })}
    </div>
  );
}
