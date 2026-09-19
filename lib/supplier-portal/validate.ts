// Path: lib/supplier-portal/validate.ts
// 3-layer portal validation: supplier_id → portal_enabled → company feature
import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows, fetchAllRowsByIds } from '@/lib/supabase-paging';

interface PortalContext {
  supplierId: string;
  companyId: string;
  companyName: string;
  companyLogo: string | null;
  supplierName: string;
  supplierType: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  context?: PortalContext;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate portal access (used by all data endpoints)
 *
 * `ref` เป็นได้ทั้ง `portal_token` (ทางใหม่ — เดาไม่ได้ เหมือนพอร์ทัลตัวแทนฝากขาย)
 * และ `suppliers.id` (ลิงก์เก่าที่ส่งซัพพลายเออร์ไปแล้ว) — ทั้งคู่เป็น uuid แยกจาก
 * รูปแบบไม่ได้ จึงค้นทั้งสองคอลัมน์ ซึ่ง unique ทั้งคู่จึงไม่มีทางชนกัน
 */
export async function validatePortalAccess(ref: string): Promise<ValidationResult> {
  if (!ref || !UUID_RE.test(ref)) {
    return { valid: false, error: 'Portal unavailable' };
  }

  // Layer 1: Find supplier by portal_token (ทางใหม่) หรือ id (ลิงก์เก่า)
  const { data: supplier } = await supabaseAdmin
    .from('suppliers')
    .select('id, company_id, name, supplier_type, portal_enabled')
    .or(`id.eq.${ref},portal_token.eq.${ref}`)
    .eq('is_active', true)
    .single();

  if (!supplier) {
    return { valid: false, error: 'Portal unavailable' };
  }

  // Layer 2: Portal enabled
  if (!supplier.portal_enabled) {
    return { valid: false, error: 'Portal unavailable' };
  }

  // Layer 3: Company feature enabled
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('name, logo_url, settings')
    .eq('id', supplier.company_id)
    .single();

  const features = (company?.settings as { features?: { supplier?: boolean } })?.features;
  if (!features?.supplier) {
    return { valid: false, error: 'Portal unavailable' };
  }

  return {
    valid: true,
    context: {
      supplierId: supplier.id,
      companyId: supplier.company_id,
      companyName: company?.name || '',
      companyLogo: company?.logo_url || null,
      supplierName: supplier.name,
      supplierType: supplier.supplier_type,
    },
  };
}

/** Validate access code for login — returns supplier ID if valid */
export async function validateAccessCode(accessCode: string): Promise<{ valid: boolean; supplierId?: string; error?: string }> {
  const { data: supplier } = await supabaseAdmin
    .from('suppliers')
    .select('id, portal_enabled')
    .eq('access_code', accessCode)
    .eq('is_active', true)
    .single();

  if (!supplier || !supplier.portal_enabled) {
    return { valid: false, error: 'Invalid access code' };
  }

  return { valid: true, supplierId: supplier.id };
}

// Get supplier's variation IDs (supplier → brands → products → variations)
export async function getSupplierVariationIds(supplierId: string, companyId: string): Promise<string[]> {
  const { data: brands } = await supabaseAdmin
    .from('product_brands')
    .select('id')
    .eq('supplier_id', supplierId)
    .eq('company_id', companyId)
    .eq('is_active', true);

  if (!brands || brands.length === 0) return [];

  // ⚠️ ฟังก์ชันนี้เป็นต้นทางของทุกหน้าใน supplier portal (สต็อก · ยอดขาย · รายงาน)
  //    ขาดตรงนี้ = supplier เห็นของและยอดขายไม่ครบทุกหน้าพร้อมกัน
  const { rows: products } = await fetchAllRows<{ id: string }>((from, to) => supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('brand_id', brands.map(b => b.id))
    .range(from, to));

  if (products.length === 0) return [];

  const { rows: variations } = await fetchAllRowsByIds<{ id: string }>(
    products.map(p => p.id), (idChunk, from, to) => supabaseAdmin
      .from('product_variations')
      .select('id')
      .in('product_id', idChunk)
      .eq('is_active', true)
      .range(from, to));

  return variations.map(v => v.id);
}
