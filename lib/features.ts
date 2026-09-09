// Feature flags system for business mode support
// Stored in companies.settings JSONB — no new DB tables needed

export interface FeatureFlags {
  delivery_date: { enabled: boolean; required: boolean };
  // พื้นที่จัดส่ง + ค่าส่ง (delivery_zones table) — resolve ค่าส่งจากที่อยู่ลูกค้า
  delivery_zone: boolean;
  // ช่วงเวลาส่ง (delivery_slots table) — ต้องเปิด delivery_date ก่อนถึงมีความหมาย
  // (เลือกช่วงเวลาโดยไม่มีวันที่ไม่ได้) — UI ล็อกปิดเมื่อ delivery_date ปิด
  // required = "บังคับกรอก" บนหน้า Feature เสริม · ค่าเก่าที่เก็บเป็น boolean
  // ยังอ่านได้ (parseFeatures แปลงให้เป็น { enabled, required:false })
  delivery_slot: { enabled: boolean; required: boolean };
  billing_cycle: boolean;
  marketplace_sync: boolean;
  pos: boolean;
  consignment: boolean;
  product_brand: boolean;
  parcel_splitting: boolean;
  supplier: boolean;
  department_store: boolean;
  // Inventory / warehouse system. Gated by package — when the active package
  // has stock_enabled=false (e.g. Free) the toggle is locked off.
  stock: boolean;
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
  omnichannel: 'ขายทุกช่องทาง Online + แคชเชียร์หน้าร้าน + ตัวแทนฝากขาย',
  omnichannel_brand: 'ทุกช่องทาง + ลูกค้าห้าง Modern Trade Statement รายเดือน',
  wholesale: 'ขายส่ง ลูกค้าห้าง Modern Trade วางบิล Statement รายเดือน',
  distribution: 'บริหารตัวแทนจำหน่าย ฝากขาย DN/Invoice จัดการ Supplier',
};

export const PRESET_DEFAULTS: Record<BusinessPreset, FeatureFlags> = {
  delivery: {
    delivery_date: { enabled: true, required: true },
    delivery_zone: true,
    delivery_slot: { enabled: true, required: false },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: false,
    product_brand: false,
    parcel_splitting: false,
    supplier: false,
    department_store: false,
    stock: true,
  },
  ecommerce: {
    delivery_date: { enabled: false, required: false },
    delivery_zone: false,
    delivery_slot: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: false,
    consignment: false,
    product_brand: false,
    parcel_splitting: false,
    supplier: false,
    department_store: false,
    stock: true,
  },
  ecommerce_brand: {
    delivery_date: { enabled: false, required: false },
    delivery_zone: false,
    delivery_slot: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: false,
    consignment: false,
    product_brand: true,
    parcel_splitting: false,
    supplier: false,
    department_store: false,
    stock: true,
  },
  omnichannel: {
    delivery_date: { enabled: false, required: false },
    delivery_zone: false,
    delivery_slot: { enabled: false, required: false },
    billing_cycle: false,
    marketplace_sync: true,
    pos: true,
    consignment: true,
    product_brand: false,
    parcel_splitting: false,
    supplier: true,
    department_store: false,
    stock: true,
  },
  omnichannel_brand: {
    delivery_date: { enabled: false, required: false },
    delivery_zone: false,
    delivery_slot: { enabled: false, required: false },
    billing_cycle: true,
    marketplace_sync: true,
    pos: true,
    consignment: true,
    product_brand: true,
    parcel_splitting: false,
    supplier: true,
    department_store: true,
    stock: true,
  },
  wholesale: {
    delivery_date: { enabled: false, required: false },
    delivery_zone: false,
    delivery_slot: { enabled: false, required: false },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: false,
    product_brand: false,
    parcel_splitting: false,
    supplier: true,
    department_store: true,
    stock: true,
  },
  distribution: {
    delivery_date: { enabled: false, required: false },
    delivery_zone: false,
    delivery_slot: { enabled: false, required: false },
    billing_cycle: true,
    marketplace_sync: false,
    pos: false,
    consignment: true,
    product_brand: false,
    parcel_splitting: false,
    supplier: true,
    department_store: false,
    stock: true,
  },
};

// Conservative all-off baseline used as the initial render state before the
// real config loads from /api/settings/features. This prevents feature-gated
// UI (e.g. delivery_date input, stock columns) from flashing visible-then-hidden
// when the user does not have that feature enabled. Features that ARE enabled
// will appear once the fetch completes — the only visible change is "nothing
// then it appears" instead of "wrong thing then it disappears".
export const DEFAULT_FEATURES: FeatureFlags = {
  delivery_date: { enabled: false, required: false },
  delivery_zone: false,
  delivery_slot: { enabled: false, required: false },
  billing_cycle: false,
  marketplace_sync: false,
  pos: false,
  consignment: false,
  product_brand: false,
  parcel_splitting: false,
  supplier: false,
  department_store: false,
  stock: false,
};
export const DEFAULT_PRESET: BusinessPreset = 'delivery';

