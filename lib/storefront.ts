// Storefront config + theming — client-safe (no supabase import).
//
// One rendering engine, two shells (see memory: storefront-architecture):
//   1. standalone  — /store/<slug>/… with our own chrome. SEO/AEO primary surface.
//   2. embedded    — same content returned as raw HTML for a WordPress plugin.
//
// Config lives in companies.settings.storefront (JSONB) — no dedicated table,
// same approach as feature flags.

export interface StorefrontConfig {
  /** เปิดหน้าร้านออนไลน์ */
  enabled: boolean;
  /** ชื่อร้านที่แสดง (ว่าง = ใช้ชื่อบริษัท) */
  display_name: string;
  /** คำโปรย ใต้ชื่อร้าน + ใช้เป็น meta description ตั้งต้น */
  tagline: string;
  /**
   * โดเมนสาธารณะของร้าน เช่น 'https://shop.adayfresh.com'.
   * ใช้สร้าง canonical + sitemap + OG url — **ถ้าว่าง หน้าร้านจะ noindex**
   * เพราะ SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า (ลูกค้าไม่ได้เป็นเจ้าของ URL)
   */
  public_base_url: string;
  /** path prefix บนโดเมนนั้น เช่น '/shop' (ว่าง = อยู่ที่ราก) */
  public_base_path: string;
  /** อนุญาตให้ AI crawler (GPTBot/ClaudeBot/PerplexityBot/…) เก็บข้อมูล */
  allow_ai_crawlers: boolean;
  // ── theme tokens ──
  /** สีแบรนด์ — ลิงก์ ราคา ไฮไลต์ */
  primary_color: string;
  /** สีปุ่มสั่งซื้อ — ว่าง = ใช้สีแบรนด์ (ร้านส่วนใหญ่ไม่ต้องแยก) */
  button_color: string;
  /** สีแถบหัวร้าน: ขาว / สีแบรนด์ / เข้ม */
  header_style: 'light' | 'brand' | 'dark';
  /**
   * การจัดวางในแถบหัวร้าน
   *  left    = โลโก้ซ้าย เมนูต่อท้าย ไอคอนขวา — บรรทัดเดียว ประหยัดที่สุด
   *  stacked = โลโก้ซ้ายบรรทัดบน เมนูบรรทัดล่าง — เมนูเยอะแล้วไม่เบียด
   *  center  = โลโก้กลาง เมนูบรรทัดล่างจัดกลาง — โลโก้เด่น
   */
  header_layout: 'left' | 'stacked' | 'center';
  /**
   * หัวร้านทำอะไรตอนลูกค้าเลื่อนหน้า
   *  sticky    = ติดขอบบนตลอด
   *  auto_hide = เลื่อนลงหลบขึ้นไป เลื่อนขึ้นโผล่กลับ (Headroom / Quick Return)
   *  static    = ไม่ติด เลื่อนหายไปกับหน้า
   */
  header_behavior: 'sticky' | 'auto_hide' | 'static';
  /**
   * แสดงอะไรตรงหัวร้าน — ร้านที่โลโก้มีชื่อร้านอยู่ในรูปแล้วจะซ้ำถ้าโชว์ทั้งคู่
   *  logo_name = โลโก้ + ชื่อร้าน (ค่าเริ่มต้น)
   *  logo_only = โลโก้อย่างเดียว (ชื่อยังอยู่ใน alt + JSON-LD จึงไม่เสีย SEO)
   *  name_only = ชื่อร้านอย่างเดียว
   */
  logo_display: 'logo_name' | 'logo_only' | 'name_only';
  /**
   * สไตล์ปุ่มสั่งซื้อ — สีที่เลือกใช้ต่างกันตามสไตล์
   *  solid   = พื้นทึบสีปุ่ม ตัวอักษรสีตัดกัน
   *  outline = พื้นโปร่ง เส้นขอบ+ตัวอักษรสีปุ่ม
   *  soft    = พื้นสีปุ่มอ่อน ๆ ไม่มีเส้นขอบ
   */
  button_style: 'solid' | 'outline' | 'soft';
  radius: 'sharp' | 'soft' | 'round';
  /**
   * การจัดวางสินค้า
   *  grid      = ตารางปกติ ทุกการ์ดสูงเท่ากันในแถว
   *  editorial = การ์ดใหญ่ ลงน้อยต่อแถว
   *  masonry   = ก่ออิฐ ไม่มีช่องว่างใต้การ์ดที่เตี้ยกว่า
   */
  layout: 'grid' | 'editorial' | 'masonry';
  /**
   * สัดส่วนกรอบรูปสินค้า — เป็นการ crop ตอนแสดงผล ไม่แตะไฟล์รูปจริง
   *  '1:1' / '4:5' = บังคับกรอบให้เท่ากันทุกใบ ส่วนที่เกินถูกตัด (object-fit: cover)
   *  'auto'        = ไม่บังคับกรอบ ใช้สัดส่วนของไฟล์ต้นฉบับ (การ์ดจะสูงไม่เท่ากัน)
   *
   * เคยมีตัวเลือกแยก `image_fit` (ย่อให้เห็นทั้งรูปแล้วเติมพื้นเบลอ/พื้นเรียบ) —
   * ยุบทิ้งแล้ว เพราะมันตอบโจทย์เดียวกับ 'auto' คือ "ไม่อยากให้รูปโดนตัด"
   * แต่แลกด้วยแถบเติมขอบทุกใบ ขณะที่ 'auto' + เลย์เอาต์ก่ออิฐ ได้รูปเต็มโดยไม่เสียพื้นที่
   */
  image_ratio: '1:1' | '4:5' | 'auto';
  /** ข้อความประกาศบนหัวร้าน (ว่าง = ไม่แสดง) */
  announcement: string;
}

