// Storefront data access — server only (service role, bypasses RLS).
//
// ⚠️ Every query MUST filter company_id and MUST only select fields that are
// safe to expose publicly. Never return cost_price, internal notes, stock
// numbers, supplier data, or anything not needed to render the shop.
//
// Results are wrapped in React cache() so generateMetadata + the page body
// share one fetch per request (same pattern as /bills/[id]).
import { cache } from 'react';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  parseStorefront, effectivePrice,
  type StorefrontConfig, type StorefrontProduct, type StorefrontVariation,
} from '@/lib/storefront';
import { parseFeatures, type FeatureFlags } from '@/lib/features';

export interface StorefrontCompany {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  config: StorefrontConfig;
  features: FeatureFlags;
}

/**
 * Resolve a storefront by company slug. Returns null when the company is
 * missing/inactive OR the storefront is switched off — callers must 404 so a
 * disabled shop never leaks product data.
 */
export const getStorefrontCompany = cache(async (slug: string): Promise<StorefrontCompany | null> => {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('id, slug, name, logo_url, description, phone, email, address, settings, is_active')
    .eq('slug', slug)
    .maybeSingle();

  if (!data || data.is_active === false) return null;

  const settings = (data.settings as Record<string, unknown> | null) || {};
  const config = parseStorefront(settings);
  if (!config.enabled) return null;

  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    logo_url: data.logo_url,
    description: data.description,
    phone: data.phone,
    email: data.email,
    address: data.address,
    config,
    features: parseFeatures(settings).features,
  };
});

interface RawVariation {
  id: string;
  variation_label: string | null;
  sku: string | null;
  default_price: number;
  discount_price: number | null;
  stock: number | null;
  is_active: boolean;
}

/** variation → public shape. Stock is exposed as a boolean only, never a count. */
function toPublicVariation(
  v: RawVariation,
  imageByVariation: Map<string, string>,
  stockEnabled: boolean,
): StorefrontVariation {
  const { price, compare_at } = effectivePrice(v.default_price, v.discount_price);
  return {
    id: v.id,
    label: v.variation_label,
    sku: v.sku,
    price,
    compare_at,
    // ร้านที่ไม่ได้ใช้ระบบคลัง ถือว่าพร้อมขายเสมอ — ไม่งั้นทั้งร้านขึ้น "สินค้าหมด"
    in_stock: stockEnabled ? (v.stock ?? 0) > 0 : true,
    image: imageByVariation.get(v.id) || null,
  };
}

function assembleProduct(
  row: { id: string; slug: string | null; name: string; description: string | null; image: string | null; updated_at: string; category?: { name: string } | null; brand?: { name: string } | null },
  variations: RawVariation[],
  images: { variation_id: string | null; image_url: string }[],
  stockEnabled: boolean,
): StorefrontProduct {
  const imageByVariation = new Map<string, string>();
  const productImages: string[] = [];
  for (const img of images) {
    if (img.variation_id) {
      if (!imageByVariation.has(img.variation_id)) imageByVariation.set(img.variation_id, img.image_url);
    } else {
      productImages.push(img.image_url);
    }
  }

  const publicVariations = variations.filter(v => v.is_active).map(v => toPublicVariation(v, imageByVariation, stockEnabled));
  const prices = publicVariations.map(v => v.price);

  // Product-level gallery first, then any variation-specific images (dedup).
  const gallery = [row.image, ...productImages, ...publicVariations.map(v => v.image)]
    .filter((x): x is string => !!x);

  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    description: row.description,
    category: row.category?.name ?? null,
    brand: row.brand?.name ?? null,
    images: Array.from(new Set(gallery)),
    variations: publicVariations,
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0,
    in_stock: publicVariations.some(v => v.in_stock),
    updated_at: row.updated_at,
  };
}

const PRODUCT_SELECT = `
  id, slug, name, description, image, updated_at,
  category:product_categories ( name ),
  brand:product_brands ( name )
`;

export interface CatalogFilter {
  category?: string;
  search?: string;
  limit?: number;
}

