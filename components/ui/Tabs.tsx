// Shared content tabs — segmented control: รางพื้นเทามุมมน แท็บที่เลือกเป็นการ์ดขาว
// มีเงานุ่มลอยอยู่ในราง (โค้งทุกมุม ไม่ชนขอบราง) ตัวที่เหลือเป็นตัวอักษรเทาบนราง
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
  // รางกว้างพอดีแท็บเสมอ (ไม่ยืดเต็มพ่อจนเหลือพื้นเทาโล่ง ๆ) ยกเว้นโหมด fill ที่ตั้งใจให้เต็มแถว
  // `max-w-full` + `overflow-x-auto` = จอแคบเลื่อนดูแท็บที่เกินได้แทนที่จะดันหน้าจนล้น
  const baseCls = `flex gap-1 p-1 bg-gray-200/60 dark:bg-slate-800 rounded-xl mb-6 overflow-x-auto ${fill ? 'w-full' : 'w-fit max-w-full'}`;
  return (
    <div className={className ? `${baseCls} ${className}` : baseCls}>
      {tabs.filter(t => !t.hidden).map(tab => {
        const isActive = tab.key === activeKey;
        const activeColor = tab.activeColorClass ?? 'text-gray-900 dark:text-white';
        // h-[34px] + p-1 ของราง = 42px เท่าความสูงมาตรฐานของ input/ปุ่มที่วางข้างกัน
        const sizeCls = size === 'sm' ? 'h-7 px-3 text-xs gap-1.5 rounded-md' : 'h-[34px] px-4 text-base gap-2 rounded-lg';
        const fillCls = fill ? 'flex-1' : '';
        const cls = `flex items-center justify-center ${sizeCls} ${fillCls} font-semibold whitespace-nowrap transition-all ${
          isActive
            ? `bg-white dark:bg-slate-700 shadow-[0_1px_4px_rgba(15,23,42,0.12)] ${activeColor}`
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
        }`;

        const inner = (
          <>
            {tab.icon}
            <span>{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'bg-white/70 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
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
