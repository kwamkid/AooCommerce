import type { HTMLAttributes, ReactNode } from 'react';

type ContainerSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '5xl' | '6xl' | 'full';

// TRIAL: force every Container to full width — see if it feels good before committing.
// To revert: restore the original mapping below.
//   sm:    'max-w-sm',
//   md:    'max-w-md',
//   lg:    'max-w-lg',
//   xl:    'max-w-2xl',
//   '2xl': 'max-w-3xl',
//   '4xl': 'max-w-4xl',
//   '5xl': 'max-w-5xl',
//   '6xl': 'max-w-6xl',
//   full:  'max-w-full',
const SIZE_CLASSES: Record<ContainerSize, string> = {
  sm: 'max-w-full',
  md: 'max-w-full',
  lg: 'max-w-full',
  xl: 'max-w-full',
  '2xl': 'max-w-full',
  '4xl': 'max-w-full',
  '5xl': 'max-w-full',
  '6xl': 'max-w-full',
  full: 'max-w-full',
};

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  /** Max-width preset — default '5xl'. Use 'full' for list pages. */
  size?: ContainerSize;
  /** Vertical spacing between direct children — default 'md' (space-y-6). */
  gap?: 'none' | 'sm' | 'md' | 'lg';
  children: ReactNode;
}

const GAP_CLASSES: Record<NonNullable<ContainerProps['gap']>, string> = {
  none: '',
  sm: 'space-y-3',
  md: 'space-y-6',
  lg: 'space-y-8',
};

/**
 * Standard page container. Replaces inline `<div className="max-w-5xl space-y-6">`.
 * Sizes correspond to common page widths in AooCommerce:
 *   - full → list pages (DataTable spans full)
 *   - 5xl → bulk action pages (default)
 *   - 4xl → bulk hub, mid-width
 *   - 2xl → detail/edit forms
 *   - xl  → narrow forms (settings sections)
 */
export default function Container({
  size = '5xl',
  gap = 'md',
  className = '',
  children,
  ...rest
}: ContainerProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} ${GAP_CLASSES[gap]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
