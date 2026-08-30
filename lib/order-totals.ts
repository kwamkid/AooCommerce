// Path: lib/order-totals.ts
// สูตรเดียวของ "ยอดที่ลูกค้าต้องจ่าย" — ใช้ร่วมทั้งฝั่ง client (OrderForm, POS)
// และ API (orders, pos, storefront checkout) ห้ามคำนวณเองซ้ำที่ไหนอีก
//
// กติกา:
//  • ราคาสินค้าทุกที่ในระบบเป็น **ราคารวม VAT แล้ว** → VAT ถอดกลับจากยอดรวม
//    (ไม่ใช่บวกทับข้างบน) ร้านที่ไม่ได้จด VAT ได้ vat = 0 และ subtotal = ยอดรวม
//  • ค่าจัดส่ง + ค่าการ์ดอวยพร **เป็นส่วนหนึ่งของยอดที่ลูกค้าต้องจ่าย** —
//    เคยหายไปจาก total_amount เพราะ DB trigger คิดจากรายการสินค้าอย่างเดียว
//    (แก้แล้ว 2026-08-30 ดู supabase/migrations/20260830_order_totals_vat_split_only.sql)
//  • ⚠️ ออเดอร์ marketplace ไม่ใช้สูตรนี้ — total_amount มาจากแพลตฟอร์ม และ
//    shipping_fee ที่เก็บไว้คือค่าส่งที่แพลตฟอร์มหักเรา ไม่ใช่ยอดที่บวกให้ลูกค้าจ่าย

export const VAT_RATE = 0.07;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface VatSplit {
  /** ยอดก่อน VAT */
  subtotal: number;
  /** VAT 7% (0 เมื่อร้านไม่ได้จด VAT) */
  vatAmount: number;
  /** ยอดรวมสุทธิที่ลูกค้าต้องจ่าย */
  totalAmount: number;
}

/** แตกยอดรวม (ราคารวม VAT แล้ว) ออกเป็น subtotal + vat */
export function splitVatInclusive(totalWithVat: number, vatRegistered: boolean): VatSplit {
  const totalAmount = round2(totalWithVat);
  if (!vatRegistered) return { subtotal: totalAmount, vatAmount: 0, totalAmount };
  const subtotal = round2(totalAmount / (1 + VAT_RATE));
  return { subtotal, vatAmount: round2(totalAmount - subtotal), totalAmount };
}

export interface OrderTotalsInput {
  /** ยอดรวมรายการสินค้าหลังหักส่วนลดรายชิ้นแล้ว */
  itemsTotal: number;
  /** ส่วนลดท้ายบิล */
  discountAmount?: number;
  shippingFee?: number;
  giftCardFee?: number;
  vatRegistered: boolean;
}

/** ยอดที่ลูกค้าต้องจ่าย = สินค้า − ส่วนลดท้ายบิล + ค่าส่ง + ค่าการ์ด */
export function computeOrderTotals({
  itemsTotal,
  discountAmount = 0,
  shippingFee = 0,
  giftCardFee = 0,
  vatRegistered,
}: OrderTotalsInput): VatSplit {
  return splitVatInclusive(
    (itemsTotal || 0) - (discountAmount || 0) + (shippingFee || 0) + (giftCardFee || 0),
    vatRegistered,
  );
}
