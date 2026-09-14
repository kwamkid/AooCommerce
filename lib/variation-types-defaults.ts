// ค่าตัวเลือกมาตรฐานของสินค้า (variation_types) — client-safe ไม่ import อะไรทั้งนั้น
//
// ใช้ตอนสร้างบริษัทใหม่ (`POST /api/companies`) และเอาไปโชว์เป็นตัวอย่าง/คำแนะนำ
// ในหน้าฟอร์มได้ · ลำดับในอาร์เรย์ = `sort_order` (1, 2, 3, …)
//
// ⚠️ บริษัทเก่าถูกเติมชื่อที่ขาดให้แล้วด้วย migration `seed_default_variation_types_backfill`
// (เทียบชื่อแบบ lower(trim) กันซ้ำ) — เพิ่มชื่อใหม่ในลิสต์นี้ต้องมี migration เติมย้อนหลังด้วย
export const DEFAULT_VARIATION_TYPES = [
  'สี',
  'ไซซ์',
  'ขนาด',
  'ลาย',
  'รสชาติ',
  'วัสดุ',
  'ความจุ',
  'รูปทรง',
] as const;

/** แถวพร้อม insert ลงตาราง `variation_types` ของบริษัทที่เพิ่งสร้าง */
export function defaultVariationTypeRows(companyId: string) {
  return DEFAULT_VARIATION_TYPES.map((name, i) => ({
    name,
    sort_order: i + 1,
    company_id: companyId,
  }));
}
