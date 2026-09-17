// ต้นทุนของ "สินค้าฝากขายจาก supplier" — เงินที่เราต้องจ่ายคืนเจ้าของสินค้าเมื่อขายได้
//
// ⛔ ของฝากขายไม่มีต้นทุนตอนรับเข้า (ไม่เข้า WAC — ดู .claude/rules/domains/inventory.md)
//    ต้นทุนจริงเกิด "ตอนขาย" = ฐาน × (1 − ส่วนแบ่งที่เราได้) จึงต้องคิดที่จุดสร้างออเดอร์ทุกทาง
//    (บิลตรง · POS · Shopee · Lazada · TikTok · หน้าร้าน) — ทุกทางไปรวมที่ lib/cost-utils.ts
//
// ฐานคิดมี 2 แบบต่อ supplier (`suppliers.consignment_gp_base`):
//    retail     = ราคาตั้งขายของสินค้า (ค่าเริ่มต้น · ดีลส่วนใหญ่)
//                 ตั้ง 1,000 ลดให้ลูกค้าเหลือ 800 GP 30% ⇒ ยังต้องจ่าย supplier 700 (เราเหลือ 100)
//    discounted = ราคาที่ขายได้จริงในบิลนั้น ⇒ ขาย 800 GP 30% ⇒ จ่าย 560 (เราเหลือ 240)
//
// สินค้าเป็นของฝากขายไหม: variation → product.brand_id → product_brands.supplier_id
// → suppliers.supplier_type = 'consignment' (กติกา: 1 แบรนด์ = 1 supplier)

import type { SupabaseClient } from '@supabase/supabase-js';

export type ConsignmentGpBase = 'retail' | 'discounted';

export interface ConsignmentTerm {
  supplierId: string;
  supplierName: string;
  /** ส่วนแบ่ง % ที่ "เราได้" — null = ยังไม่ตกลงกัน (คิดต้นทุนไม่ได้ ต้องไปตั้งที่หน้า Supplier) */
  gpRate: number | null;
  gpBase: ConsignmentGpBase;
  /** ราคาตั้งขายของตัวเลือกนั้น (ใช้เมื่อ gpBase = 'retail') */
  retailPrice: number;
}

/**
 * ดึงเงื่อนไขฝากขายของตัวเลือกสินค้าที่ขอมา — คืนเฉพาะตัวที่เป็นของ supplier ฝากขายจริง
 * (ตัวที่ไม่อยู่ในผลลัพธ์ = สินค้าของเราเอง ใช้ต้นทุนเฉลี่ย WAC ตามปกติ)
 */
export async function fetchConsignmentTerms(
  supabase: SupabaseClient,
  variationIds: string[],
): Promise<Map<string, ConsignmentTerm>> {
  const result = new Map<string, ConsignmentTerm>();
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return result;

  const { data: variations } = await supabase
    .from('product_variations')
    .select('id, default_price, product:products!inner(id, brand_id)')
    .in('id', unique);
  if (!variations || variations.length === 0) return result;

  type VariationRow = { id: string; default_price: number | string | null; product: { brand_id: string | null } | null };
  const rows = variations as unknown as VariationRow[];
  const brandIds = [...new Set(rows.map(v => v.product?.brand_id).filter((id): id is string => !!id))];
  if (brandIds.length === 0) return result;

  const { data: brands } = await supabase
    .from('product_brands')
    .select('id, supplier_id')
    .in('id', brandIds)
    .not('supplier_id', 'is', null);
  if (!brands || brands.length === 0) return result;

  const supplierIds = [...new Set(brands.map(b => b.supplier_id as string))];
  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('id, name, supplier_type, consignment_gp_rate, consignment_gp_base')
    .in('id', supplierIds)
    .eq('supplier_type', 'consignment');
  if (!suppliers || suppliers.length === 0) return result;

  const supplierById = new Map(suppliers.map(s => [s.id as string, s]));
  const supplierByBrand = new Map<string, typeof suppliers[number]>();
  for (const brand of brands) {
    const supplier = supplierById.get(brand.supplier_id as string);
    if (supplier) supplierByBrand.set(brand.id as string, supplier);
  }

  for (const variation of rows) {
    const brandId = variation.product?.brand_id;
    const supplier = brandId ? supplierByBrand.get(brandId) : undefined;
    if (!supplier) continue;
    const rate = supplier.consignment_gp_rate;
    result.set(variation.id, {
      supplierId: supplier.id as string,
      supplierName: (supplier.name as string) || '',
      gpRate: rate == null ? null : Number(rate),
      gpBase: (supplier.consignment_gp_base as ConsignmentGpBase) || 'retail',
      retailPrice: Number(variation.default_price) || 0,
    });
  }
  return result;
}

/**
 * ต้นทุนต่อหน่วยของสินค้าฝากขาย = ฐาน × (1 − ส่วนแบ่งที่เราได้)
 *
 * `soldUnitPrice` = ราคาขายจริงต่อหน่วยในบิลนั้น (ใช้เมื่อฐานเป็น 'discounted')
 * ไม่รู้ราคาขาย (เช่นสายที่ยังไม่มีราคา) → ถอยไปใช้ราคาตั้งขาย ซึ่งเป็นฝั่งที่ปลอดภัยกว่า
 * (ประเมินเงินที่ต้องจ่ายไว้สูงกว่าความจริง ดีกว่าประเมินต่ำแล้วคิดว่ากำไรมากเกินจริง)
 *
 * คืน `null` เมื่อยังไม่ได้ตกลงส่วนแบ่ง — ผู้เรียกต้องปล่อยต้นทุนเป็น null ไม่ใช่ใส่ 0
 * (ใส่ 0 = กำไรเต็มราคาขาย ซึ่งไม่จริงและไปโป่งในรายงาน)
 */
export function consignmentUnitCost(term: ConsignmentTerm, soldUnitPrice?: number | null): number | null {
  if (term.gpRate == null) return null;
  const base = term.gpBase === 'discounted' && soldUnitPrice != null && soldUnitPrice > 0
    ? Number(soldUnitPrice)
    : term.retailPrice;
  if (!base) return null;
  const cost = base * (1 - term.gpRate / 100);
  return Math.max(0, Math.round(cost * 100) / 100);
}

/**
 * ราคาขายจริงต่อหน่วยของแต่ละตัวเลือกในบิล — ส่งเข้า `fetchCostMap(..., { salePrices })`
 * ใช้ยอดหลังหักส่วนลดของบรรทัด (`total / quantity`) เพราะนั่นคือเงินที่ลูกค้าจ่ายจริง
 * ⚠️ ตัวเลือกเดียวกันหลายบรรทัดราคาไม่เท่ากัน จะได้ราคาของบรรทัดหลังสุด — ยอมรับได้
 *    (เกิดน้อย และผลต่างไปอยู่ที่ต้นทุน ไม่ได้ไปอยู่ที่ยอดขาย)
 */
export function soldUnitPriceMap(
  items: Array<{
    variation_id?: string | null;
    quantity?: number | string | null;
    total?: number | string | null;
    unit_price?: number | string | null;
  }>,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) {
    if (!item.variation_id) continue;
    const qty = Number(item.quantity) || 0;
    const total = Number(item.total);
    const perUnit = qty > 0 && Number.isFinite(total) && total > 0
      ? total / qty
      : Number(item.unit_price) || 0;
    if (perUnit > 0) map[item.variation_id] = perUnit;
  }
  return map;
}
