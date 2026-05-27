import type { HTMLAttributes, ReactNode } from 'react';

export type BadgeTone = 'gray' | 'red' | 'amber' | 'emerald' | 'blue' | 'indigo' | 'purple' | 'orange';
export type BadgeShape = 'pill' | 'square';
export type BadgeSize = 'sm' | 'md';

interface BadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  tone?: BadgeTone;
  shape?: BadgeShape;
  size?: BadgeSize;
  /** Icon shown before children */
  icon?: ReactNode;
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
    </span>
  );
}
