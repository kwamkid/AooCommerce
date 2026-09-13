// ผู้ซื้อของ Shopee — ตามสัญญา `lib/marketplace/buyer-adapter.ts`
//
// ⚠️ ทุกวันนี้ Shopee ปิดบังที่อยู่ผู้ซื้อ **ทั้งหมด** (`****` ทุกช่อง ทุกออเดอร์)
// จึงคืน null ทุกช่องเป็นเรื่องปกติ — โค้ดยังแมปครบไว้เพื่อให้ได้ของจริงทันที
// ถ้าวันหนึ่ง Shopee เปิดเผยข้อมูลให้ (หรือร้านได้สิทธิ์ระดับที่เห็นที่อยู่)

import {
  asRecord, plainText, unmasked,
  type BuyerAdapter, type MarketplaceBuyer,
} from '@/lib/marketplace/buyer-adapter';

export const shopeeBuyerAdapter: BuyerAdapter = {
  extract(externalData: unknown): MarketplaceBuyer {
    const root = asRecord(externalData);
    const addr = asRecord(root?.recipient_address);
    return {
      name: unmasked(addr?.name),
      phone: unmasked(addr?.phone),
      address_line: unmasked(addr?.full_address),
      district: unmasked(addr?.district),
      // Shopee: `city` = อำเภอ/เขต · `state` = จังหวัด
      amphoe: unmasked(addr?.city),
      province: unmasked(addr?.state),
      postal_code: unmasked(addr?.zipcode),
      note: plainText(root?.note),
    };
  },
};