/** Public catalog — active + storefront_visible products only. */
export const getStorefrontCatalog = cache(async (
  companyId: string,
  filter: CatalogFilter = {},
  stockEnabled = false,
): Promise<StorefrontProduct[]> => {
  let query = supabaseAdmin
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('storefront_visible', true)
    .order('name', { ascending: true })
    .limit(filter.limit ?? 200);

  if (filter.search) query = query.ilike('name', `%${filter.search}%`);

  const { data: rows } = await query;
  if (!rows || rows.length === 0) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedRows = rows as any[];
  const filtered = filter.category
    ? typedRows.filter(r => r.category?.name === filter.category)
    : typedRows;
  if (filtered.length === 0) return [];

  const ids = filtered.map(r => r.id);
  const [{ data: variations }, { data: images }] = await Promise.all([
    supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, default_price, discount_price, stock, is_active')
      .eq('company_id', companyId)
      .in('product_id', ids)
      .is('deleted_at', null),
    supabaseAdmin
      .from('product_images')
      .select('product_id, variation_id, image_url, sort_order')
      .eq('company_id', companyId)
      .in('product_id', ids)
      .order('sort_order', { ascending: true }),
  ]);

  const varsByProduct = new Map<string, RawVariation[]>();
  for (const v of variations || []) {
    const list = varsByProduct.get(v.product_id) || [];
    list.push(v as RawVariation);
    varsByProduct.set(v.product_id, list);
  }
  const imgsByProduct = new Map<string, { variation_id: string | null; image_url: string }[]>();
  for (const i of images || []) {
    const list = imgsByProduct.get(i.product_id) || [];
    list.push({ variation_id: i.variation_id, image_url: i.image_url });
    imgsByProduct.set(i.product_id, list);
  }

  return filtered
    .map(r => assembleProduct(r, varsByProduct.get(r.id) || [], imgsByProduct.get(r.id) || [], stockEnabled))
    // สินค้าที่ไม่มี variation ที่ขายได้เลย ไม่ต้องโชว์ (ราคาเป็น 0 ดูเหมือนของฟรี)
    .filter(p => p.variations.length > 0);
});

/** Single product by slug (falls back to id so old links keep working). */
export const getStorefrontProduct = cache(async (
  companyId: string,
  slugOrId: string,
  stockEnabled = false,
): Promise<StorefrontProduct | null> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);

  const { data: row } = await supabaseAdmin
    .from('products')
    .select(PRODUCT_SELECT)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('storefront_visible', true)
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .maybeSingle();
  if (!row) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedRow = row as any;
  const [{ data: variations }, { data: images }] = await Promise.all([
    supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, default_price, discount_price, stock, is_active')
      .eq('company_id', companyId)
      .eq('product_id', typedRow.id)
      .is('deleted_at', null),
    supabaseAdmin
      .from('product_images')
      .select('product_id, variation_id, image_url, sort_order')
      .eq('company_id', companyId)
      .eq('product_id', typedRow.id)
      .order('sort_order', { ascending: true }),
  ]);

  const product = assembleProduct(
    typedRow,
    (variations || []) as RawVariation[],
    (images || []).map(i => ({ variation_id: i.variation_id, image_url: i.image_url })),
    stockEnabled,
  );
  return product.variations.length > 0 ? product : null;
});

/** Distinct category names that actually have visible products (for nav). */
export const getStorefrontCategories = cache(async (companyId: string): Promise<string[]> => {
  const { data } = await supabaseAdmin
    .from('products')
    .select('category:product_categories ( name )')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('storefront_visible', true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names = (data as any[] | null || []).map(r => r.category?.name).filter(Boolean) as string[];
  return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b, 'th'));
});

/** Zones + slots for the delivery-info page (AEO source of truth). */
export const getStorefrontDelivery = cache(async (companyId: string) => {
  const [{ data: zones }, { data: slots }] = await Promise.all([
    supabaseAdmin
      .from('delivery_zones')
      .select('id, name, provinces, districts, postcodes, fee_type, fee, free_over, lead_minutes, sort_order')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('delivery_slots')
      .select('id, name, start_time, end_time, days_of_week, cutoff_minutes, sort_order')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  ]);
  return { zones: zones || [], slots: slots || [] };
});
