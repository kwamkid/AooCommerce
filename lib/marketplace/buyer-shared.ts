// Leaf module: buyer contracts and pure helpers. Never import platform adapters here.

export interface MarketplaceBuyer {
  name?: string | null;
  phone?: string | null;
  /** บรรทัดที่อยู่ตามที่แพลตฟอร์มให้มา (บ้านเลขที่/ถนน) — null เมื่อถูกปิดบัง */
  address_line?: string | null;
  district?: string | null;
  amphoe?: string | null;
  province?: string | null;
  postal_code?: string | null;
  /** ข้อความที่ผู้ซื้อฝากไว้ตอนสั่ง */
  note?: string | null;
}

export interface BuyerAdapter {
  /** `externalData` = `orders.external_data` ของออเดอร์ใบนั้น (หรือ payload ดิบของออเดอร์) */
  extract(externalData: unknown): MarketplaceBuyer;
}

/** ไม่มีอะไรเลย — ใช้เป็นค่าตั้งต้น/ค่าคืนเมื่อ payload ไม่มีที่อยู่ */
export const EMPTY_BUYER: MarketplaceBuyer = {
  name: null,
  phone: null,
  address_line: null,
  district: null,
  amphoe: null,
  province: null,
  postal_code: null,
  note: null,
};

/** อ่าน object อย่างปลอดภัย — payload จากแพลตฟอร์มเป็น `unknown` เสมอ */
export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * ค่าที่ใช้ได้จริงเท่านั้น — **มี `*` อยู่ที่ไหนก็ตาม = ถูกปิดบัง = null**
 * (ไม่ใช่แค่ "ทั้งช่องเป็นดอกจัน" เพราะ `43***` / `095*****86` ก็ใช้ไม่ได้เหมือนกัน)
 */
export function unmasked(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v || v.includes('*')) return null;
  return v;
}

/** ข้อความอิสระของผู้ซื้อ — ไม่ใช่ฟิลด์ที่แพลตฟอร์มปิดบัง จึงแค่ตัดช่องว่าง */
export function plainText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v || null;
}

