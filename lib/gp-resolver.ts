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
 * Fetch customer + shipping addresses + GP context in ONE RPC call.
 * Returns everything needed when a customer is selected in order forms.
 */
export interface CustomerOrderContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customer: Record<string, any>;
  shippingAddresses: { id: string; address_name: string; contact_person: string; phone: string; address_line1: string; district: string; amphoe: string; province: string; postal_code: string; delivery_notes: string; is_default: boolean }[];
  gpContext: GpResolverContext;
}

export async function fetchCustomerOrderContext(customerId: string): Promise<CustomerOrderContext> {
  const res = await apiFetch(`/api/customers/order-context?customer_id=${customerId}`);
  if (!res.ok) throw new Error('Failed to fetch customer context');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();

  const customer = data.customer || {};
  const cs = data.consignment_settings || {};

  return {
    customer,
    shippingAddresses: data.shipping_addresses || [],
    gpContext: {
      customerBrandCommissions: (data.brand_commissions || []).map((c: Record<string, unknown>) => ({
        brand_id: c.brand_id as string,
        gp_rate: c.gp_rate as number,
        gp_base_price: (c.gp_base_price as 'retail' | 'discounted') || 'retail',
      })),
      customerGpRate: customer.consignment_gp_rate ?? null,
      customerGpBasePrice: customer.consignment_gp_base_price ?? null,
      globalBrandGp: (data.brand_gp_overrides || []).map((b: Record<string, unknown>) => ({
        brand_id: b.brand_id as string,
        default_gp_rate: (b.default_gp_rate ?? b.gp_rate) as number ?? null,
        gp_base_price: (b.gp_base_price as 'retail' | 'discounted') || 'retail',
      })),
      globalDefaultGpRate: (cs.default_gp_rate as number) ?? 30,
      globalDefaultGpBasePrice: (cs.default_gp_base_price as 'retail' | 'discounted') || 'retail',
    },
  };
}

/**
 * Legacy wrapper — fetches only GP context (for consignment/department report pages).
 * Uses the same RPC but discards shipping addresses.
 */
export async function fetchGpContext(
  customerId: string,
  customerData?: { consignment_gp_rate?: number | null; consignment_gp_base_price?: string | null },
): Promise<GpResolverContext> {
  // If customerData provided, still need brand commissions + global brands
  // Use the full RPC anyway — it's just 1 call
  const ctx = await fetchCustomerOrderContext(customerId);
  // Override with pre-supplied customer data if provided
  if (customerData) {
    ctx.gpContext.customerGpRate = customerData.consignment_gp_rate ?? null;
    ctx.gpContext.customerGpBasePrice = (customerData.consignment_gp_base_price as 'retail' | 'discounted') ?? null;
  }
  return ctx.gpContext;
}