export const DEFAULT_STOREFRONT: StorefrontConfig = {
  enabled: false,
  display_name: '',
  tagline: '',
  public_base_url: '',
  public_base_path: '',
  allow_ai_crawlers: true,
  primary_color: '#F4511E',
  button_color: '',
  header_style: 'light',
  header_layout: 'stacked',
  header_behavior: 'auto_hide',
  logo_display: 'logo_name',
  button_style: 'solid',
  radius: 'soft',
  layout: 'grid',
  image_ratio: '1:1',
  announcement: '',
};

export function parseStorefront(settings: Record<string, unknown> | null | undefined): StorefrontConfig {
  const stored = (settings?.storefront as Partial<StorefrontConfig> | undefined) || {};
  return {
    enabled: stored.enabled ?? DEFAULT_STOREFRONT.enabled,
    display_name: stored.display_name ?? DEFAULT_STOREFRONT.display_name,
    tagline: stored.tagline ?? DEFAULT_STOREFRONT.tagline,
    public_base_url: (stored.public_base_url ?? DEFAULT_STOREFRONT.public_base_url).replace(/\/+$/, ''),
    public_base_path: normalizeBasePath(stored.public_base_path ?? DEFAULT_STOREFRONT.public_base_path),
    allow_ai_crawlers: stored.allow_ai_crawlers ?? DEFAULT_STOREFRONT.allow_ai_crawlers,
    primary_color: stored.primary_color ?? DEFAULT_STOREFRONT.primary_color,
    button_color: stored.button_color ?? DEFAULT_STOREFRONT.button_color,
    header_style: stored.header_style ?? DEFAULT_STOREFRONT.header_style,
    header_layout: stored.header_layout ?? DEFAULT_STOREFRONT.header_layout,
    header_behavior: stored.header_behavior ?? DEFAULT_STOREFRONT.header_behavior,
    logo_display: stored.logo_display ?? DEFAULT_STOREFRONT.logo_display,
    button_style: stored.button_style ?? DEFAULT_STOREFRONT.button_style,
    radius: stored.radius ?? DEFAULT_STOREFRONT.radius,
    layout: stored.layout ?? DEFAULT_STOREFRONT.layout,
    image_ratio: stored.image_ratio ?? DEFAULT_STOREFRONT.image_ratio,
    announcement: stored.announcement ?? DEFAULT_STOREFRONT.announcement,
  };
}

