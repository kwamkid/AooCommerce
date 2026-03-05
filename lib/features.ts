// Feature flags system for business mode support
// Stored in companies.settings JSONB — no new DB tables needed

export interface FeatureFlags {
  delivery_date: { enabled: boolean; required: boolean };
  billing_cycle: boolean;
  marketplace_sync: boolean;
  pos: boolean;
  consignment: boolean;
  product_brand: boolean;
  parcel_splitting: boolean;
  supplier: boolean;
  department_store: boolean;
}

export type BusinessPreset = 'delivery' | 'ecommerce' | 'ecommerce_brand' | 'omnichannel' | 'omnichannel_brand' | 'wholesale' | 'distribution';

export const PRESET_LABELS: Record<BusinessPreset, string> = {
  delivery: 'Delivery',
  ecommerce: 'E-commerce',
  ecommerce_brand: 'E-commerce + Brand',
  omnichannel: 'Omnichannel',
  omnichannel_brand: 'Omnichannel + Department Store',
  wholesale: 'ขายส่ง / ห้าง',
  distribution: 'ตัวแทนจำหน่าย',
};

export const PRESET_DESCRIPTIONS: Record<BusinessPreset, string> = {
  delivery: 'ส่งของขายส่ง มีสาขาลูกค้า กำหนดวันส่ง วางบิลเครดิต',
  ecommerce: 'ขายออนไลน์ผ่าน Shopee, Lazada, TikTok Shop',
  ecommerce_brand: 'ขายออนไลน์หลาย Marketplace จัดกลุ่มสินค้าตามแบรนด์',
  omnichannel: 'ขายทุกช่องทาง Online + POS หน้าร้าน + ตัวแทนฝากขาย',
  omnichannel_brand: 'ทุกช่องทาง + ลูกค้าห้าง Modern Trade Statement รายเดือน',
  wholesale: 'ขายส่ง ลูกค้าห้าง Modern Trade วางบิล Statement รายเดือน',
  distribution: 'บริหารตัวแทนจำหน่าย ฝากขาย DN/Invoice จัดการ Supplier',
};

export const PRESET_DEFAULTS: Record<BusinessPreset, FeatureFlags> = {
  delivery: {
    delivery_date: { enabled: true, required: true },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: false,
    product_brand: false,
    parcel_splitting: false,
    supplier: false,
    department_store: false,
  },
  ecommerce: {
    delivery_date: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: false,
    consignment: false,
    product_brand: false,
    parcel_splitting: false,
    supplier: false,
    department_store: false,
  },
  ecommerce_brand: {
    delivery_date: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: false,
    consignment: false,
    product_brand: true,
    parcel_splitting: false,
    supplier: false,
    department_store: false,
  },
  omnichannel: {
    delivery_date: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: true,
    consignment: true,
    product_brand: false,
    parcel_splitting: false,
    supplier: true,
    department_store: false,
  },
  omnichannel_brand: {
    delivery_date: { enabled: false, required: false },
    billing_cycle: true,
    marketplace_sync: true,
    pos: true,
    consignment: true,
    product_brand: true,
    parcel_splitting: false,
    supplier: true,
    department_store: true,
  },
  wholesale: {
    delivery_date: { enabled: false, required: false },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: false,
    product_brand: false,
    parcel_splitting: false,
    supplier: true,
    department_store: true,
  },
  distribution: {
    delivery_date: { enabled: false, required: false },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: true,
    product_brand: false,
    parcel_splitting: false,
    supplier: true,
    department_store: false,
  },
};

// Default = delivery mode (backward compatible with existing companies)
export const DEFAULT_FEATURES: FeatureFlags = PRESET_DEFAULTS.delivery;
export const DEFAULT_PRESET: BusinessPreset = 'delivery';

// Detect which preset matches the given features (null if none match)
export function detectPreset(f: FeatureFlags): BusinessPreset | null {
  for (const [key, defaults] of Object.entries(PRESET_DEFAULTS) as [BusinessPreset, FeatureFlags][]) {
    const match =
      f.delivery_date.enabled === defaults.delivery_date.enabled &&
      f.delivery_date.required === defaults.delivery_date.required &&
      f.billing_cycle === defaults.billing_cycle &&
      f.marketplace_sync === defaults.marketplace_sync &&
      f.pos === defaults.pos &&
      f.consignment === defaults.consignment &&
      f.product_brand === defaults.product_brand &&
      f.parcel_splitting === defaults.parcel_splitting &&
      f.supplier === defaults.supplier &&
      f.department_store === defaults.department_store;
    if (match) return key;
  }
  return null;
}

// Parse features from company settings JSONB (handles missing/partial data)
export function parseFeatures(settings: Record<string, unknown> | null | undefined): {
  preset: BusinessPreset;
  features: FeatureFlags;
} {
  if (!settings) {
    return { preset: DEFAULT_PRESET, features: DEFAULT_FEATURES };
  }

  const stored = settings.features as Partial<FeatureFlags> | undefined;

  if (!stored) {
    return { preset: DEFAULT_PRESET, features: DEFAULT_FEATURES };
  }

  // Merge with defaults to fill any missing fields
  const features: FeatureFlags = {
    delivery_date: {
      enabled: (stored.delivery_date as { enabled?: boolean })?.enabled ?? DEFAULT_FEATURES.delivery_date.enabled,
      required: (stored.delivery_date as { required?: boolean })?.required ?? DEFAULT_FEATURES.delivery_date.required,
    },
    billing_cycle: stored.billing_cycle ?? DEFAULT_FEATURES.billing_cycle,
    marketplace_sync: stored.marketplace_sync ?? DEFAULT_FEATURES.marketplace_sync,
    pos: stored.pos ?? DEFAULT_FEATURES.pos,
    consignment: stored.consignment ?? DEFAULT_FEATURES.consignment,
    product_brand: stored.product_brand ?? DEFAULT_FEATURES.product_brand,
    parcel_splitting: stored.parcel_splitting ?? DEFAULT_FEATURES.parcel_splitting,
    supplier: stored.supplier ?? DEFAULT_FEATURES.supplier,
    department_store: stored.department_store ?? DEFAULT_FEATURES.department_store,
  };

  // Derive preset from features — not stored separately
  const preset = detectPreset(features) ?? DEFAULT_PRESET;

  return { preset, features };
}
