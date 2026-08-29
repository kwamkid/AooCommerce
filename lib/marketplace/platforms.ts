// Marketplace platform registry — ที่เดียวที่รู้จัก "แต่ละ platform มีพฤติกรรมโควตายังไง"
// (client-safe: ห้าม import อะไรที่เป็น server-only — ฝั่ง UI ก็อ่านไฟล์นี้)
//
// ══════════════════════════════════════════════════════════════════════════
//  ➕ เพิ่ม marketplace ใหม่ (เช่น LINE Shopping / Shopify) ทำแค่ 3 อย่าง
// ══════════════════════════════════════════════════════════════════════════
//  1. เพิ่มชื่อลงใน QUOTA_PLATFORMS ข้างล่าง
//     → TypeScript จะ error ทันทีว่า MARKETPLACE_PLATFORMS ขาด entry (Record บังคับ)
//  2. กรอก entry ใน MARKETPLACE_PLATFORMS: ป้ายชื่อ · โควตาฟื้นยังไง · map path→scope · ระยะห่าง
//  3. ในตัว API client ของ platform นั้น ครอบ request function ด้วย 2 บรรทัด:
//        const scope = await beginMarketplaceCall('<platform>', apiPath);   // ก่อน fetch
//        reportMarketplaceError('<platform>', scope, errMsg, { httpStatus });  // ตอนเจอ error
//     (ทั้งคู่อยู่ใน lib/marketplace/quota.ts)
//
//  แค่นั้น — breaker แยก scope, throttle, banner, กระดิ่ง, ปุ่มปลดใน superadmin
//  ทำงานให้เองทั้งหมด **ห้ามไปเขียน map ป้ายชื่อ/ตารางโควตา/หน่วงเวลาซ้ำที่อื่น**
// ══════════════════════════════════════════════════════════════════════════

export const QUOTA_PLATFORMS = ['shopee', 'tiktok', 'lazada'] as const;
export type QuotaPlatform = typeof QUOTA_PLATFORMS[number];

/**
 * กลุ่ม API ที่ใช้โควตาถังเดียวกัน — ตัวที่ตายพร้อมกันจริงๆ เท่านั้นที่ควรอยู่ scope เดียวกัน
 *
 * เกณฑ์การแบ่ง = platform ลงโทษเป็นก้อนไหน ไม่ใช่หน้าจอของเราแบ่งเป็นอะไร:
 *   1. ต่อ app/key — chat ของ TikTok/Lazada เป็นคนละ app = คนละถังโควตาสนิท
 *   2. ต่อ API     — `update_stock` เต็ม ไม่ได้แปลว่า `get_order_list` เต็ม
 */
export const QUOTA_SCOPES = [
  'auth',
  'order',
  'finance',
  'fulfillment',
  'product',
  'inventory',
  'promotion',
  'chat',
] as const;
export type QuotaScope = typeof QUOTA_SCOPES[number];

/** 'all' = ทั้ง app (โดนจำกัดทั้งก้อน / path ที่ยังไม่ได้ map) — บล็อกทุก scope */
export type QuotaTarget = QuotaScope | 'all';

export const QUOTA_TARGETS: QuotaTarget[] = ['all', ...QUOTA_SCOPES];

export interface MarketplacePlatformConfig {
  /** ชื่อที่ผู้ใช้เห็น */
  label: string;
  /** ชื่อหลังบ้านของ platform — บอกผู้ใช้ว่าไปทำงานที่ไหนได้ระหว่างระบบพัก */
  sellerCenter: string;
  /**
   * โควตาฟื้นยังไงเมื่อชนลิมิต
   * - `daily-utc8` — โควตารายวัน reset เที่ยงคืน UTC+8 (Shopee) · error ที่ไม่ใช่รายวันจะพักสั้นแทน
   * - `rolling`    — rate limit กลิ้ง ฟื้นเอง พักตามนาทีที่กำหนด
   */
  quotaReset: { kind: 'daily-utc8' } | { kind: 'rolling'; minutes: number };
  /**
   * map API path → scope · ไล่จากบนลงล่าง **ตัวแรกที่ match ชนะ**
   * → เรียงตัวเฉพาะเจาะจงไว้ก่อนตัวกว้างเสมอ (`/product/update_stock` ต้องมาก่อน `/product/`)
   * path ที่ไม่ match อะไรเลย → 'all' (บล็อกกว้างไว้ก่อน) + log เตือนให้มา map เพิ่ม
   */
  scopeRules: [match: string, scope: QuotaScope][];
  /**
   * ระยะห่างขั้นต่ำระหว่าง call (ms) ต่อ scope — `default` = scope ที่เหลือทั้งหมด
   * ไม่ใส่เลย = ไม่หน่วง (พฤติกรรมเดิม) · ใส่เมื่อ platform นั้นเคยชนลิมิตจริงเท่านั้น
   */
  minGapMs?: Partial<Record<QuotaTarget | 'default', number>>;
}

