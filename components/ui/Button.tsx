'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon shown before children. Hidden during loading. */
  icon?: ReactNode;
  /** Icon shown after children. Hidden during loading. */
  iconRight?: ReactNode;
  /** Replaces icon with spinner + disables button. */
  loading?: boolean;
  /** Full width — fills parent container. */
  fullWidth?: boolean;
  /** Default 'button' — override to 'submit' / 'reset' if needed in <form>. */
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Standard button used across AooCommerce. Styling lives in globals.css under
 * `.btn` / `.btn-{size}` / `.btn-{variant}` — so the DOM stays clean
 * (`class="btn btn-md btn-primary"`) and theme/sizing changes happen in one place.
 *
 * Variants encode the action's emphasis level — primary for main CTA, ghost for
 * low-emphasis toolbar actions, etc.
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    loading = false,
    fullWidth = false,
    type = 'button',
    disabled,
    className = '',
    children,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;
  const classes = ['btn', `btn-${size}`, `btn-${variant}`, fullWidth ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <button ref={ref} type={type} disabled={isDisabled} className={classes} {...rest}>
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});

export default Button;
