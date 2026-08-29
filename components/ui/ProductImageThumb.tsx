'use client';

import { useState, type ReactNode } from 'react';
import { Package, Search } from 'lucide-react';
import ImageLightbox from './ImageLightbox';

export type ThumbSize = 'xs' | 'sm' | 'md' | 'lg';
/**
 * สัดส่วนกรอบ — ล้อตามที่ marketplace รองรับจริง ไม่ใช่ที่เราชอบ
 * Shopee รับแค่ **1:1 (default) กับ 3:4** เท่านั้น (3:4 ต้องอยู่ใน whitelist ตอนสร้างสินค้า
 * ดู api_doc_knowledge/Shopee/product.md — add_item / update_item `image_ratio`)
 *
 * - `square` = 1:1 — รูปเกือบทั้งหมดในระบบเป็นแบบนี้ ใช้เป็น default
 * - `portrait` = 3:4 — สำหรับร้านที่ใช้รูปแนวตั้งของ Shopee
 *
 * หน้าร้านออนไลน์ (`storefront.image_ratio`) ใช้ชุดเดียวกันแล้ว (1:1 / 3:4 / auto)
 * — มาตรฐานเดียวทั้งระบบ ไม่ต้องเตรียมรูปคนละชุดสำหรับหน้าร้านกับ marketplace
 */
export type ThumbRatio = 'square' | 'portrait';

const SIZE_CLASS: Record<ThumbRatio, Record<ThumbSize, string>> = {
  square: {
    xs: 'w-8 h-8',
    sm: 'w-10 h-10',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  },
  // 3:4 — กว้างเท่าเดิม สูง = กว้าง × 4/3
  portrait: {
    xs: 'w-8 h-[2.667rem]',
    sm: 'w-10 h-[3.333rem]',
    md: 'w-12 h-16',
    lg: 'w-16 h-[5.333rem]',
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
 * Product thumbnail with hover magnifying-glass overlay — 1:1 หรือ 3:4 (`ratio`).
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
        {/* object-contain ไม่ใช่ cover — รูปแนวตั้งต้องเห็นครบ ไม่ใช่ถูกครอปหัวท้าย
            ของเก่าบางร้านอาจเป็นสัดส่วนอื่นที่ไม่ใช่ 1:1/3:4 กรอบจึงต้องรับได้โดยไม่ตัดทิ้ง */}
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