export const MARKETPLACE_PLATFORMS: Record<QuotaPlatform, MarketplacePlatformConfig> = {
  shopee: {
    label: 'Shopee',
    sellerCenter: 'Shopee Seller Center',
    quotaReset: { kind: 'daily-utc8' },
    scopeRules: [
      ['/sellerchat/', 'chat'],
      ['/logistics/', 'fulfillment'],
      ['/product/update_stock', 'inventory'],
      ['/product/update_price', 'inventory'],
      ['/product/', 'product'],
      ['/media_space/', 'product'],
      ['/add_on_deal/', 'promotion'],
      ['/bundle_deal/', 'promotion'],
      ['/order/', 'order'],
      ['/payment/', 'finance'],
      ['/auth/', 'auth'],
      ['/shop/', 'auth'],
      ['/merchant/', 'auth'],
    ],
    // bulk sync ใช้ parallelLimit คุมอยู่แล้ว + ยังไม่มีหลักฐานว่าชนเพราะยิงถี่ → ไม่หน่วง
  },
  tiktok: {
    label: 'TikTok Shop',
    sellerCenter: 'TikTok Seller Center',
    quotaReset: { kind: 'rolling', minutes: 30 },
    scopeRules: [
      ['/customer_service/', 'chat'],
      ['/fulfillment/', 'fulfillment'],
      ['/product/', 'product'],
      ['/order/', 'order'],
      ['/finance/', 'finance'],
      ['/authorization/', 'auth'],
      ['/seller/', 'auth'],
    ],
  },
  lazada: {
    label: 'Lazada',
    sellerCenter: 'Lazada Seller Center',
    quotaReset: { kind: 'rolling', minutes: 30 },
    scopeRules: [
      ['/im/', 'chat'],
      ['/products', 'product'],
      ['/finance/', 'finance'],
      // path จัดส่งของ Lazada ขึ้นต้นด้วย /order/ เหมือนกันหมด — ต้องมาก่อนกฎ '/order'
      // ไม่งั้นการแพ็ค/ใบปะหน้าจะถูกนับรวมถังเดียวกับการดึงออเดอร์
      ['/order/fulfill/', 'fulfillment'],
      ['/order/package/', 'fulfillment'],
      ['/order/shipment/', 'fulfillment'],
      ['/order', 'order'],
      ['/auth/', 'auth'],
      ['/seller/', 'auth'],
    ],
    // เคยชนจริง: เปิดแชท 2 ร้านพร้อมกันยิง IM 22 call ติดกันจนโดน ApiCallLimit
    // แล้วลาก order sync ตายด้วย (fix-bug.md 2026-08-29)
    minGapMs: { chat: 350, default: 150 },
  },
};

/** ป้ายสั้นของแต่ละ scope — ใช้ในหัวข้อ banner / กระดิ่ง / superadmin monitor */
export const QUOTA_SCOPE_LABELS: Record<QuotaTarget, string> = {
  all: 'ทั้งระบบ',
  auth: 'เชื่อมต่อร้าน',
  order: 'ดึงออเดอร์',
  finance: 'รายงานการเงิน',
  fulfillment: 'จัดส่ง / ใบปะหน้า',
  product: 'ข้อมูลสินค้า',
  inventory: 'ราคา / สต็อก',
  promotion: 'โปรโมชั่น',
  chat: 'แชท',
};

