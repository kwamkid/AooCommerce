import type { HTMLAttributes, ReactNode } from 'react';

type CardPadding = 'none' | 'sm' | 'md' | 'lg';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Padding preset — default 'md'. Use 'none' when child controls padding (e.g. table rows). */
  padding?: CardPadding;
  /** Removes the shadow — for nested cards or dense layouts. */
  flat?: boolean;
  children: ReactNode;
}

/**
 * Standard surface card used across AooCommerce. Styling lives in globals.css
 * under `.card` / `.card-flat` / `.card-p-{padding}` so the DOM stays clean
 * (`class="card card-p-md"`).
 */
export default function Card({
  padding = 'md',
  flat = false,
  className = '',
  children,
  ...rest
}: CardProps) {
  const classes = [
    'card',
    flat ? 'card-flat' : '',
    padding !== 'none' ? `card-p-${padding}` : '',
    className,
  ].filter(Boolean).join(' ');
  return <div className={classes} {...rest}>{children}</div>;
}
