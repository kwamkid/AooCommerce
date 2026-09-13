// ผู้ซื้อของ Lazada — ตามสัญญา `lib/marketplace/buyer-adapter.ts`
//
// ของจริงที่ Lazada ให้มา (ยืนยันจากข้อมูลใน DB):
//   address_shipping.city      = **อำเภอ/เขต ไม่ถูกปิดบัง** รูปแบบ "เมืองหนองคาย/ Mueang Nong Khai"
//   address_shipping.post_code = **รหัสไปรษณีย์ ไม่ถูกปิดบัง** ("43000")
//   ที่เหลือ (ชื่อ · เบอร์ · address1–5) ถูกปิดบังด้วย `*`
// จังหวัดไม่มีฟิลด์ของตัวเอง → เดาจากรหัสไปรษณีย์ผ่านชุดข้อมูลที่อยู่ไทยชุดเดียวกับ
// `ThaiAddressInput` (เอาเฉพาะตอนที่รหัสนั้นชี้จังหวัดเดียวชัดเจนเท่านั้น)

import {
  asRecord, plainText, unmasked,
  type BuyerAdapter, type MarketplaceBuyer,
} from '@/lib/marketplace/buyer-adapter';
import { buildAddressIndex } from '@/lib/thai-address-data';

const THAI_CHARS = /[\u0E00-\u0E7F]/;

/** "เมืองหนองคาย/ Mueang Nong Khai" → "เมืองหนองคาย" (ไม่มีส่วนไทย = เอาท่อนแรก) */
function thaiPart(value: string | null): string | null {
  if (!value) return null;
  const parts = value.split('/').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  return parts.find(p => THAI_CHARS.test(p)) || parts[0];
}

/** รหัสไปรษณีย์ → จังหวัด (เฉพาะรหัสที่ชี้จังหวัดเดียว — ไม่งั้นเดาผิดดีกว่าไม่เดา) */
function provinceFromPostcode(postcode: string | null): string | null {
  if (!postcode || !/^\d{5}$/.test(postcode)) return null;
  const provinces = buildAddressIndex().provincesByPostcode[postcode];
  return provinces && provinces.length === 1 ? provinces[0] : null;
}

export const lazadaBuyerAdapter: BuyerAdapter = {
  extract(externalData: unknown): MarketplaceBuyer {
    const root = asRecord(externalData);
    // `orders.external_data` ของ Lazada = `{ order, items }` · แต่ตัว sync ส่ง order ดิบมาก็ได้
    const order = asRecord(root?.order) ?? root;
    const addr = asRecord(order?.address_shipping);

    const name = [unmasked(addr?.first_name), unmasked(addr?.last_name)]
      .filter(Boolean).join(' ').trim() || null;

    const addressLine = [addr?.address1, addr?.address2, addr?.address3, addr?.address4, addr?.address5]
      .map(unmasked).filter(Boolean).join(' ').trim() || null;

    const postalCode = unmasked(addr?.post_code);

    return {
      name,
      phone: unmasked(addr?.phone),
      address_line: addressLine,
      district: thaiPart(unmasked(addr?.addressDistrict)),
      amphoe: thaiPart(unmasked(addr?.city)),
      province: provinceFromPostcode(postalCode),
      postal_code: postalCode,
      note: plainText(order?.remarks),
    };
  },
};
