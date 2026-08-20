// Path: lib/thai-geocode.ts
// แปลงผล reverse geocode ของ Google → ที่อยู่ไทยที่ระบบใช้จริง (client-safe, pure)
//
// ทำไมต้องมีชั้นนี้: Google คืนชื่อพื้นที่ไม่ตรงกับฐานข้อมูลไทยของเรา
//   - ใส่คำนำหน้ามาด้วย ("เขตวัฒนา", "ตำบลหนองปรือ", "จังหวัดชลบุรี")
//   - บางจุดไม่มี postal_code เลย (กลางซอย/ที่ดินเปล่า)
//   - บางทีสลับ level (แขวงไปโผล่ administrative_area_level_3 บ้าง sublocality บ้าง)
// แต่ resolveZone() จับคู่โซนด้วย "ข้อความ" ตรง ๆ (postcode → อำเภอ → จังหวัด)
// ถ้าปล่อยชื่อดิบจาก Google เข้าไป โซนจะไม่ match แล้วลูกค้าจะเจอ "นอกพื้นที่จัดส่ง"
// ทั้งที่อยู่ในพื้นที่ — จึงต้อง reconcile กับ lib/thai-address-data ก่อนเสมอ

import { searchAddress, type ThaiAddress } from './thai-address-data';

export interface GeocodeComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

export interface ParsedThaiAddress {
  /** บ้านเลขที่ + ถนน เท่าที่ Google ให้มา (มักได้แค่ระดับถนน — ลูกค้าต้องเติมเอง) */
  address: string;
  /** ตำบล / แขวง */
  district: string;
  /** อำเภอ / เขต */
  amphoe: string;
  province: string;
  postal_code: string;
  /** true = จับคู่กับฐานข้อมูลที่อยู่ไทยได้ (ชื่อ + รหัสไปรษณีย์เชื่อถือได้) */
  matched: boolean;
}

const AREA_PREFIXES = ['จังหวัด', 'อำเภอ', 'เขต', 'ตำบล', 'แขวง', 'อ.', 'ต.', 'จ.'];

function stripPrefix(value: string): string {
  let s = (value || '').trim();
  for (const p of AREA_PREFIXES) {
    if (s.startsWith(p)) { s = s.slice(p.length).trim(); break; }
  }
  return s;
}

function pick(components: GeocodeComponent[], ...types: string[]): string {
  for (const t of types) {
    const hit = components.find(c => c.types.includes(t));
    if (hit?.long_name) return hit.long_name;
  }
  return '';
}

/** ให้คะแนนแถวในฐานข้อมูลว่าตรงกับที่ Google บอกแค่ไหน — ตัวคะแนนสูงสุดชนะ */
function score(row: ThaiAddress, raw: { district: string; amphoe: string; province: string }): number {
  let n = 0;
  if (raw.district && (row.district === raw.district || row.district.includes(raw.district) || raw.district.includes(row.district))) n += 3;
  if (raw.amphoe && (row.amphoe === raw.amphoe || row.amphoe.includes(raw.amphoe) || raw.amphoe.includes(row.amphoe))) n += 3;
  if (raw.province && (row.province === raw.province || row.province.includes(raw.province))) n += 2;
  return n;
}

/**
 * จับคู่ชื่อพื้นที่ดิบกับฐานข้อมูลที่อยู่ไทย — คืนชื่อมาตรฐาน + รหัสไปรษณีย์ที่ถูก
 * หาไม่เจอ → คืนค่าดิบไปตามเดิม (ยังพอ match โซนระดับจังหวัดได้)
 */
export function reconcileThaiArea(raw: {
  district: string; amphoe: string; province: string; postal_code: string;
}): { district: string; amphoe: string; province: string; postal_code: string; matched: boolean } {
  const zip = (raw.postal_code || '').replace(/\D/g, '');

  // รหัสไปรษณีย์เป็นตัวตั้งที่แม่นสุดถ้ามี — ตัดผู้สมัครเหลือหลักสิบแถว
  let pool: ThaiAddress[] = zip.length === 5 ? searchAddress(zip, 'zipcode', 400) : [];
  if (!pool.length && raw.district) pool = searchAddress(raw.district, 'district', 400);
  if (!pool.length && raw.amphoe) pool = searchAddress(raw.amphoe, 'amphoe', 400);
  if (!pool.length) return { ...raw, postal_code: zip, matched: false };

  let best: ThaiAddress | null = null;
  let bestScore = 0;
  for (const row of pool) {
    const s = score(row, raw);
    if (s > bestScore) { best = row; bestScore = s; }
  }

  // มี zip แต่ชื่อไม่ตรงสักตัว → ยังเชื่อ zip ได้ (ใช้แถวแรกของ zip นั้น)
  if (!best && zip.length === 5) { best = pool[0]; bestScore = 1; }
  if (!best) return { ...raw, postal_code: zip, matched: false };

  return {
    district: best.district,
    amphoe: best.amphoe,
    province: best.province,
    postal_code: String(best.zipcode),
    matched: bestScore >= 3,
  };
}

/** แกะ address_components ของ Google → ที่อยู่ไทยที่ normalize แล้ว */
export function parseThaiGeocode(components: GeocodeComponent[]): ParsedThaiAddress {
  const raw = {
    province: stripPrefix(pick(components, 'administrative_area_level_1')),
    amphoe: stripPrefix(pick(components, 'administrative_area_level_2')),
    // แขวง/ตำบล โผล่ได้หลาย level แล้วแต่พื้นที่ — ไล่จากละเอียดไปหยาบ
    district: stripPrefix(pick(
      components,
      'sublocality_level_2', 'sublocality_level_1', 'sublocality',
      'administrative_area_level_3', 'locality', 'neighborhood',
    )),
    postal_code: pick(components, 'postal_code'),
  };

  const area = reconcileThaiArea(raw);

  const street = [pick(components, 'street_number'), pick(components, 'route')]
    .filter(Boolean).join(' ').trim();
  const premise = pick(components, 'premise', 'subpremise', 'point_of_interest', 'establishment');
  // เอาเฉพาะส่วนที่ "ไม่ใช่" ชื่อพื้นที่ — ตำบล/อำเภอ/จังหวัดมีช่องของตัวเองอยู่แล้ว
  const address = [premise, street].filter(Boolean).join(' ').trim();

  return { address, ...area };
}

export function buildMapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}
