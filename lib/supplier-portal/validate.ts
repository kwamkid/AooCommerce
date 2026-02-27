// Path: lib/supplier-portal/validate.ts
// 3-layer portal validation: access_code → portal_enabled → company feature
import { supabaseAdmin } from '@/lib/supabase-admin';

interface PortalContext {
  supplierId: string;
  companyId: string;
  supplierName: string;
  supplierType: string;
}

interface ValidationResult {
  valid: boolean;
  error?: string;
  context?: PortalContext;
}

export async function validatePortalAccess(code: string): Promise<ValidationResult> {
  // Layer 1: Validate access code
  const { data: supplier } = await supabaseAdmin
    .from('suppliers')
    .select('id, company_id, name, supplier_type, portal_enabled')
    .eq('access_code', code)
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
    .select('settings')
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
      supplierName: supplier.name,
      supplierType: supplier.supplier_type,
    },
  };
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

  const { data: products } = await supabaseAdmin
    .from('products')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .in('brand_id', brands.map(b => b.id));

  if (!products || products.length === 0) return [];

  const { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select('id')
    .in('product_id', products.map(p => p.id))
    .eq('is_active', true);

  return (variations || []).map(v => v.id);
}
