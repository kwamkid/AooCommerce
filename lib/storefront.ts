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
  /** แถบหัวร้าน: ขาว / สีแบรนด์ / เข้ม */
  header_style: 'light' | 'brand' | 'dark';
  radius: 'sharp' | 'soft' | 'round';
  layout: 'grid' | 'editorial';
  /** สัดส่วนกรอบรูปสินค้า — เป็นการ crop ตอนแสดงผล ไม่แตะไฟล์รูปจริง */
  image_ratio: '1:1' | '4:5';
  /**
   * รูปที่สัดส่วนไม่ตรงกรอบจะเอาอย่างไร
   *  cover   = ขยายเต็มกรอบแล้วตัดส่วนเกิน (รูปสม่ำเสมอ แต่เสี่ยงตัดของสำคัญ)
   *  contain = ย่อให้เห็นทั้งรูป เติมพื้นหลังเบลอจากรูปเดียวกัน (ไม่ตัดอะไรเลย)
   */
  image_fit: 'cover' | 'contain';
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
  radius: 'soft',
  layout: 'grid',
  image_ratio: '1:1',
  image_fit: 'cover',
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
    radius: stored.radius ?? DEFAULT_STOREFRONT.radius,
    layout: stored.layout ?? DEFAULT_STOREFRONT.layout,
    image_ratio: stored.image_ratio ?? DEFAULT_STOREFRONT.image_ratio,
    image_fit: stored.image_fit ?? DEFAULT_STOREFRONT.image_fit,
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

const RADIUS_PX: Record<StorefrontConfig['radius'], string> = {
  sharp: '0px',
  soft: '10px',
  round: '20px',
};

const RATIO_CSS: Record<StorefrontConfig['image_ratio'], string> = {
  '1:1': '1 / 1',
  '4:5': '4 / 5',
};

/** CSS custom properties injected on the storefront root — theme in one place. */
export function storefrontCssVars(cfg: StorefrontConfig): Record<string, string> {
  const button = cfg.button_color || cfg.primary_color;
  // แถบหัวร้าน — 'light' ปล่อยให้ใช้พื้นหลังปกติ (ค่า empty = ไม่ override)
  const header =
    cfg.header_style === 'brand' ? { bg: cfg.primary_color, fg: readableTextColor(cfg.primary_color) }
    : cfg.header_style === 'dark' ? { bg: '#111827', fg: '#f9fafb' }
    : null;

  return {
    '--sf-primary': cfg.primary_color,
    '--sf-primary-contrast': readableTextColor(cfg.primary_color),
    '--sf-cta': button,
    '--sf-cta-contrast': readableTextColor(button),
    '--sf-radius': RADIUS_PX[cfg.radius],
    '--sf-img-ratio': RATIO_CSS[cfg.image_ratio],
    '--sf-img-fit': cfg.image_fit,
    ...(header ? { '--sf-header-bg': header.bg, '--sf-header-fg': header.fg } : {}),
  };
}

/** ขาว/ดำ ตัวไหนอ่านง่ายกว่าบนสีพื้นที่ให้มา (WCAG relative luminance) */
export function readableTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const int = parseInt(m[1], 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map(v => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#111827' : '#ffffff';
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
