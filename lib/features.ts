// Feature flags system for business mode support
// Stored in companies.settings JSONB — no new DB tables needed

export interface FeatureFlags {
  customer_branches: boolean;
  delivery_date: { enabled: boolean; required: boolean };
  billing_cycle: boolean;
  marketplace_sync: boolean;
  pos: boolean;
  consignment: boolean;
  product_brand: boolean;
}

export type BusinessPreset = 'delivery' | 'ecommerce' | 'omnichannel';

export const PRESET_LABELS: Record<BusinessPreset, string> = {
  delivery: 'Delivery (ส่งของ)',
  ecommerce: 'E-commerce',
  omnichannel: 'Omnichannel',
};

export const PRESET_DESCRIPTIONS: Record<BusinessPreset, string> = {
  delivery: 'ส่งของขายส่ง มีสาขาลูกค้า วันส่ง วางบิล',
  ecommerce: 'ขายออนไลน์ช่องทางเดียว เชื่อม Marketplace',
  omnichannel: 'หลายช่องทาง Marketplace, POS, ตัวแทนจำหน่าย',
};

export const PRESET_DEFAULTS: Record<BusinessPreset, FeatureFlags> = {
  delivery: {
    customer_branches: true,
    delivery_date: { enabled: true, required: true },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: false,
    product_brand: false,
  },
  ecommerce: {
    customer_branches: false,
    delivery_date: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: false,
    consignment: false,
    product_brand: false,
  },
  omnichannel: {
    customer_branches: false,
    delivery_date: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: true,
    consignment: true,
    product_brand: false,
  },
};

// Default = delivery mode (backward compatible with existing companies)
export const DEFAULT_FEATURES: FeatureFlags = PRESET_DEFAULTS.delivery;
export const DEFAULT_PRESET: BusinessPreset = 'delivery';

// Parse features from company settings JSONB (handles missing/partial data)
export function parseFeatures(settings: Record<string, unknown> | null | undefined): {
  preset: BusinessPreset;
  features: FeatureFlags;
} {
  if (!settings) {
    return { preset: DEFAULT_PRESET, features: DEFAULT_FEATURES };
  }

  const preset = (settings.business_preset as BusinessPreset) || DEFAULT_PRESET;
  const stored = settings.features as Partial<FeatureFlags> | undefined;

  if (!stored) {
    return { preset, features: DEFAULT_FEATURES };
  }

  // Merge with defaults to fill any missing fields
  return {
    preset,
    features: {
      customer_branches: stored.customer_branches ?? DEFAULT_FEATURES.customer_branches,
      delivery_date: {
        enabled: (stored.delivery_date as { enabled?: boolean })?.enabled ?? DEFAULT_FEATURES.delivery_date.enabled,
        required: (stored.delivery_date as { required?: boolean })?.required ?? DEFAULT_FEATURES.delivery_date.required,
      },
      billing_cycle: stored.billing_cycle ?? DEFAULT_FEATURES.billing_cycle,
      marketplace_sync: stored.marketplace_sync ?? DEFAULT_FEATURES.marketplace_sync,
      pos: stored.pos ?? DEFAULT_FEATURES.pos,
      consignment: stored.consignment ?? DEFAULT_FEATURES.consignment,
      product_brand: stored.product_brand ?? DEFAULT_FEATURES.product_brand,
    },
  };
}
