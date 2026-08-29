/**
 * Delivery zone + slot presets — ทางลัดสำหรับหน้า /settings/delivery
 * (pattern เดียวกับ `lib/constants/carriers.ts`: preset = "เติมค่าลงฟอร์ม"
 * ผู้ใช้แก้ต่อแล้วกดบันทึกเอง — ไฟล์นี้ไม่เขียน DB และไม่ถูก seed อัตโนมัติ)
 *
 * ⚠️ `resolveZone()` ใน lib/delivery.ts **ไม่มี wildcard** — โซนจะ match ก็ต่อเมื่อ
 * ค่าที่อยู่อยู่ในลิสต์จริง (postcodes → districts → provinces ต่อโซน, ไล่ตาม
 * sort_order โซนแรกที่ match ชนะ) ลิสต์ในไฟล์นี้จึงต้อง "ครบ" ไม่ใช่ปล่อยว่าง
 * แล้วหวังให้เป็น catch-all
 *
 * ชื่อเขต/อำเภอ/จังหวัด/รหัสไปรษณีย์ **derive จาก `lib/thai-address-data.ts`**
 * ซึ่งเป็น dataset เดียวกับที่ `ThaiAddressInput` เขียนลงที่อยู่ — ห้ามพิมพ์เอง
 * (เขต กทม. ใน dataset ไม่มีคำว่า "เขต" นำหน้า ถ้าพิมพ์มือจะ match ไม่ติดทั้งชุด)
 */
import { PROVINCES, buildAddressIndex } from '@/lib/thai-address-data';

export interface DeliveryZonePreset {
  /** key ภายในไฟล์นี้ (ใช้ highlight chip ที่เลือก) — ไม่ได้เก็บลง DB */
  key: string;
  name: string;
  provinces: string[];
  districts: string[];
  postcodes: string[];
  fee_type: 'fixed' | 'lalamove';
  fee: number;
  free_over: number | null;
  /** เวลาเตรียม + จัดส่งถึงโซนนี้ (นาที) — เกณฑ์เวลาเดียวของระบบ */
  lead_minutes: number;
}

export interface DeliverySlotPreset {
  key: string;
  name: string;
  /** 'HH:mm' — ต้องเป็นช่วง 2-3 ชม. ห้ามเวลาเป๊ะ */
  start_time: string;
  end_time: string;
  days_of_week: number[];
  /** null = ไม่จำกัดจำนวนออเดอร์ต่อวัน */
  capacity: number | null;
  /** เลิกใช้แล้ว — เวลาคุมที่ zone.lead_minutes ที่เดียว จึงเป็น 0 เสมอ */
  cutoff_minutes: 0;
}

const BANGKOK = 'กรุงเทพมหานคร';

/** ปริมณฑล — 5 จังหวัดรอบ กทม. */
const METRO_PROVINCES = ['นนทบุรี', 'ปทุมธานี', 'สมุทรปราการ', 'สมุทรสาคร', 'นครปฐม'];

/**
 * 23 เขตชั้นในของ กทม. (นิยามตามผังเมือง — ส่วนที่เหลืออีก 27 เขต = ชั้นนอก)
 * นี่คือลิสต์เชิงนโยบายชุดเดียวที่เขียนเอง ที่เหลือ derive จาก dataset ทั้งหมด
 * และถูก filter ด้วย dataset อีกชั้น (ชื่อที่ไม่มีจริงจะถูกตัดทิ้ง ไม่หลุดออกไป)
 */
const INNER_BANGKOK_DISTRICTS = [
  'พระนคร', 'ป้อมปราบศัตรูพ่าย', 'สัมพันธวงศ์', 'ปทุมวัน', 'บางรัก', 'สาทร',
  'บางคอแหลม', 'ยานนาวา', 'ดุสิต', 'พญาไท', 'ราชเทวี', 'ห้วยขวาง', 'ดินแดง',
  'วัฒนา', 'คลองเตย', 'จตุจักร', 'ลาดพร้าว', 'บางซื่อ', 'ธนบุรี', 'คลองสาน',
  'บางกอกใหญ่', 'บางกอกน้อย', 'บางพลัด',
];

interface BangkokAreas {
  innerDistricts: string[];
  outerDistricts: string[];
  innerPostcodes: string[];
  outerPostcodes: string[];
}

/**
 * แบ่งพื้นที่ กทม. จาก dataset จริง โดยยึด 2 กติกาที่กัน match ผิด:
 *
 * 1) **รหัสไปรษณีย์ที่คร่อม 2 โซน ไม่ใส่ให้ใครเลย** — เช่น 10260 มีทั้งคลองเตย/วัฒนา
 *    (ชั้นใน) และบางนา/พระโขนง (ชั้นนอก) ถ้าใส่ให้ชั้นใน (โซนบน) ที่อยู่บางนา
 *    จะโดนคิดค่าส่งชั้นในทันทีเพราะ resolveZone เช็ค postcode ก่อน district
 *    → ปล่อยให้ตกไป match ด้วยชื่อเขตซึ่งแม่นรายเขตแทน
 *    (ปัจจุบันคร่อม 3 รหัส: 10230 · 10260 · 10310)
 * 2) **ชื่อเขต กทม. ที่ซ้ำกับอำเภอต่างจังหวัด ไม่ใส่ในลิสต์เขตชั้นนอก** — ปัจจุบันคือ
 *    "จอมทอง" (กทม. + เชียงใหม่) ถ้าใส่ไว้ อ.จอมทอง เชียงใหม่ จะ match โซน กทม.
 *    ชั้นนอกก่อนถึงโซนต่างจังหวัด · ฝั่ง กทม. ไม่เสียหายเพราะโซนชั้นนอกมี
 *    จังหวัด "กรุงเทพมหานคร" เป็นตัวรับท้าย (ชั้นในถูกเช็คไปก่อนแล้ว)
 */
