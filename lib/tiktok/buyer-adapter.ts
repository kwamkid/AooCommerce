// ผู้ซื้อของ TikTok Shop — ตามสัญญา `lib/marketplace/buyer-adapter.ts`
//
// ของจริงที่ TikTok ให้มา (ยืนยันจากข้อมูลใน DB):
//   recipient_address.district_info[] = ลำดับชั้นที่อยู่ **ไม่ถูกปิดบัง**
//        L0 ประเทศ · L1 จังหวัด · L2 อำเภอ/เขต · (L3 ตำบล ถ้ามี)
//   recipient_address.postal_code     = ปิดบังบางส่วน ("43***") → ใช้ไม่ได้
//   ชื่อ · เบอร์ · address_line* · full_address ถูกปิดบังด้วย `*`

import {
  asRecord, plainText, unmasked,
  type BuyerAdapter, type MarketplaceBuyer,
} from '@/lib/marketplace/buyer-adapter';

/** หยิบชื่อพื้นที่ตามชั้น (`L1` = จังหวัด · `L2` = อำเภอ · `L3` = ตำบล) */
function levelName(districtInfo: unknown, level: string): string | null {
  if (!Array.isArray(districtInfo)) return null;
  for (const entry of districtInfo) {
    const row = asRecord(entry);
    if (!row) continue;
    if (String(row.address_level || '').toUpperCase() === level) {
      return unmasked(row.address_name);
    }
  }
  return null;
}

export const tiktokBuyerAdapter: BuyerAdapter = {
  extract(externalData: unknown): MarketplaceBuyer {
    const root = asRecord(externalData);
    const addr = asRecord(root?.recipient_address);
    const info = addr?.district_info;

    const addressLine = unmasked(addr?.address_line1)
      || unmasked(addr?.address_detail)
      || unmasked(addr?.full_address);

    return {
      name: unmasked(addr?.name),
      phone: unmasked(addr?.phone_number),
      address_line: addressLine,
      district: levelName(info, 'L3'),
      amphoe: levelName(info, 'L2'),
      province: levelName(info, 'L1'),
      postal_code: unmasked(addr?.postal_code),
      note: plainText(root?.buyer_message),
    };
  },
};
