// Path: components/ui/ProductCell.tsx
'use client';

import type { ReactNode } from 'react';
import ProductImageThumb, { type ThumbSize, type ThumbRatio } from './ProductImageThumb';
import ProductName from './ProductName';
import ProductPrice from './ProductPrice';
import { productSubtitle, type ProductDisplayFields, type ProductPriceFields } from '@/lib/product-display';

/** ชื่อฟิลด์รูปที่ใช้กันจริงในระบบ — รับได้หมด จะได้ไม่ต้อง map ที่หน้าเรียก */
export interface ProductImageFields {
  image?: string | null;
  image_url?: string | null;
  main_image_url?: string | null;
}

export type ProductCellItem = ProductDisplayFields & ProductPriceFields & ProductImageFields;

export interface ProductCellProps {
  item: ProductCellItem;
  /** ขนาดรูป — default `md` (48px) */
  size?: ThumbSize;
  ratio?: ThumbRatio;
  /** ชื่อกี่บรรทัด — default 2 (ดู <ProductName>) */
  lines?: 0 | 1 | 2;
  /** ซ่อนรูป (ตารางแคบ / ใบเสร็จ) */
  hideImage?: boolean;
  /** บรรทัดรอง — `true` = รหัส+SKU · `'barcode'` = ต่อบาร์โค้ดด้วย · `false` = ไม่แสดง · หรือใส่ node เอง */
  subtitle?: boolean | 'barcode' | ReactNode;
  /** แสดงราคาขายจริง (+ ราคาปกติขีดฆ่า) ใต้ชื่อ */
  showPrice?: boolean;
  /** ป้ายเพิ่มเติมใต้ชื่อ (สต็อก, บทบาทในโปร, ป้ายของแถม …) */
  badges?: ReactNode;
  /** บรรทัดล่างสุด (หมายเหตุรายการ, ข้อมูล GP ฯลฯ) */
  footer?: ReactNode;
  /** รูปกดขยายไม่ได้ — ใช้เมื่อทั้งแถวเป็นลิงก์/ปุ่มอยู่แล้ว (ห้าม button ซ้อน button) */
  disabled?: boolean;
  className?: string;
}

/**
 * ช่อง "สินค้า" มาตรฐานของทุกตาราง/การ์ด — รูป + ชื่อ + รหัส/SKU (+ ราคา, ป้าย)
 *
 * รวมกติกาทั้งหมดไว้ที่เดียว: รูปย่อผ่าน `thumbUrl()` และกดขยายได้เต็มขนาด ·
 * ชื่อประกอบด้วย `productDisplayName()` ตัด 2 บรรทัด · ราคาใช้ `sellingPrice()`
 *
 * ```tsx
 * <ProductCell item={item} />
 * <ProductCell item={item} size="lg" showPrice subtitle="barcode" />
 * <ProductCell item={item} lines={1} badges={<StockBadge qty={n} />} />
 * ```
 *
 * ⚠️ ส่ง **URL รูปเต็ม** เข้ามาเสมอ ห้ามส่งรูปที่ย่อมาแล้ว — กดขยายจะได้รูปเบลอ
 */
export default function ProductCell({
  item,
  size = 'md',
  ratio,
  lines = 2,
  hideImage,
  subtitle = true,
  showPrice,
  badges,
  footer,
  disabled,
  className = '',
}: ProductCellProps) {
  const src = item.image || item.image_url || item.main_image_url || null;
  const sub = subtitle === true || subtitle === 'barcode'
    ? productSubtitle(item, { barcode: subtitle === 'barcode' })
    : subtitle === false ? '' : subtitle;

  return (
    <div className={`flex items-center gap-3 min-w-0 ${className}`.trim()}>
      {!hideImage && <ProductImageThumb src={src} alt={item.product_name || ''} size={size} ratio={ratio} disabled={disabled} />}
      <div className="min-w-0 flex-1">
        <ProductName item={item} lines={lines} className="text-sm font-medium text-gray-900 dark:text-white" />
        {typeof sub === 'string'
          ? sub && <p className="text-xs text-gray-400 dark:text-slate-500 truncate mt-0.5">{sub}</p>
          : sub && <div className="mt-0.5">{sub}</div>}
        {showPrice && <ProductPrice item={item} className="text-sm mt-0.5" />}
        {badges && <div className="flex items-center gap-1.5 flex-wrap mt-0.5">{badges}</div>}
        {footer}
      </div>
    </div>
  );
}