function deriveBangkokAreas(): BangkokAreas {
  const idx = buildAddressIndex();
  const allDistricts = idx.amphoesByProvince[BANGKOK] || [];
  const postcodesOf = idx.postcodesByAmphoe[BANGKOK] || {};

  const innerDistricts = INNER_BANGKOK_DISTRICTS.filter(d => allDistricts.includes(d));
  const outerAll = allDistricts.filter(d => !innerDistricts.includes(d));
  const sharedWithOtherProvince = (district: string) =>
    (idx.provincesByAmphoe[district] || []).some(p => p !== BANGKOK);

  const zipsOf = (districts: string[]) =>
    new Set(districts.flatMap(d => postcodesOf[d] || []));
  const innerZips = zipsOf(innerDistricts);
  const outerZips = zipsOf(outerAll);

  /** เอาเฉพาะรหัสที่เป็นของโซนนี้โซนเดียว และไม่ถูกใช้โดยจังหวัดอื่นด้วย */
  const exclusive = (mine: Set<string>, other: Set<string>) =>
    [...mine]
      .filter(z => !other.has(z) && (idx.provincesByPostcode[z] || []).every(p => p === BANGKOK))
      .sort();

  return {
    innerDistricts,
    outerDistricts: outerAll.filter(d => !sharedWithOtherProvince(d)),
    innerPostcodes: exclusive(innerZips, outerZips),
    outerPostcodes: exclusive(outerZips, innerZips),
  };
}

const bangkok = deriveBangkokAreas();

/** จังหวัดต่างจังหวัด = ทั้งหมด − กทม. − ปริมณฑล */
const UPCOUNTRY_PROVINCES = PROVINCES.filter(
  p => p !== BANGKOK && !METRO_PROVINCES.includes(p),
);

/**
 * เรียงจาก **แคบ → กว้าง** เพราะโซนแรกที่ match ชนะ — index ในอาเรย์นี้คือ
 * ลำดับที่ควรอยู่ในหน้า settings ด้วย (ผู้ใช้เพิ่มตามลำดับ chip ซ้าย→ขวา)
 */
export const DELIVERY_ZONE_PRESETS: DeliveryZonePreset[] = [
  {
    key: 'bkk_inner',
    name: 'กรุงเทพฯ ชั้นใน',
    provinces: [],
    districts: bangkok.innerDistricts,
    postcodes: bangkok.innerPostcodes,
    fee_type: 'fixed',
    fee: 50,
    free_over: null,
    lead_minutes: 120,
  },
  {
    key: 'bkk_outer',
    name: 'กรุงเทพฯ ชั้นนอก',
    // ใส่จังหวัด กทม. ไว้ท้ายโซนนี้เป็นตัวรับที่อยู่ กทม. ที่ไม่เข้าชั้นใน
    // (กรอกเขตไม่ครบ / เขตชื่อซ้ำกับต่างจังหวัด) — โซนชั้นในถูกเช็คไปก่อนแล้ว
    provinces: [BANGKOK],
    districts: bangkok.outerDistricts,
    postcodes: bangkok.outerPostcodes,
    fee_type: 'fixed',
    fee: 80,
    free_over: null,
    lead_minutes: 120,
  },
  {
    key: 'metro',
    name: 'ปริมณฑล',
    provinces: METRO_PROVINCES,
    districts: [],
    postcodes: [],
    fee_type: 'fixed',
    fee: 100,
    free_over: null,
    lead_minutes: 240,
  },
  {
    key: 'upcountry',
    name: 'ต่างจังหวัด',
    provinces: UPCOUNTRY_PROVINCES,
    districts: [],
    postcodes: [],
    fee_type: 'fixed',
    fee: 150,
    free_over: null,
    lead_minutes: 1440,   // 1 วัน — รอบของวันนี้จะตกไปเองทั้งหมด
  },
];

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

export const DELIVERY_SLOT_PRESETS: DeliverySlotPreset[] = [
  { key: 'morning',   name: 'รอบเช้า',     start_time: '09:00', end_time: '12:00', days_of_week: EVERY_DAY, capacity: null, cutoff_minutes: 0 },
  { key: 'afternoon', name: 'รอบบ่าย',     start_time: '13:00', end_time: '16:00', days_of_week: EVERY_DAY, capacity: null, cutoff_minutes: 0 },
  { key: 'evening',   name: 'รอบเย็น',     start_time: '17:00', end_time: '20:00', days_of_week: EVERY_DAY, capacity: null, cutoff_minutes: 0 },
  { key: 'night',     name: 'รอบกลางคืน', start_time: '20:00', end_time: '23:00', days_of_week: EVERY_DAY, capacity: null, cutoff_minutes: 0 },
];
