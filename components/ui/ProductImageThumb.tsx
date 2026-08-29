'use client';

import { useState, type ReactNode } from 'react';
import { Package, Search } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

export type ThumbSize = 'xs' | 'sm' | 'md' | 'lg';
/**
 * สัดส่วนกรอบ — `square` สำหรับแถวในตาราง (ความสูงแถวคงที่)
 * `portrait` (4:5) สำหรับที่ที่รูปสินค้าเป็นพระเอก เช่น การ์ดออเดอร์ / ผลค้นหา
 */
export type ThumbRatio = 'square' | 'portrait';

const SIZE_CLASS: Record<ThumbRatio, Record<ThumbSize, string>> = {
  square: {
    xs: 'w-8 h-8',
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  },
  // 4:5 — กว้างเท่าเดิม สูงขึ้น 25%
  portrait: {
    xs: 'w-8 h-10',
    sm: 'w-10 h-[3.125rem]',
    md: 'w-12 h-[3.75rem]',
    lg: 'w-16 h-20',
  },
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
  /** สัดส่วนกรอบ — default 'square' */
  ratio?: ThumbRatio;
}

/**
 * Product thumbnail with hover magnifying-glass overlay — จัตุรัสหรือ 4:5 (`ratio`).
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
  ratio = 'square',
}: ProductImageThumbProps) {
  const [open, setOpen] = useState(false);
  const sizeClass = SIZE_CLASS[ratio][size];

  if (!src) {
    return (
      <div className={`${sizeClass} rounded-md bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0 ${className}`}>
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
        className={`relative ${sizeClass} rounded-md overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-slate-700/50 group ${clickable ? 'cursor-zoom-in' : 'cursor-default'} ${className}`}
      >
        {/* object-contain ไม่ใช่ cover — รูปสินค้าแนวตั้ง (4:5) ต้องเห็นครบ ไม่ใช่ถูกครอปหัวท้าย
            ร้านถ่ายรูปมาหลายสัดส่วน กรอบเดียวจึงต้องรับได้ทุกแบบโดยไม่ตัดของทิ้ง */}
        <img src={src} alt={alt} className="w-full h-full object-contain" />
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
