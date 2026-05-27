'use client';

import { getTabColor } from '@/lib/status-tab-colors';

export interface StatusTab {
  /** Status key — used both for color lookup AND for the activeKey comparison */
  key: string;
  label: string;
  /** Count badge — shown big under the label */
  count?: number;
  /** Override the status key used for color lookup (e.g. subtab maps to same color as parent) */
  colorKey?: string;
  /** Hide this tab entirely (useful for feature-gated tabs) */
  hidden?: boolean;
  /** Native browser tooltip shown on hover (e.g. "ตัวแทนแจ้งรับของแล้ว — รอ admin ยืนยัน") */
  tooltip?: string;
}

interface StatusTabsProps {
  tabs: StatusTab[];
  /** The currently active tab key. */
  activeKey: string;
  onSelect: (key: string) => void;
  /** Override the className of the outer scroll container. */
  className?: string;
}

/**
 * Horizontal status filter tabs used across every list page (orders, dealer-orders,
 * replenishments, consignment/department-store reports, statements, etc).
 *
 * Each tab shows label + big count. Active tab uses solid bg from `getTabColor()`,
 * inactive tabs use the soft variant.
 *
 * Replaces ~25 lines of identical inline JSX per page (10+ pages = ~250 lines saved).
 */
export default function StatusTabs({
  tabs,
  activeKey,
  onSelect,
  className = 'flex gap-2 overflow-x-auto pb-1',
}: StatusTabsProps) {
  return (
    <div className={className}>
      {tabs.filter(t => !t.hidden).map((tab) => {
        const color = getTabColor(tab.colorKey || tab.key);
        const isActive = activeKey === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            title={tab.tooltip}
            className={`flex-shrink-0 rounded-xl px-4 py-2 min-w-[80px] text-center transition-all ${
              isActive ? `${color.active} text-white shadow-md` : `${color.inactive} hover:opacity-80`
            }`}
          >
            <div className={`text-xs font-medium ${isActive ? 'text-white/80' : color.labelColor}`}>{tab.label}</div>
            {tab.count !== undefined && (
              <div className={`text-xl font-bold ${isActive ? 'text-white' : color.countColor}`}>{tab.count}</div>
            )}
          </button>
        );
      })}
    </div>
  );
}