function normalizeBasePath(p: string): string {
  const trimmed = (p || '').trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/**
 * Public URL for a storefront path.
 * With a configured domain → the customer's own domain (what gets indexed).
 * Without one → the internal /store/<slug> path (which we mark noindex).
 */
export function storefrontUrl(cfg: StorefrontConfig, slug: string, path = ''): string {
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  if (cfg.public_base_url) return `${cfg.public_base_url}${cfg.public_base_path}${suffix}`;
  return `/store/${slug}${suffix}`;
}

/** Internal Next route — always the /store/<slug> tree regardless of domain. */
export function storefrontHref(slug: string, path = ''): string {
  const suffix = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `/store/${slug}${suffix}`;
}

// ต่างกันให้พอเห็น — 10px กับ 20px บนการ์ดกว้าง 250px แทบแยกไม่ออก
const RADIUS_PX: Record<StorefrontConfig['radius'], string> = {
  sharp: '0px',
  soft: '12px',
  round: '28px',
};

const RATIO_CSS: Record<StorefrontConfig['image_ratio'], string> = {
  '1:1': '1 / 1',
  '4:5': '4 / 5',
  auto: 'auto',
};

/** CSS custom properties injected on the storefront root — theme in one place. */
export function storefrontCssVars(cfg: StorefrontConfig): Record<string, string> {
  const button = cfg.button_color || cfg.primary_color;
  // แถบหัวร้าน — 'light' ปล่อยให้ใช้พื้นหลังปกติ (ค่า empty = ไม่ override)
  const header =
    cfg.header_style === 'brand' ? { bg: cfg.primary_color, fg: readableTextColor(cfg.primary_color) }
    : cfg.header_style === 'dark' ? { bg: '#111827', fg: '#f9fafb' }
    : { bg: 'var(--sf-bg)', fg: 'var(--sf-text)' };

  return {
    '--sf-primary': cfg.primary_color,
    '--sf-primary-contrast': readableTextColor(cfg.primary_color),
    '--sf-cta': button,
    '--sf-cta-contrast': readableTextColor(button),
    // สีปุ่มเมื่อใช้เป็น "หมึก" บนพื้นหน้าเว็บ (ปุ่มแบบเส้นขอบ/พื้นอ่อน)
    // สีอ่อนมาก เช่น ขาว ใช้เป็นตัวอักษรบนพื้นขาวไม่ได้ → ตกไปใช้สีตัวอักษรปกติ
    // ซึ่งเป็น var จึงสลับตาม dark mode ให้เองด้วย
    '--sf-cta-ink': relativeLuminance(button) > 0.62 ? 'var(--sf-text)' : button,
    '--sf-radius': RADIUS_PX[cfg.radius],
    '--sf-img-ratio': RATIO_CSS[cfg.image_ratio],
    '--sf-header-bg': header.bg,
    '--sf-header-fg': header.fg,
  };
}

/**
 * คลาสทั้งหมดบน .sf-root — ทุกตัวเลือกธีมต้องออกมาเป็น "คลาส + CSS variable"
 * เท่านั้น ห้ามให้ตัวเลือกไหนเปลี่ยนโครง HTML
 *
 * เหตุผล: หน้าตั้งค่าใช้ iframe ของหน้าร้านจริงเป็นพรีวิว แล้วยิงค่าร่างเข้าไป
 * ทาง postMessage — ถ้าตัวเลือกไหนต้อง render markup ใหม่ พรีวิวจะอัปเดตไม่ได้
 * และเราจะกลับไปวาดพรีวิวปลอมซึ่งเพี้ยนจากของจริงทุกครั้งที่แก้อะไรสักอย่าง
 *
 * (logo_display ไม่อยู่ในนี้ เพราะ StoreHeader ตัดสินใจจาก cfg ตอน render อยู่แล้ว
 * และมันต้องรู้ด้วยว่าร้านมีไฟล์โลโก้จริงไหม ซึ่งเป็นข้อมูล ไม่ใช่ธีม)
 */
export function storefrontRootClasses(cfg: StorefrontConfig): string[] {
  return [
    'sf-root',
    `sf-head-${cfg.header_layout}`,
    cfg.header_behavior === 'static' ? 'sf-header-loose' : '',
    cfg.layout === 'editorial' ? 'sf-layout-editorial' : cfg.layout === 'masonry' ? 'sf-layout-masonry' : '',
    cfg.image_ratio === 'auto' ? 'sf-ratio-auto' : '',
    cfg.button_style === 'outline' ? 'sf-btn-outline' : cfg.button_style === 'soft' ? 'sf-btn-soft' : '',
  ].filter(Boolean) as string[];
}

/** WCAG relative luminance ของสี #RRGGBB (0 = ดำสนิท, 1 = ขาวสนิท) */
export function relativeLuminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const int = parseInt(m[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** ขาว/ดำ ตัวไหนอ่านง่ายกว่าบนสีพื้นที่ให้มา */
export function readableTextColor(hex: string): string {
  if (!/^#?([0-9a-f]{6})$/i.test(hex.trim())) return '#ffffff';
  return relativeLuminance(hex) > 0.45 ? '#111827' : '#ffffff';
}

// ── Public product shapes (shared by pages + future embed API) ──

export interface StorefrontVariation {
  id: string;
  label: string | null;
  sku: string | null;
  price: number;          // ราคาที่ขายจริง (discount_price ถ้ามี ไม่งั้น default_price)
  compare_at: number | null;  // ราคาก่อนลด (null = ไม่ได้ลด)
  in_stock: boolean;
  image: string | null;
}

export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
  images: string[];
  variations: StorefrontVariation[];
  price_min: number;
  price_max: number;
  in_stock: boolean;
  updated_at: string;
}

/** ราคาที่ขายจริง — discount_price > 0 ถือว่ามีส่วนลด (กฎเดิมทั้งระบบ) */
export function effectivePrice(defaultPrice: number, discountPrice: number | null): {
  price: number;
  compare_at: number | null;
} {
  const d = Number(discountPrice) || 0;
  const base = Number(defaultPrice) || 0;
  if (d > 0 && d < base) return { price: d, compare_at: base };
  return { price: base, compare_at: null };
}

export function formatStorePrice(n: number): string {
  return `฿${n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
