// Shared content tabs — แท็บที่เลือกเป็น "แผ่นขาวโค้งมุมบน" ชิดขอบ พื้นเทาไหลต่อไปทางขวา
// วางคู่กับกล่องเนื้อหาพื้นขาว (ส่ง `className="mb-0"`) จะได้แผ่นเดียวต่อเนื่อง
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
  /** เปลี่ยนสีตัวอักษรของแท็บที่เลือก (ค่าปกติ = สีเข้ม) เช่น `text-line` ของแท็บ LINE */
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
}

export default function Tabs({ tabs, activeKey, onSelect, className, fill, size = 'md' }: TabsProps) {
  // Base layout (flex + พื้นราง + scroll on overflow) is always applied;
  // caller's `className` is merged on top — typically just for spacing overrides
  // like `mb-6` / `mt-0`. Don't use `??` here — that would let a caller passing
  // `className="mb-6"` accidentally drop the flex + พื้นราง and tabs would stack.
  const baseCls = 'flex bg-gray-200/70 dark:bg-slate-800 rounded-t-xl mb-6 overflow-x-auto';
  return (
    <div className={className ? `${baseCls} ${className}` : baseCls}>
      {tabs.filter(t => !t.hidden).map(tab => {
        const isActive = tab.key === activeKey;
        const activeColor = tab.activeColorClass ?? 'text-gray-900 dark:text-white';
        const sizeCls = size === 'sm' ? 'px-4 py-2.5 text-xs gap-1.5' : 'px-4 py-3 text-base gap-2';
        const fillCls = fill ? 'flex-1 justify-center' : '';
        const cls = `flex items-center ${sizeCls} ${fillCls} font-semibold whitespace-nowrap transition-colors ${
          isActive
            ? `bg-white dark:bg-slate-900 rounded-t-xl ${activeColor}`
            : 'text-gray-600/80 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200'
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
