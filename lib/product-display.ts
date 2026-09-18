// Path: lib/product-display.ts
//
// ===== ตัวกลางการ "แสดงผลสินค้า" ทั้งระบบ =====
//
// ⛔ ห้ามประกอบชื่อสินค้า / คิดราคาขายจริง / ต่อ SKU-บาร์โค้ด เองในหน้าอีก
//    ที่ผ่านมาแต่ละหน้าใช้ตัวคั่นคนละแบบ (`ชื่อ - ตัวเลือก`, `ชื่อ — ตัวเลือก`,
//    `ชื่อ (ตัวเลือก)`) และเขียน `discount_price > 0 ? discount_price : default_price`
//    เองอยู่ 61 จุด — เปลี่ยนกติกาทีต้องไล่แก้ทุกหน้า
//
// ใช้ยังไง:
//   - ต้องการ **ข้อความ** (PDF, Excel, title, ชื่อไฟล์) → ใช้ฟังก์ชันในไฟล์นี้
//   - ต้องการ **JSX** (หน้าเว็บ) → ใช้ <ProductName> / <ProductCell> ซึ่งเรียกไฟล์นี้ต่อ
//
// generic — รับ object รูปร่างไหนก็ได้ ขอแค่มี field ที่ประกาศไว้ด้านล่าง

export interface ProductDisplayFields {
  product_name?: string | null;
  product_code?: string | null;
  variation_label?: string | null;
  sku?: string | null;
  barcode?: string | null;
  attributes?: Record<string, string> | null;
  /** สินค้าชุด — ชุดย่อยที่ประกอบจากชิ้นส่วน (ไม่มีสต็อกของตัวเอง) */
  is_composite?: boolean | null;
}

/** ราคาของหนึ่ง variation — ทุกที่ในระบบเก็บเป็น "ราคารวม VAT แล้ว" */
export interface ProductPriceFields {
  default_price?: number | string | null;
  /** 0 = ไม่มีส่วนลด · กติกาทั้งระบบ: ถ้า > 0 ต้องน้อยกว่า default_price เสมอ */
  discount_price?: number | string | null;
}

const num = (v: number | string | null | undefined): number => Number(v ?? 0) || 0;

/** ตัวคั่นระหว่างชื่อสินค้ากับชื่อตัวเลือก — ตัวเดียวทั้งระบบ */
export const VARIATION_SEPARATOR = ' - ';

// ── ชื่อ ────────────────────────────────────────────────────────────────

/**
 * ชื่อตัวเลือกที่ "แสดงได้จริง" — คืนค่าว่างเมื่อมันไม่ใช่ชื่อตัวเลือก
 *
 * ตัดทิ้ง: ขีดกลางล้วน (พนักงานพิมพ์แทน "ไม่มีตัวเลือก" — ปล่อยไว้จะได้
 * "การ์ด - AF-029 | -" บนใบจัดของ) · ค่าที่ซ้ำกับรหัส/SKU/บาร์โค้ด · ตัวเลขล้วน
 */
export function cleanVariationLabel(f: ProductDisplayFields): string {
  if (f.attributes && Object.keys(f.attributes).length > 0) {
    const attrParts: string[] = [];
    Object.values(f.attributes).forEach(v => { if (v?.trim()) attrParts.push(v.trim()); });
    if (attrParts.length > 0) return attrParts.join(' / ');
  }
  const raw = (f.variation_label || '').trim();
  if (/^[-–—\s]*$/.test(raw)) return '';
  if (raw === f.product_code || raw === f.barcode || raw === f.sku || /^\d+$/.test(raw)) return '';
  return raw;
}

/**
 * ชื่อสินค้าที่ใช้แสดง — ตัวเดียวทั้งระบบ
 *   สินค้าเดี่ยว   → "ชื่อสินค้า"
 *   มีตัวเลือก     → "ชื่อสินค้า - ตัวเลือก"
 *   สินค้าชุด      → "ชื่อชุด - ชุดย่อย" (ชุดย่อยอยู่ใน variation_label เหมือนกัน)
 */
export function productDisplayName(f: ProductDisplayFields): string {
  const varLabel = cleanVariationLabel(f);
  const name = f.product_name || '-';
  return varLabel ? `${name}${VARIATION_SEPARATOR}${varLabel}` : name;
}

// ── รหัส / SKU / บาร์โค้ด ───────────────────────────────────────────────

