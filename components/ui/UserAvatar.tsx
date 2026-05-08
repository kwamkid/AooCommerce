'use client';

import { useState } from 'react';

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASS: Record<Size, string> = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-sm',
  lg: 'w-11 h-11 text-base',
  xl: 'w-14 h-14 text-lg',
};

export interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  size?: Size;
  className?: string;
}

function getInitial(name?: string | null, email?: string | null): string {
  const base = (name || email || '').trim();
  if (!base) return '?';
  return base.charAt(0).toUpperCase();
}

/**
 * Circular avatar that shows the user's photo if available,
 * otherwise falls back to the first letter of name (or email).
 */
export default function UserAvatar({
  name,
  email,
  src,
  size = 'md',
  className = '',
}: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = src && !errored;

  if (showImage) {
    return (
      <img
        src={src}
        alt={name || email || 'avatar'}
        referrerPolicy="no-referrer"
        onError={() => setErrored(true)}
        className={`${SIZE_CLASS[size]} rounded-full object-cover flex-shrink-0 bg-gray-100 dark:bg-slate-700 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${SIZE_CLASS[size]} rounded-full bg-[#1A1A2E] flex items-center justify-center text-white font-medium flex-shrink-0 ${className}`}
    >
      {getInitial(name, email)}
    </div>
  );
}