/**
 * ผลกระทบที่ผู้ใช้เห็นจริงต่อ scope — **ห้ามใช้ข้อความรวมว่า "ออเดอร์เข้าช้า" กับทุก scope**
 * แชทพักแล้วขึ้นว่าออเดอร์เข้าช้า = ส่งคนไปไล่หาปัญหาผิดที่
 */
export const QUOTA_SCOPE_IMPACT: Record<QuotaTarget, { impact: string; reassure: string }> = {
  all: {
    impact: 'ออเดอร์และแชทใหม่จะเข้าระบบช้าชั่วคราว',
    reassure: 'ข้อมูลไม่หาย ถูกเก็บเข้าคิวไว้ครบ ระบบจะดึงเข้าให้อัตโนมัติ',
  },
  auth: {
    impact: 'การเชื่อมต่อร้านใหม่จะทำไม่ได้ชั่วคราว',
    reassure: 'ร้านที่เชื่อมอยู่แล้วทำงานตามปกติ',
  },
  order: {
    impact: 'ออเดอร์ใหม่จะเข้าระบบช้าชั่วคราว',
    reassure: 'ออเดอร์ไม่หาย ถูกเก็บเข้าคิวไว้ครบ ระบบจะดึงเข้าให้อัตโนมัติ',
  },
  finance: {
    impact: 'การดึงยอดเงินเข้าจริงจะพักชั่วคราว',
    reassure: 'ออเดอร์และการจัดส่งไม่กระทบ — ยอดย้อนหลังดึงตามมาได้ทีหลัง',
  },
  fulfillment: {
    impact: 'การกดจัดส่งและพิมพ์ใบปะหน้าจะทำไม่ได้ชั่วคราว',
    reassure: 'ออเดอร์ที่รอส่งยังอยู่ครบ กดส่งใหม่ได้ทันทีเมื่อระบบกลับมา',
  },
  product: {
    impact: 'การดึง/ส่งข้อมูลสินค้าจะพักชั่วคราว',
    reassure: 'สินค้าในระบบไม่กระทบ — พักเฉพาะการซิงก์กับร้าน',
  },
  inventory: {
    impact: 'การอัปเดตราคาและสต็อกขึ้นร้านจะพักชั่วคราว',
    reassure: 'สต็อกในระบบยังถูกต้อง ระบบจะส่งขึ้นร้านให้อัตโนมัติเมื่อกลับมา',
  },
  promotion: {
    impact: 'การส่งโปรโมชั่นขึ้นร้านจะพักชั่วคราว',
    reassure: 'โปรโมชั่นที่ส่งขึ้นไปแล้วยังทำงานตามปกติ',
  },
  chat: {
    impact: 'ข้อความแชทใหม่จะเข้าระบบช้าชั่วคราว',
    reassure: 'ข้อความไม่หาย ระบบจะดึงเข้าให้อัตโนมัติ',
  },
};

/** ป้ายชื่อ platform — derive จาก registry ห้ามประกาศ map ซ้ำที่อื่น */
export const QUOTA_PLATFORM_LABELS: Record<string, string> = Object.fromEntries(
  QUOTA_PLATFORMS.map(p => [p, MARKETPLACE_PLATFORMS[p].label])
);

export const QUOTA_SELLER_CENTER_LABELS: Record<string, string> = Object.fromEntries(
  QUOTA_PLATFORMS.map(p => [p, MARKETPLACE_PLATFORMS[p].sellerCenter])
);

/**
 * เดา scope จาก API path ตาม scopeRules ของ platform นั้น
 * (client-safe — quota.ts ห่ออีกชั้นเพื่อ log เตือนตอนไม่ match)
 */
export function matchScope(platform: QuotaPlatform, apiPath: string): QuotaTarget | null {
  const p = apiPath.toLowerCase();
  for (const [match, scope] of MARKETPLACE_PLATFORMS[platform].scopeRules) {
    if (p.includes(match)) return scope;
  }
  return null;
}