/**
 * บรรทัดรองใต้ชื่อ: `รหัสสินค้า | SKU: xxx` (ไม่ซ้ำกันเอง)
 * @param opts.barcode ต่อ `| บาร์โค้ด: xxx` ด้วย (หน้าสต็อก/POS ที่ยิงบาร์โค้ด)
 */
export function productSubtitle(f: ProductDisplayFields, opts?: { barcode?: boolean }): string {
  const parts: string[] = [];
  if (f.product_code) parts.push(f.product_code);
  if (f.sku && f.sku !== f.product_code && f.sku !== f.barcode) parts.push(`SKU: ${f.sku}`);
  if (opts?.barcode && f.barcode && f.barcode !== f.product_code) parts.push(`บาร์โค้ด: ${f.barcode}`);
  return parts.join(' | ');
}

/** รหัสที่ "ใช้อ้างอิงของชิ้นนี้ได้" เรียงตามความเฉพาะเจาะจง — สำหรับค้นหา/พิมพ์ใบ */
export function productRef(f: ProductDisplayFields): string {
  return f.barcode || f.sku || f.product_code || '';
}

// ── ราคา ───────────────────────────────────────────────────────────────

/**
 * **ราคาขายจริง** — ราคาที่ลูกค้าจ่าย และราคาที่ push ขึ้น marketplace
 *
 * `discount_price > 0` = กำลังลดราคา (กติกาทั้งระบบบังคับให้ต่ำกว่า `default_price` เสมอ
 * — ด่านหน้า ProductForm + RPC `bulk_create_products` / `bulk_update_variation_prices`)
 *
 * ⛔ ห้ามเขียน `discount_price > 0 ? ... : ...` เองที่อื่นอีก
 * ⚠️ **โปรโมชั่นไม่เกี่ยวกับตัวนี้** — เครื่องคิดโปรใน `lib/promotions/*` คิดจาก
 *    `default_price` เสมอ และราคาโปรชนะราคาลดปกติทุกกรณี (ยึดโปรเป็นหลัก ตามที่เจ้าของเคาะ)
 */
export function sellingPrice(v: ProductPriceFields): number {
  const discount = num(v.discount_price);
  return discount > 0 ? discount : num(v.default_price);
}

/** กำลังลดราคาอยู่ไหม (ไว้ตัดสินว่าจะขีดฆ่าราคาปกติไหม) */
export function hasDiscount(v: ProductPriceFields): boolean {
  const discount = num(v.discount_price);
  return discount > 0 && discount < num(v.default_price);
}

/**
 * ราคาสำหรับแสดงผล — `price` คือราคาที่จ่ายจริง, `original` มีค่าเฉพาะตอนลดราคา
 * (เอาไปขีดฆ่า) · ใช้คู่กับ `<ProductPrice>` หรือจัดรูปเองด้วย `formatPrice`
 */
export function priceParts(v: ProductPriceFields): { price: number; original: number | null } {
  return { price: sellingPrice(v), original: hasDiscount(v) ? num(v.default_price) : null };
}

/**
 * ฐานราคาสำหรับคิด GP (ฝากขาย/ห้าง/ตัวแทน) — ตามที่ดีลนั้นตกลงไว้
 * `'discounted'` = คิดจากราคาขายจริง (มีลดใช้ลด) · อย่างอื่น = คิดจากราคาปกติ
 */
export function gpBasePrice(v: ProductPriceFields, base?: string | null): number {
  return base === 'discounted' ? sellingPrice(v) : num(v.default_price);
}

/** ข้อความเตือนของกฎ "ราคาลดต้องน้อยกว่าราคาปกติ" — ข้อความเดียวทั้งระบบ */
export const DISCOUNT_PRICE_ERROR = 'ราคาลดเหลือต้องน้อยกว่าราคาปกติ';

/**
 * ตรวจกฎราคาลดของทั้งระบบ — `discount_price = 0` แปลว่า "ไม่มีส่วนลด" อนุญาตเสมอ
 * คืน `null` เมื่อผ่าน · คืนข้อความเตือนเมื่อไม่ผ่าน
 *
 * ด่านเดียวกันนี้บังคับที่ DB ด้วย (RPC `bulk_create_products` /
 * `bulk_update_variation_prices`) — แก้ข้อความ/กฎต้องแก้ทั้งสองที่
 */
export function discountPriceError(v: ProductPriceFields): string | null {
  const discount = num(v.discount_price);
  return discount > 0 && discount >= num(v.default_price) ? DISCOUNT_PRICE_ERROR : null;
}
