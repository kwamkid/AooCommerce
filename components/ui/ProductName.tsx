// Path: components/ui/ProductName.tsx
'use client';

import type { ReactNode } from 'react';
import Badge from './Badge';
import { productDisplayName, type ProductDisplayFields } from '@/lib/product-display';

export interface ProductNameProps {
  /** object อะไรก็ได้ที่มี product_name / variation_label / attributes / sku … */
  item: ProductDisplayFields;
  /**
   * ตัดข้อความกี่บรรทัด — **ค่าตั้งต้น 2 บรรทัด** (ชื่อสินค้าไทยยาว ชื่อตัวเลือกต่อท้าย
   * บรรทัดเดียวมักไม่พอ) · ใช้ `1` เฉพาะช่องที่กว้างจริง ๆ หรือแถวที่ต้องสูงเท่ากันเป๊ะ
   * · `0` = ไม่ตัด (ใบเสร็จ/หน้ารายละเอียดที่ต้องเห็นชื่อเต็ม)
   */
  lines?: 0 | 1 | 2;
  /** แท็กที่ใช้ห่อ — default `p` (ในตาราง/การ์ด) ใช้ `span` เมื่ออยู่ในบรรทัดข้อความ */
  as?: 'p' | 'span' | 'div';
  /** ป้าย "ชุด" ท้ายชื่อเมื่อเป็นสินค้าชุด — default แสดงเมื่อ `is_composite` เป็นจริง */
  showComposite?: boolean;
  /** ต่อท้ายชื่อ (ป้ายของแถม, ป้ายสถานะ ฯลฯ) */
  suffix?: ReactNode;
  className?: string;
}

const CLAMP: Record<0 | 1 | 2, string> = {
  0: '',
  1: 'truncate',
  2: 'line-clamp-2',
};

/**
 * ชื่อสินค้าบนหน้าจอ — **ตัวเดียวทั้งระบบ**
 *
 * ประกอบชื่อด้วย `productDisplayName()` (ชื่อ - ตัวเลือก) และตัดบรรทัดด้วยกติกาเดียว
 *
 * ⛔ ห้ามเขียน `{item.product_name}{item.variation_label ? \` — ${…}\` : ''}` เองในหน้าอีก
 *    (เคยมี 144 จุด ใช้ตัวคั่นคนละแบบ และ truncate ไม่เหมือนกันสักหน้า)
 *
 * ```tsx
 * <ProductName item={item} />                    // 2 บรรทัด (ค่าตั้งต้น)
 * <ProductName item={item} lines={1} />          // ตารางช่องกว้าง
 * <ProductName item={item} as="span" lines={0} /> // ในบรรทัดข้อความ
 * ```
 */
export default function ProductName({
  item,
  lines = 2,
  as: Tag = 'p',
  showComposite,
  suffix,
  className = '',
}: ProductNameProps) {
  const name = productDisplayName(item);
  const composite = showComposite ?? Boolean(item.is_composite);
  const clamp = CLAMP[lines];

  // min-w-0 = ให้ย่อได้จริงเมื่ออยู่ใน flex row (ไม่ใส่แล้ว truncate ไม่ทำงาน — บั๊กซ้ำซาก)
  const base = `min-w-0 ${clamp} ${className}`.trim();

  if (!composite && !suffix) {
    return <Tag className={base} title={lines === 0 ? undefined : name}>{name}</Tag>;
  }

  return (
    <Tag className={`min-w-0 ${className}`.trim()}>
      <span className={clamp ? `${clamp} align-middle` : 'align-middle'} title={lines === 0 ? undefined : name}>{name}</span>
      {composite && <Badge tone="purple" size="sm" shape="square" className="ml-1.5 align-middle">ชุด</Badge>}
      {suffix}
    </Tag>
  );
}
