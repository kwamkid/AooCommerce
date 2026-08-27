// Parse address (Thai + English): extract district, amphoe, province, postal_code
// Uses Thai address database for accurate matching when prefix-based regex fails

import { searchAddress, PROVINCES, ThaiAddress } from '@/lib/thai-address-data';

// Pre-sort provinces longest first (cached)
const PROVINCES_BY_LENGTH = [...PROVINCES].sort((a, b) => b.length - a.length);

// ชื่ออังกฤษ (RTGS) ของจังหวัด — ที่อยู่ที่วางมาจาก Google Maps/อีเมลมักเป็นอังกฤษ
// parser จับจังหวัดได้จากรหัสไปรษณีย์/DB แล้ว แต่คำว่า "Bangkok" ยังค้างในช่องที่อยู่
const PROVINCE_EN: Record<string, string> = {
  'กรุงเทพมหานคร': 'Bangkok', 'กระบี่': 'Krabi', 'กาญจนบุรี': 'Kanchanaburi',
  'กาฬสินธุ์': 'Kalasin', 'กำแพงเพชร': 'Kamphaeng Phet', 'ขอนแก่น': 'Khon Kaen',
  'จันทบุรี': 'Chanthaburi', 'ฉะเชิงเทรา': 'Chachoengsao', 'ชลบุรี': 'Chon Buri',
  'ชัยนาท': 'Chai Nat', 'ชัยภูมิ': 'Chaiyaphum', 'ชุมพร': 'Chumphon',
  'เชียงราย': 'Chiang Rai', 'เชียงใหม่': 'Chiang Mai', 'ตรัง': 'Trang',
  'ตราด': 'Trat', 'ตาก': 'Tak', 'นครนายก': 'Nakhon Nayok',
  'นครปฐม': 'Nakhon Pathom', 'นครพนม': 'Nakhon Phanom', 'นครราชสีมา': 'Nakhon Ratchasima',
  'นครศรีธรรมราช': 'Nakhon Si Thammarat', 'นครสวรรค์': 'Nakhon Sawan', 'นนทบุรี': 'Nonthaburi',
  'นราธิวาส': 'Narathiwat', 'น่าน': 'Nan', 'บึงกาฬ': 'Bueng Kan',
  'บุรีรัมย์': 'Buri Ram', 'ปทุมธานี': 'Pathum Thani', 'ประจวบคีรีขันธ์': 'Prachuap Khiri Khan',
  'ปราจีนบุรี': 'Prachin Buri', 'ปัตตานี': 'Pattani', 'พระนครศรีอยุธยา': 'Phra Nakhon Si Ayutthaya',
  'พะเยา': 'Phayao', 'พังงา': 'Phang Nga', 'พัทลุง': 'Phatthalung',
  'พิจิตร': 'Phichit', 'พิษณุโลก': 'Phitsanulok', 'เพชรบุรี': 'Phetchaburi',
  'เพชรบูรณ์': 'Phetchabun', 'แพร่': 'Phrae', 'ภูเก็ต': 'Phuket',
  'มหาสารคาม': 'Maha Sarakham', 'มุกดาหาร': 'Mukdahan', 'แม่ฮ่องสอน': 'Mae Hong Son',
  'ยโสธร': 'Yasothon', 'ยะลา': 'Yala', 'ร้อยเอ็ด': 'Roi Et',
  'ระนอง': 'Ranong', 'ระยอง': 'Rayong', 'ราชบุรี': 'Ratchaburi',
  'ลพบุรี': 'Lop Buri', 'ลำปาง': 'Lampang', 'ลำพูน': 'Lamphun',
  'เลย': 'Loei', 'ศรีสะเกษ': 'Si Sa Ket', 'สกลนคร': 'Sakon Nakhon',
  'สงขลา': 'Songkhla', 'สตูล': 'Satun', 'สมุทรปราการ': 'Samut Prakan',
  'สมุทรสงคราม': 'Samut Songkhram', 'สมุทรสาคร': 'Samut Sakhon', 'สระแก้ว': 'Sa Kaeo',
  'สระบุรี': 'Saraburi', 'สิงห์บุรี': 'Sing Buri', 'สุโขทัย': 'Sukhothai',
  'สุพรรณบุรี': 'Suphan Buri', 'สุราษฎร์ธานี': 'Surat Thani', 'สุรินทร์': 'Surin',
  'หนองคาย': 'Nong Khai', 'หนองบัวลำภู': 'Nong Bua Lam Phu', 'อ่างทอง': 'Ang Thong',
  'อำนาจเจริญ': 'Amnat Charoen', 'อุดรธานี': 'Udon Thani', 'อุตรดิตถ์': 'Uttaradit',
  'อุทัยธานี': 'Uthai Thani', 'อุบลราชธานี': 'Ubon Ratchathani',
};

