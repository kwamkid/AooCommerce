import { apiFetch } from '@/lib/api-client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GpResolverContext {
  /** Level 1: Customer-Brand GP (customer_brand_commissions) */
  customerBrandCommissions: Array<{
    brand_id: string;
    gp_rate: number;
    gp_base_price: 'retail' | 'discounted';
  }>;
  /** Level 2: Customer Default GP (customers table) */
  customerGpRate: number | null;
  customerGpBasePrice: 'retail' | 'discounted' | null;
  /** Level 3: Global Brand GP (product_brands table) */
  globalBrandGp: Array<{
    brand_id: string;
    default_gp_rate: number | null;
    gp_base_price: 'retail' | 'discounted';
  }>;
  /** Level 4: Global Default GP (company settings) */
  globalDefaultGpRate: number;
  globalDefaultGpBasePrice: 'retail' | 'discounted';
}

export interface ProductForGp {
  brand_id: string | null;
  default_price: number;
  discount_price: number;
}

export interface GpResolution {
  gp_rate: number;
  gp_base_price: 'retail' | 'discounted';
  gp_level: 1 | 2 | 3 | 4;
  base_price: number;
  unit_price: number;
}

// ── Resolver ───────────────────────────────────────────────────────────────

function buildResult(
  gp_rate: number,
  gp_base_price: 'retail' | 'discounted',
  gp_level: 1 | 2 | 3 | 4,
  product: ProductForGp,
): GpResolution {
  const base_price =
    gp_base_price === 'discounted' && product.discount_price > 0
      ? product.discount_price
      : product.default_price;
  const unit_price = Math.round(base_price * (1 - gp_rate / 100) * 100) / 100;
  return { gp_rate, gp_base_price, gp_level, base_price, unit_price };
}

/**
 * Resolve GP% for a single product using 4-level hierarchy.
 * Most specific level wins (1 → 4).
 */
export function resolveGp(ctx: GpResolverContext, product: ProductForGp): GpResolution {
  // Level 1: Customer-Brand GP
  if (product.brand_id) {
    const match = ctx.customerBrandCommissions.find(c => c.brand_id === product.brand_id);
    if (match) {
      return buildResult(match.gp_rate, match.gp_base_price, 1, product);
    }
  }

  // Level 2: Customer Default GP
  if (ctx.customerGpRate != null) {
    return buildResult(
      ctx.customerGpRate,
      ctx.customerGpBasePrice || ctx.globalDefaultGpBasePrice,
      2,
      product,
    );
  }

  // Level 3: Global Brand GP
  if (product.brand_id) {
    const brandMatch = ctx.globalBrandGp.find(b => b.brand_id === product.brand_id);
    if (brandMatch && brandMatch.default_gp_rate != null) {
      return buildResult(brandMatch.default_gp_rate, brandMatch.gp_base_price, 3, product);
    }
  }

  // Level 4: Global Default GP
  return buildResult(ctx.globalDefaultGpRate, ctx.globalDefaultGpBasePrice, 4, product);
}

// ── Fetch helper ───────────────────────────────────────────────────────────

/**
 * Fetch all data needed to build GpResolverContext for a given customer.
 * Makes 4 parallel API calls.
 */
export async function fetchGpContext(customerId: string): Promise<GpResolverContext> {
  const [commRes, custRes, brandsRes, settingsRes] = await Promise.all([
    apiFetch(`/api/customer-brand-commissions?customer_id=${customerId}`),
    apiFetch(`/api/customers?search=${customerId}`),
    apiFetch('/api/brands'),
    apiFetch('/api/settings/features'),
  ]);

  const [commData, custData, brandsData, settingsData] = await Promise.all([
    commRes.ok ? commRes.json() : { data: [] },
    custRes.ok ? custRes.json() : { customers: [] },
    brandsRes.ok ? brandsRes.json() : { data: [] },
    settingsRes.ok ? settingsRes.json() : {},
  ]) as [Record<string, any>, Record<string, any>, Record<string, any>, Record<string, any>];

  const customer = custData.customers?.[0] || {};
  const cs = settingsData.consignment_settings || {};

  return {
    customerBrandCommissions: (commData.data || []).map((c: Record<string, unknown>) => ({
      brand_id: c.brand_id as string,
      gp_rate: c.gp_rate as number,
      gp_base_price: (c.gp_base_price as 'retail' | 'discounted') || 'retail',
    })),
    customerGpRate: customer.consignment_gp_rate ?? null,
    customerGpBasePrice: customer.consignment_gp_base_price ?? null,
    globalBrandGp: (brandsData.data || []).map((b: Record<string, unknown>) => ({
      brand_id: b.id as string,
      default_gp_rate: (b.default_gp_rate as number) ?? null,
      gp_base_price: (b.gp_base_price as 'retail' | 'discounted') || 'retail',
    })),
    globalDefaultGpRate: (cs.default_gp_rate as number) ?? 30,
    globalDefaultGpBasePrice: (cs.default_gp_base_price as 'retail' | 'discounted') || 'retail',
  };
}
