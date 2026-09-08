import type { HTMLAttributes, ReactNode } from 'react';
import { X } from 'lucide-react';

export type BadgeTone = 'gray' | 'red' | 'amber' | 'emerald' | 'blue' | 'indigo' | 'purple' | 'orange';
export type BadgeShape = 'pill' | 'square';
export type BadgeSize = 'sm' | 'md';

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone?: BadgeTone;
  shape?: BadgeShape;
  size?: BadgeSize;
  /** Icon shown before children */
  icon?: ReactNode;
  /**
   * ปุ่มกากบาทท้ายป้าย — ชิปที่ผู้ใช้เลือกมาเองแล้วถอดได้ (ผู้รับที่เลือกรายคน ฯลฯ)
   * ต้องเรียกจาก client component เท่านั้น (เป็น event handler)
   */
  onRemove?: () => void;
  /** ชื่อของปุ่มถอดสำหรับ screen reader — ค่าเริ่มต้น "เอาออก" */
  removeLabel?: string;
  children: ReactNode;
}

/**
 * Generic colored tag/badge. Styling lives in globals.css under
 * `.badge` / `.badge-{size}` / `.badge-{tone}` / `.badge-{shape}`.
 *
 * For status-specific badges that follow standard color mapping, prefer the
 * tone matching `lib/status-tab-colors.ts`.
 */
export default function Badge({
  tone = 'gray',
  shape = 'pill',
  size = 'md',
  icon,
  onRemove,
  removeLabel = 'เอาออก',
  className = '',
  children,
  ...rest
}: BadgeProps) {
  const classes = ['badge', `badge-${size}`, `badge-${shape}`, `badge-${tone}`, className]
    .filter(Boolean).join(' ');
  return (
    <span className={classes} {...rest}>
      {icon}
      {children}
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          className="badge-remove"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </span>
  );
}
