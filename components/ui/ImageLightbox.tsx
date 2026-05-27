'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ImageLightboxProps {
  /** Image URL — when truthy, lightbox is open. Pass null/undefined to close. */
  src: string | null | undefined;
  onClose: () => void;
  alt?: string;
}

/**
 * Fullscreen image viewer. Used when clicking thumbnails in product/order/promotion lists.
 * Closes on backdrop click, ESC key, or X button.
 *
 * Distinct from Modal — no padding, no header/title, image fills 90vw/90vh max.
 */
export default function ImageLightbox({ src, onClose, alt = 'Image' }: ImageLightboxProps) {
  useEffect(() => {
    if (!src) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [src, onClose]);

  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70"
      onClick={onClose}
      role="dialog"
    >
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors z-10"
        aria-label="ปิด"
      >
        <X className="w-6 h-6" />
      </button>
      <img
        src={src}
        alt={alt}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
