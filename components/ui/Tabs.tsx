// Shared content tabs — underlined border-b style.
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
}

export default function Tabs({ tabs, activeKey, onSelect, className }: TabsProps) {
  return (
    <div className={className ?? 'flex border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto'}>
      {tabs.filter(t => !t.hidden).map(tab => {
        const isActive = tab.key === activeKey;
        const activeColor = tab.activeColorClass ?? 'border-primary text-primary';
        const cls = `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
          isActive
            ? activeColor
            : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
        }`;

        const inner = (
          <>
            {tab.icon}
            <span>{tab.label}</span>
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
