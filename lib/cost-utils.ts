/**
 * Cost Utilities — ดึงราคาต้นทุนเฉลี่ย (WAC) สำหรับ snapshot ลง order_items
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getCompositePartsMap } from '@/lib/composite';
import { consignmentUnitCost, fetchConsignmentTerms } from '@/lib/consignment-cost';

/**
 * Batch fetch current WAC (cost_price) for multiple variations
 * Returns a map of variationId → cost_price
 * Composite combos (สินค้าชุด) have no WAC of their own — cost = Σ component WAC × pieces per set
 *
 * **สินค้าฝากขายจาก supplier ไม่ใช้ WAC** — ต้นทุนคือเงินที่ต้องจ่ายคืนเจ้าของสินค้า
 * = ฐาน × (1 − ส่วนแบ่งที่เราได้) คิดที่นี่ทับค่า WAC ให้เลย (ดู lib/consignment-cost.ts)
 * ⇒ ทุกทางที่สร้างออเดอร์ (บิลตรง · POS · marketplace) ได้ต้นทุนถูกต้องพร้อมกันหมด
 * ส่ง `salePrices` มาด้วยเมื่อรู้ราคาขายจริงต่อหน่วย — จำเป็นสำหรับ supplier ที่คิดจากราคาขาย
 */
export async function fetchCostMap(
  supabase: SupabaseClient,
  variationIds: string[],
  opts?: { salePrices?: Record<string, number | null | undefined> },
): Promise<Record<string, number | null>> {
  const unique = [...new Set(variationIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const [{ data }, partsMap] = await Promise.all([
    supabase.from('product_variations').select('id, cost_price').in('id', unique),
    getCompositePartsMap(supabase, unique),
  ]);

  const costMap: Record<string, number | null> = Object.fromEntries((data || []).map(v => [v.id, v.cost_price ?? null]));

  /** ทับด้วยต้นทุนฝากขาย — **ทำท้ายสุดเสมอ** (หลังสูตรสินค้าชุด) เพราะชุดที่เป็นของแบรนด์
   *  ฝากขายต้องคิดจากราคาตั้งของชุดเอง ไม่ใช่ผลรวมชิ้นส่วน (เราจ่าย supplier ตามราคาชุด) */
  const applyConsignment = async () => {
    const terms = await fetchConsignmentTerms(supabase, unique);
    for (const [variationId, term] of terms) {
      costMap[variationId] = consignmentUnitCost(term, opts?.salePrices?.[variationId]);
    }
  };

  if (partsMap.size === 0) {
    await applyConsignment();
    return costMap;
  }

  const componentIds = [...new Set([...partsMap.values()].flat().map(p => p.variationId))];
  const { data: components } = await supabase
    .from('product_variations')
    .select('id, cost_price')
    .in('id', componentIds);
  const componentCost = new Map((components || []).map(c => [c.id, c.cost_price as number | null]));

  for (const [comboId, parts] of partsMap) {
    const anyKnown = parts.some(p => componentCost.get(p.variationId) != null);
    costMap[comboId] = anyKnown
      ? parts.reduce((sum, p) => sum + (componentCost.get(p.variationId) ?? 0) * p.quantity, 0)
      : null;
  }
  await applyConsignment();
  return costMap;
}
