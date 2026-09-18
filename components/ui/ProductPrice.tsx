// Path: components/ui/ProductPrice.tsx
'use client';

import { priceParts, type ProductPriceFields } from '@/lib/product-display';
import { formatPrice } from '@/lib/utils/format';

export interface ProductPriceProps {
  /** object ที่มี default_price / discount_price */
  item: ProductPriceFields;
  /** ซ่อนราคาปกติที่ขีดฆ่า (ช่องแคบ) — default แสดงเมื่อกำลังลดราคา */
  hideOriginal?: boolean;
  className?: string;
}

/**
 * ราคาสินค้าบนหน้าจอ — ราคาขายจริงเด่น + ราคาปกติขีดฆ่าเมื่อกำลังลดราคา
 *
 * ⛔ ห้ามเขียน `discount_price > 0 ? … : …` เองในหน้า — ใช้ตัวนี้หรือ `sellingPrice()`
 */
export default function ProductPrice({ item, hideOriginal, className = '' }: ProductPriceProps) {
  const { price, original } = priceParts(item);
  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`.trim()}>
      <span className={original ? 'text-red-600 dark:text-red-400 font-medium' : 'font-medium'}>฿{formatPrice(price)}</span>
      {original && !hideOriginal && (
        <span className="text-gray-400 dark:text-slate-500 line-through text-sm">฿{formatPrice(original)}</span>
      )}
    </span>
  );
}