// Detect which preset matches the given features (null if none match)
export function detectPreset(f: FeatureFlags): BusinessPreset | null {
  for (const [key, defaults] of Object.entries(PRESET_DEFAULTS) as [BusinessPreset, FeatureFlags][]) {
    const match =
      f.delivery_date.enabled === defaults.delivery_date.enabled &&
      f.delivery_date.required === defaults.delivery_date.required &&
      f.delivery_zone === defaults.delivery_zone &&
      f.delivery_slot.enabled === defaults.delivery_slot.enabled &&
      f.delivery_slot.required === defaults.delivery_slot.required &&
      f.billing_cycle === defaults.billing_cycle &&
      f.marketplace_sync === defaults.marketplace_sync &&
      f.pos === defaults.pos &&
      f.consignment === defaults.consignment &&
      f.product_brand === defaults.product_brand &&
      f.parcel_splitting === defaults.parcel_splitting &&
      f.supplier === defaults.supplier &&
      f.department_store === defaults.department_store &&
      f.stock === defaults.stock;
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

  // ค่าเก่าของ delivery_slot เก็บเป็น boolean (ก่อนมีชิป "บังคับกรอก") — ต้องอ่านได้
  // ทั้งจาก companies.settings และจาก cache ใน localStorage ไม่มี migration ที่ DB
  const rawSlot = stored.delivery_slot as unknown;

  // Merge with defaults to fill any missing fields
  const features: FeatureFlags = {
    delivery_date: {
      enabled: (stored.delivery_date as { enabled?: boolean })?.enabled ?? DEFAULT_FEATURES.delivery_date.enabled,
      required: (stored.delivery_date as { required?: boolean })?.required ?? DEFAULT_FEATURES.delivery_date.required,
    },
    delivery_zone: stored.delivery_zone ?? DEFAULT_FEATURES.delivery_zone,
    delivery_slot: typeof rawSlot === 'boolean'
      ? { enabled: rawSlot, required: false }
      : {
          enabled: (rawSlot as { enabled?: boolean } | undefined)?.enabled ?? DEFAULT_FEATURES.delivery_slot.enabled,
          required: (rawSlot as { required?: boolean } | undefined)?.required ?? DEFAULT_FEATURES.delivery_slot.required,
        },
    billing_cycle: stored.billing_cycle ?? DEFAULT_FEATURES.billing_cycle,
    marketplace_sync: stored.marketplace_sync ?? DEFAULT_FEATURES.marketplace_sync,
    pos: stored.pos ?? DEFAULT_FEATURES.pos,
    consignment: stored.consignment ?? DEFAULT_FEATURES.consignment,
    product_brand: stored.product_brand ?? DEFAULT_FEATURES.product_brand,
    parcel_splitting: stored.parcel_splitting ?? DEFAULT_FEATURES.parcel_splitting,
    supplier: stored.supplier ?? DEFAULT_FEATURES.supplier,
    department_store: stored.department_store ?? DEFAULT_FEATURES.department_store,
    stock: stored.stock ?? DEFAULT_FEATURES.stock,
  };

  // Derive preset from features — not stored separately
  const preset = detectPreset(features) ?? DEFAULT_PRESET;

  return { preset, features };
}

// ── ช่องในการ์ด "จัดส่ง" ของฟอร์มเปิดบิล ──────────────────────────────────
// วันที่ส่งของ / ช่วงเวลาส่ง เก็บเป็น { enabled, required } เหมือนกัน หน้าตั้งค่า
// จึงคุมทั้งคู่ด้วยชิปชุดเดียว — พื้นที่จัดส่งมีแค่ ไม่แสดง/แสดง (ไม่มี required)

/** โหมดของช่องในการ์ดจัดส่ง — ตรงกับชิป ไม่แสดง / แสดง / บังคับกรอก ในหน้า Feature เสริม */
export type DeliveryFieldMode = 'off' | 'optional' | 'required';

export const DELIVERY_FIELD_MODE_LABELS: Record<DeliveryFieldMode, string> = {
  off: 'ไม่แสดง',
  optional: 'แสดง',
  required: 'บังคับกรอก',
};

/** tooltip ของชิปแต่ละโหมด — ป้ายสั้นจนต้องขยายความว่ามีผลกับฟอร์มเปิดบิลยังไง */
export const DELIVERY_FIELD_MODE_HINTS: Record<DeliveryFieldMode, string> = {
  off: 'ไม่มีช่องนี้ในฟอร์มเปิดบิล',
  optional: 'มีช่องนี้ในฟอร์ม\nกรอกหรือเว้นว่างก็บันทึกบิลได้',
  required: 'มีช่องนี้ในฟอร์ม\nต้องกรอกก่อนถึงจะบันทึกบิลได้',
};

export function deliveryFieldMode(f: { enabled: boolean; required: boolean }): DeliveryFieldMode {
  if (!f.enabled) return 'off';
  return f.required ? 'required' : 'optional';
}

export function deliveryFieldFromMode(mode: DeliveryFieldMode): { enabled: boolean; required: boolean } {
  return {
    enabled: mode !== 'off',
    required: mode === 'required',
  };
}

/**
 * กติกาความสอดคล้องของช่องจัดส่ง — ใช้ทั้งหน้าตั้งค่าและ API PUT (server clamp):
 * ปิดวันส่ง ⇒ ช่วงเวลาปิดตาม · ช่วงเวลาบังคับ ⇒ วันส่งบังคับ
 * (เลือกช่วงเวลาโดยไม่มีวันที่ไม่ได้ · บังคับช่วงเวลาแต่วันที่กรอกก็ได้ = ขัดกันเอง)
 */
export function clampDeliveryFlags(f: FeatureFlags): FeatureFlags {
  if (!f.delivery_date.enabled) {
    return { ...f, delivery_slot: { enabled: false, required: false } };
  }
  if (f.delivery_slot.required && !f.delivery_date.required) {
    return { ...f, delivery_date: { ...f.delivery_date, required: true } };
  }
  return { ...f };
}
