'use client';

import { useState, type ReactNode } from 'react';
import { Package, Search } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

export type ThumbSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<ThumbSize, string> = {
  xs: 'w-8 h-8',
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-16 h-16',
};

const FALLBACK_ICON_CLASS: Record<ThumbSize, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
};

const ZOOM_ICON_CLASS: Record<ThumbSize, string> = {
  xs: 'w-3 h-3',
  sm: 'w-3.5 h-3.5',
  md: 'w-4 h-4',
  lg: 'w-5 h-5',
};

interface ProductImageThumbProps {
  src?: string | null;
  alt?: string;
  size?: ThumbSize;
  /** Disable the click-to-lightbox interaction (e.g. inside an <a> or button) */
  disabled?: boolean;
  /** Override the placeholder icon when no image is present */
  fallbackIcon?: ReactNode;
  /** Extra class on the wrapper square */
  className?: string;
}

/**
 * Square product thumbnail with hover magnifying-glass overlay.
 * Click → opens fullscreen ImageLightbox. When no image, renders a Package
 * icon placeholder (or custom `fallbackIcon`) and is not clickable.
 *
 * Used in: items tables, product lists, replenishment receive screens, refund
 * modals — anywhere a product thumbnail should preview at full size on click.
 */
export default function ProductImageThumb({
  src,
  alt = '',
  size = 'md',
  disabled = false,
  fallbackIcon,
  className = '',
}: ProductImageThumbProps) {
  const [open, setOpen] = useState(false);
  const sizeClass = SIZE_CLASS[size];

  if (!src) {
    return (
      <div className={`${sizeClass} rounded bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 ${className}`}>
        {fallbackIcon ?? <Package className={`${FALLBACK_ICON_CLASS[size]} text-gray-400 dark:text-slate-500`} />}
      </div>
    );
  }

  const clickable = !disabled;
  return (
    <>
      <button
        type="button"
        onClick={clickable ? () => setOpen(true) : undefined}
        disabled={!clickable}
        aria-label={clickable ? `ดูรูป ${alt || 'สินค้า'} ขนาดเต็ม` : alt}
        className={`relative ${sizeClass} rounded overflow-hidden flex-shrink-0 group ${clickable ? 'cursor-zoom-in' : 'cursor-default'} ${className}`}
      >
        <img src={src} alt={alt} className="w-full h-full object-cover" />
        {clickable && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <Search className={ZOOM_ICON_CLASS[size]} />
          </span>
        )}
      </button>
      {clickable && (
        <ImageLightbox src={open ? src : null} onClose={() => setOpen(false)} alt={alt} />
      )}
    </>
  );
}