export const parseThaiAddress = (text: string) => {
  const result = { address: '', district: '', amphoe: '', province: '', postal_code: '' };

  // Normalize whitespace
  let s = text.replace(/\s+/g, ' ').trim();

  // Extract postal code (5 digits)
  const postalMatch = s.match(/\b(\d{5})\b/);
  if (postalMatch) {
    result.postal_code = postalMatch[1];
    s = s.replace(postalMatch[0], '').trim();
  }

  // --- Phase 1: Prefix-based regex extraction ---
  // \s* to handle no-space cases like แขวงจอมพล, เขตจตุจักร

  // Extract province — จ./จังหวัด or Province
  const provinceSuffixMatch = s.match(/([A-Za-z][A-Za-z ]+?)\s+[Pp]rovince/);
  const provinceThaiMatch = s.match(/(?:จ\.|จังหวัด)\s*([^\s,]+)/);
  const provinceEngMatch = s.match(/(?:[Pp]rovince|[Pp]rov\.|[Cc]hangwat)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
  const provinceMatch = provinceSuffixMatch || provinceThaiMatch || provinceEngMatch;
  if (provinceMatch) {
    result.province = provinceMatch[1].trim();
    s = s.replace(provinceMatch[0], '').trim();
  }

  // If no prefix match, scan for province name directly in text
  if (!result.province) {
    for (const prov of PROVINCES_BY_LENGTH) {
      if (s.includes(prov)) {
        result.province = prov;
        s = s.replace(prov, '').trim();
        break;
      }
    }
  }

  // Extract amphoe — อ./อำเภอ/เขต or District
  const amphoeSuffixMatch = s.match(/([A-Za-z][A-Za-z ]+?)\s+[Dd]istrict/);
  const amphoeThaiMatch = s.match(/(?:อ\.|อำเภอ|เขต)\s*([^\s,]+)/);
  const amphoeEngMatch = s.match(/(?:[Dd]istrict|[Dd]ist\.|[Aa]mphoe|[Kk]het)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
  const amphoeMatch = amphoeSuffixMatch || amphoeThaiMatch || amphoeEngMatch;
  if (amphoeMatch) {
    result.amphoe = amphoeMatch[1].trim();
    s = s.replace(amphoeMatch[0], '').trim();
  }

  // Extract district (sub-district) — ต./ตำบล/แขวง or Sub-district
  const districtSuffixMatch = s.match(/([A-Za-z][A-Za-z ]+?)\s+[Ss]ub-?[Dd]istrict/);
  const districtThaiMatch = s.match(/(?:ต\.|ตำบล|แขวง)\s*([^\s,]+)/);
  const districtEngMatch = s.match(/(?:[Ss]ub-?[Dd]istrict|[Tt]ambon|[Kk]hwaeng)\s+([^\s,]+(?:\s+[^\s,]+)?)/);
  const districtMatch = districtSuffixMatch || districtThaiMatch || districtEngMatch;
  if (districtMatch) {
    result.district = districtMatch[1].trim();
    s = s.replace(districtMatch[0], '').trim();
  }

  // --- Phase 2: Database matching for missing fields ---

  // Use postal code to fill missing fields
  if (result.postal_code && (!result.province || !result.amphoe || !result.district)) {
    const dbResults = searchAddress(result.postal_code, 'zipcode', 50);
    if (dbResults.length > 0) {
      if (!result.province) result.province = dbResults[0].province;
      if (!result.amphoe || !result.district) {
        const matched = findBestMatch(s, dbResults);
        if (matched) {
          if (!result.amphoe) result.amphoe = matched.amphoe;
          if (!result.district) result.district = matched.district;
        }
      }
    }
  }

  // Province found but missing amphoe/district or postal — use DB
  if (result.province && (!result.amphoe || !result.district || !result.postal_code)) {
    const dbResults = searchAddress(result.province, 'province', 500);
    if (dbResults.length > 0) {
      const matched = findBestMatch(s, dbResults);
      if (matched) {
        if (!result.amphoe) result.amphoe = matched.amphoe;
        if (!result.district) result.district = matched.district;
        if (!result.postal_code) result.postal_code = String(matched.zipcode);
      }
    }
  }

  // --- Phase 3: Clean up address (remove matched parts) ---
  let cleanAddr = s;
  if (result.district) cleanAddr = cleanAddr.replace(result.district, '');
  if (result.amphoe) cleanAddr = cleanAddr.replace(result.amphoe, '');
  if (result.province) cleanAddr = cleanAddr.replace(result.province, '');
  cleanAddr = cleanAddr.replace(/(?:ต\.|ตำบล|แขวง|อ\.|อำเภอ|เขต|จ\.|จังหวัด)\s*/g, '');

  // ชื่ออังกฤษของจังหวัดที่จับได้ (เช่น "Bangkok") + คำว่า Thailand ต้องหลุดด้วย
  // — "Chon Buri" ใน map เขียนแบบมีช่องว่าง แต่คนพิมพ์ "Chonburi" ก็ต้องจับ (\s* คั่นคำ)
  const provinceEn = result.province ? PROVINCE_EN[result.province] : undefined;
  if (provinceEn) {
    const pattern = provinceEn.split(' ').map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*');
    cleanAddr = cleanAddr.replace(new RegExp(`\\b${pattern}\\b`, 'gi'), '');
  }
  cleanAddr = cleanAddr.replace(/\b(?:Thailand|ประเทศไทย)\b/gi, '');

  // เก็บกวาดลูกน้ำ: แยกตาม comma แล้วทิ้งท่อนว่าง — จับทั้ง ",," และ ", ,"
  result.address = cleanAddr
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .join(', ')
    .trim();

  const hasParsed = result.district || result.amphoe || result.province || result.postal_code;
  return hasParsed ? result : null;
};

// Find the best matching address from DB results by checking which names appear in the text
function findBestMatch(text: string, candidates: ThaiAddress[]): ThaiAddress | null {
  let bestMatch: ThaiAddress | null = null;
  let bestScore = 0;

  for (const addr of candidates) {
    let score = 0;
    if (text.includes(addr.district)) score += 3;
    if (text.includes(addr.amphoe)) score += 2;
    if (text.includes(addr.province)) score += 1;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = addr;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}
