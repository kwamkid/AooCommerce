// Parse address (Thai + English): extract district, amphoe, province, postal_code
// Uses Thai address database for accurate matching when prefix-based regex fails

import { searchAddress, PROVINCES, ThaiAddress } from '@/lib/thai-address-data';

// Pre-sort provinces longest first (cached)
const PROVINCES_BY_LENGTH = [...PROVINCES].sort((a, b) => b.length - a.length);

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
  result.address = cleanAddr.replace(/[,\s]+$/, '').replace(/^[,\s]+/, '').replace(/,{2,}/g, ',').trim();

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
