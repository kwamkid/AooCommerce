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
   * `card` (ค่าปกติ) = แท็บที่เลือกเป็น "แผ่นขาวโค้งมุมบน" ชิดขอบ พื้นเทาไหลต่อไปทางขวา
   *   + ขีดหนาใต้ข้อความ · วางคู่กับกล่องเนื้อหาพื้นขาว (ส่ง `className="mb-0"`) จะได้แผ่นเดียวต่อเนื่อง
   * `underline` = เส้นใต้เต็มความกว้างแท็บ — ใช้กับแถบที่กินเต็มความกว้างติดขอบจอ
   *   (แถบมือถือ POS · หน้า PC) หรือแถบเล็กใน popover ที่ไม่มีที่ให้วางแผ่นขาว
   */
  variant?: 'card' | 'underline';
}

export default function Tabs({ tabs, activeKey, onSelect, className, fill, size = 'md', variant = 'card' }: TabsProps) {
  // Base layout (flex + พื้นราง/เส้นใต้ + scroll on overflow) is always applied;
  // caller's `className` is merged on top — typically just for spacing overrides
  // like `mb-6` / `mt-0`. Don't use `??` here — that would let a caller passing
  // `className="mb-6"` accidentally drop the flex + border-b and tabs would stack.
  const isCard = variant === 'card';
  const baseCls = isCard
    ? 'flex bg-gray-100 dark:bg-slate-800 rounded-t-xl mb-6 overflow-x-auto'
    : 'flex border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto';
  return (
    <div className={className ? `${baseCls} ${className}` : baseCls}>
      {tabs.filter(t => !t.hidden).map(tab => {
        const isActive = tab.key === activeKey;
        // แบบการ์ด: ตัวอักษรเข้มเป็นค่าปกติ (ขีดใต้ใช้ bg-current จึงได้สีเดียวกันเสมอ)
        // แบบเส้นใต้: สีแบรนด์เหมือนเดิม · ทั้งคู่ override ได้ด้วย activeColorClass
        const activeColor = tab.activeColorClass
          ?? (isCard ? 'text-gray-900 dark:text-white' : 'border-primary text-primary');
        const sizeCls = size === 'sm'
          ? (isCard ? 'px-4 pt-2 pb-3 text-xs gap-1.5' : 'px-3 py-2 text-xs gap-1.5')
          : (isCard ? 'px-5 pt-2.5 pb-4 text-base gap-2' : 'px-4 py-2.5 text-base gap-2');
        const fillCls = fill ? 'flex-1 justify-center' : '';
        // `activeColorClass` ใช้ได้ทั้งสองแบบ — แบบการ์ดหยิบเฉพาะสีตัวอักษรไปใช้
        // (`border-*` ที่ติดมาไม่มีผลเพราะไม่มีเส้นใต้) และขีดสั้นวาดด้วย `bg-current`
        // จึงได้สีเดียวกับตัวอักษรเสมอ ไม่ต้องส่งสีซ้ำสองที่
        const cls = isCard
          ? `relative flex items-center ${sizeCls} ${fillCls} font-semibold whitespace-nowrap transition-colors ${
              isActive
                ? `bg-white dark:bg-slate-900 rounded-t-xl ${activeColor}`
                : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
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
                className={`absolute left-1/2 -translate-x-1/2 rounded-full bg-current ${size === 'sm' ? 'bottom-1 h-[2px] w-6' : 'bottom-1.5 h-[3px] w-8'}`}
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
