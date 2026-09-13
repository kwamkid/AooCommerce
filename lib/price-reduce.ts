// Path: lib/price-reduce.ts
//
// ตัวคำนวณช่อง "ลดเหลือ" — pure · client-safe · ใช้ได้ทั้งฟอร์มสินค้าและหน้าโปรโมชัน
// ของที่เก็บจริงเสมอคือราคาสุดท้าย (discount_price) · % และ "ลดไป" เป็นแค่วิธีพิมพ์

export type ReduceMode = 'price' | 'percent' | 'amount';
/** The raw number the user typed + what it means */
export interface ReduceSpec { mode: ReduceMode; input: number }
export const NO_REDUCE: ReduceSpec = { mode: 'price', input: 0 };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Final `discount_price` for one row (0 = no discount) — percent/amount need a base > 0 */
export function applyReduce(basePrice: number, spec: ReduceSpec): number {
  const input = Number(spec.input) || 0;
  if (input <= 0) return 0;
  switch (spec.mode) {
    case 'price': return round2(input);
    case 'percent': return basePrice > 0 ? Math.max(round2(basePrice * (1 - input / 100)), 0) : 0;
    case 'amount': return basePrice > 0 ? Math.max(round2(basePrice - input), 0) : 0;
  }
}

/** What a reduced price saves vs its base — null when there is nothing valid to describe */
export function reduceSummary(basePrice: number, price: number): { percent: number; amount: number } | null {
  if (!(basePrice > 0) || !(price > 0) || price >= basePrice) return null;
  const amount = round2(basePrice - price);
  return { percent: round2((amount / basePrice) * 100), amount };
}
