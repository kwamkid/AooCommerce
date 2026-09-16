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
   * โลโก้เฉพาะหน้าร้าน — ว่าง = ใช้โลโก้บริษัท (companies.logo_url)
   * แยกกันเพราะโลโก้ที่สวยบนหน้าเว็บกับโลโก้ที่ต้องขึ้นบนบิล/ใบกำกับภาษี
   * มักไม่ใช่ไฟล์เดียวกัน (บิลต้องการเวอร์ชันขาวดำ/มีชื่อนิติบุคคลเต็ม)
   */
  logo_url: string;
  /**
   * โดเมนสาธารณะของร้าน เช่น 'https://shop.adayfresh.com'.
   * ใช้สร้าง canonical + sitemap + OG url — **ถ้าว่าง หน้าร้านจะ noindex**
   * เพราะ SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า (ลูกค้าไม่ได้เป็นเจ้าของ URL)
   */
  public_base_url: string;
  /** path prefix บนโดเมนนั้น เช่น '/shop' (ว่าง = อยู่ที่ราก) */
  public_base_path: string;
  /**
   * คลังที่หน้าร้านใช้ขาย — ว่าง = คลังหลักของบริษัท
   *
   * ⚠️ ต้องเป็น **คลังเดียวกัน** ทั้งตอนโชว์ยอดพร้อมขายและตอนจองตอน checkout
   * เดิมหน้าร้านโชว์ยอด "รวมทุกคลัง" (รวมคลังฝากขาย/ห้างที่ของอยู่ที่ร้านคนอื่นแล้ว)
   * ของ ABC ต่างกัน 592 ตัวเลือก / 4,933 ชิ้น — ลูกค้าจะสั่งของที่คลังขายจริงไม่มี
   *
   * ร้านที่ปิดระบบคลัง (`stockEnabled=false`) ไม่ต้องตั้ง — ถือว่ามีของทุกตัวเสมอ
   */
  sell_warehouse_id: string;
  /** อนุญาตให้ AI crawler (GPTBot/ClaudeBot/PerplexityBot/…) เก็บข้อมูล */
  allow_ai_crawlers: boolean;
  /**
   * เปิดปุ่ม "เข้าสู่ระบบด้วย LINE" ให้ลูกค้า — ปิดไว้เป็นค่าเริ่มต้น
   *
   * ⚠️ ไม่ผูกกับการมี LINE OA ของร้าน · ตอนนี้ LINE Login ใช้ channel กลาง
   * ของระบบตัวเดียว (LINE_LOGIN_CHANNEL_ID) ไม่ได้แยกต่อร้าน แปลว่า userId
   * ที่ได้อยู่คนละ provider กับ OA ของร้าน จึงเอาไปส่งแจ้งเตือนผ่าน OA ร้านไม่ได้
   * ใช้ได้แค่ "ยืนยันตัวตน" อย่างเดียว — ร้านต้องเปิดเองโดยรู้ข้อจำกัดนี้
   */
  line_login: boolean;
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
   *  '1:1' / '3:4' = บังคับกรอบให้เท่ากันทุกใบ ส่วนที่เกินถูกตัด (object-fit: cover)
   *  สองค่านี้ล้อกับที่ Shopee รองรับ (1:1 default / 3:4) — ใช้มาตรฐานเดียวทั้งระบบ
   *  จะได้ไม่ต้องมีรูปคนละชุดระหว่างหน้าร้านเรากับ marketplace
   *  'auto'        = ไม่บังคับกรอบ ใช้สัดส่วนของไฟล์ต้นฉบับ (การ์ดจะสูงไม่เท่ากัน)
   *
   * เคยมีตัวเลือกแยก `image_fit` (ย่อให้เห็นทั้งรูปแล้วเติมพื้นเบลอ/พื้นเรียบ) —
   * ยุบทิ้งแล้ว เพราะมันตอบโจทย์เดียวกับ 'auto' คือ "ไม่อยากให้รูปโดนตัด"
   * แต่แลกด้วยแถบเติมขอบทุกใบ ขณะที่ 'auto' + เลย์เอาต์ก่ออิฐ ได้รูปเต็มโดยไม่เสียพื้นที่
   */
  image_ratio: '1:1' | '3:4' | 'auto';
  /** ข้อความประกาศบนหัวร้าน (ว่าง = ไม่แสดง) */
  announcement: string;
  /**
   * ข้อมูลติดต่อที่แสดงท้ายหน้าร้าน — **ว่าง = ใช้ของบริษัท**
   *
   * แยกจาก `companies.*` เพราะเบอร์/อีเมลที่ให้ลูกค้าออนไลน์ติดต่อ มักไม่ใช่ตัวเดียวกับ
   * ที่จดทะเบียนไว้บนใบกำกับภาษี (เบอร์ออฟฟิศ vs เบอร์แอดมินเพจ) และที่อยู่หน้าร้าน
   * อาจเป็นหน้าร้านจริง ไม่ใช่ที่อยู่จดทะเบียน
   *
   * ⚠️ เก็บเป็น "ค่าที่ตั้งทับ" ไม่ใช่ copy ตอนเปิดร้าน — ปล่อยว่างไว้แล้วแก้ข้อมูลบริษัท
   * ทีหลัง หน้าร้านจะตามให้เอง (copy ไว้จะค้างเป็นข้อมูลเก่าโดยไม่มีใครรู้)
   */
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  // ── การแสดงสินค้า (เพิ่ม 2026-09-14) ──
  /** แสดงสินค้าที่สต็อกหมดด้วย (ขึ้นป้าย "สินค้าหมดชั่วคราว") — false = ซ่อนจากทุกหน้ารายการ · มีผลเฉพาะร้านที่เปิดระบบคลัง */
  show_out_of_stock: boolean;
  /** แสดงสินค้าที่ยังไม่มีรูปด้วย — false = ซ่อนจนกว่าจะใส่รูป (หน้าสินค้าตรง ๆ ยังเปิดได้) */
  show_without_image: boolean;
  /**
   * ลำดับสินค้าในหน้ารายการ
   *  name         = ชื่อ ก→ฮ (ค่าเดิมก่อนมีตัวเลือกนี้)
   *  best_selling = ขายดี (ยอดขาย 90 วันล่าสุดจาก order_items ไม่นับที่ยกเลิก) · ที่ไม่มียอดต่อท้ายตามชื่อ
   *  newest       = สินค้าใหม่ก่อน (products.created_at)
   *  price_asc / price_desc = ราคาต่ำสุดของสินค้า (ราคาหลังลด)
   */
  sort_by: StorefrontSort;
}

export type StorefrontSort = 'name' | 'best_selling' | 'newest' | 'price_asc' | 'price_desc';
export const STOREFRONT_SORTS: StorefrontSort[] = ['name', 'best_selling', 'newest', 'price_asc', 'price_desc'];
export const STOREFRONT_SORT_LABELS: Record<StorefrontSort, string> = {
  best_selling: 'ขายดี',
  newest: 'ใหม่ล่าสุด',
  price_asc: 'ราคาต่ำ → สูง',
  price_desc: 'ราคาสูง → ต่ำ',
  name: 'ชื่อสินค้า ก → ฮ',
};
/** จำนวนสินค้าต่อหน้าในหน้ารายการ (เจ้าของเลือก 20 · 2026-09-14) */
export const STOREFRONT_PAGE_SIZE = 20;

export const DEFAULT_STOREFRONT: StorefrontConfig = {
  enabled: false,
  display_name: '',
  tagline: '',
  logo_url: '',
  public_base_url: '',
  public_base_path: '',
  allow_ai_crawlers: true,
  line_login: false,
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
  contact_phone: '',
  contact_email: '',
  contact_address: '',
  sell_warehouse_id: '',
  show_out_of_stock: true,
  show_without_image: true,
  sort_by: 'name',
};

/**
 * กติกาชื่อลิงก์ร้าน (slug ใน URL) — **ที่เดียว** ให้หน้าตั้งค่า · slug-check · PUT ใช้ร่วมกัน
 * ไม่งั้นหน้าจอบอกว่าว่างแล้วบันทึกโดนปฏิเสธ
 *
 * a–z 0–9 และขีดกลาง (-) เท่านั้น 3–40 ตัว ห้ามขึ้น/ลงท้ายด้วยขีด · **ไม่รับจุด** —
 * จุดใน path ทำให้บางระบบมองเป็นนามสกุลไฟล์ และปนกับชื่อโดเมนตอนอ่านลิงก์
 */
export const STOREFRONT_SLUG_MIN = 3;
export const STOREFRONT_SLUG_MAX = 40;
export const STOREFRONT_SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const STOREFRONT_SLUG_RULE =
  `ใช้ได้เฉพาะตัวอักษรอังกฤษตัวเล็ก a–z ตัวเลข 0–9 และขีดกลาง (-) ยาว ${STOREFRONT_SLUG_MIN}–${STOREFRONT_SLUG_MAX} ตัว`
  + ' ห้ามใช้จุด เว้นวรรค หรือขึ้น/ลงท้ายด้วยขีด';

/**
 * ชื่อลิงก์ร้านเปลี่ยนได้ครั้งเดียวต่อกี่วัน
 *
 * ทำไมต้องล็อก: slug อยู่ใน URL ที่ส่งไปหาลูกค้าแล้ว (บรอดแคสต์ · โพสต์ · บิลออนไลน์)
 * เปลี่ยนทีนึงลิงก์เก่าตายทั้งชุด — เรายังไม่ได้ทำ redirect ของ slug เก่า
 * (ลดจาก 30 → 7 วัน 2026-09-14 พร้อมกับให้ต้องกด "แก้ไข" ก่อนถึงจะพิมพ์ทับได้)
 *
 * **ล็อกทุกกรณี ไม่ว่าร้านเปิดหรือปิดอยู่** (เจ้าของสั่ง 2026-09-14 — เดิมนับเฉพาะตอนเปิด)
 * ยกเว้นการตั้งชื่อครั้งแรกจากว่าง ซึ่งไม่ใช่การ "แก้" จึงไม่เริ่มนับ
 */
export const STOREFRONT_SLUG_LOCK_DAYS = 7;

/** เหลืออีกกี่วันถึงจะเปลี่ยนชื่อลิงก์ได้ (0 = เปลี่ยนได้เลย) */
export function storefrontSlugLockRemainingDays(changedAt: string | null): number {
  if (!changedAt) return 0;
  const elapsedMs = Date.now() - new Date(changedAt).getTime();
  const leftMs = STOREFRONT_SLUG_LOCK_DAYS * 86_400_000 - elapsedMs;
  return leftMs <= 0 ? 0 : Math.ceil(leftMs / 86_400_000);
}

export function parseStorefront(settings: Record<string, unknown> | null | undefined): StorefrontConfig {
  const stored = (settings?.storefront as Partial<StorefrontConfig> | undefined) || {};
  return {
    enabled: stored.enabled ?? DEFAULT_STOREFRONT.enabled,
    display_name: stored.display_name ?? DEFAULT_STOREFRONT.display_name,
    tagline: stored.tagline ?? DEFAULT_STOREFRONT.tagline,
    logo_url: stored.logo_url ?? DEFAULT_STOREFRONT.logo_url,
    public_base_url: (stored.public_base_url ?? DEFAULT_STOREFRONT.public_base_url).replace(/\/+$/, ''),
    contact_phone: String(stored.contact_phone ?? DEFAULT_STOREFRONT.contact_phone),
    contact_email: String(stored.contact_email ?? DEFAULT_STOREFRONT.contact_email),
    contact_address: String(stored.contact_address ?? DEFAULT_STOREFRONT.contact_address),
    public_base_path: normalizeBasePath(stored.public_base_path ?? DEFAULT_STOREFRONT.public_base_path),
    sell_warehouse_id: String(stored.sell_warehouse_id ?? DEFAULT_STOREFRONT.sell_warehouse_id),
    allow_ai_crawlers: stored.allow_ai_crawlers ?? DEFAULT_STOREFRONT.allow_ai_crawlers,
    line_login: stored.line_login ?? DEFAULT_STOREFRONT.line_login,
    primary_color: stored.primary_color ?? DEFAULT_STOREFRONT.primary_color,
    button_color: stored.button_color ?? DEFAULT_STOREFRONT.button_color,
    header_style: stored.header_style ?? DEFAULT_STOREFRONT.header_style,
    header_layout: stored.header_layout ?? DEFAULT_STOREFRONT.header_layout,
    header_behavior: stored.header_behavior ?? DEFAULT_STOREFRONT.header_behavior,
    logo_display: stored.logo_display ?? DEFAULT_STOREFRONT.logo_display,
    button_style: stored.button_style ?? DEFAULT_STOREFRONT.button_style,
    radius: stored.radius ?? DEFAULT_STOREFRONT.radius,
    layout: stored.layout ?? DEFAULT_STOREFRONT.layout,
    // ค่าเก่า '4:5' (ก่อนยุบมาตรฐานให้ตรงกับ Shopee) map เป็น '3:4' ที่ใกล้ที่สุด
    // ค่าที่ไม่รู้จักตกไป default — ไม่ปล่อยให้หลุดไปเป็น CSS var ที่ undefined
    image_ratio: normalizeRatio(stored.image_ratio),
    announcement: stored.announcement ?? DEFAULT_STOREFRONT.announcement,
    show_out_of_stock: stored.show_out_of_stock ?? DEFAULT_STOREFRONT.show_out_of_stock,
    show_without_image: stored.show_without_image ?? DEFAULT_STOREFRONT.show_without_image,
    sort_by: STOREFRONT_SORTS.includes(stored.sort_by as StorefrontSort) ? stored.sort_by as StorefrontSort : DEFAULT_STOREFRONT.sort_by,
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

/**
 * โฮสต์สาธารณะของระบบ — ลิงก์ที่ส่งออกไปกับข้อความถึงลูกค้าต้องเป็น URL เต็มเสมอ
 * (path เปล่า ๆ เปิดจากในแอป LINE/Messenger ไม่ได้) · ค่าสำรองตรงกับ `lib/chat/channel-health.ts`
 */
export const PUBLIC_APP_BASE_URL =
  (process.env.NEXT_PUBLIC_APP_URL || 'https://aoocommerce.vercel.app').replace(/\/+$/, '');

/** URL เต็มของหน้าร้าน — ร้านที่ยังไม่ตั้งโดเมนของตัวเอง `storefrontUrl()` คืน path ภายใน ต้องเติมโฮสต์ให้ */
export function storefrontAbsoluteUrl(cfg: StorefrontConfig, slug: string, path = ''): string {
  const url = storefrontUrl(cfg, slug, path);
  return url.startsWith('/') ? `${PUBLIC_APP_BASE_URL}${url}` : url;
}

/**
 * แปลง JSON-LD เป็นสตริงที่ใส่ใน `<script>` ได้อย่างปลอดภัย
 *
 * ⚠️ **`JSON.stringify` ไม่ escape `<`** — ชื่อสินค้าหรือคำอธิบายที่ร้านพิมพ์คำว่า `</script>`
 * ลงไปจะปิดแท็กก่อนกำหนด ⇒ structured data พังเงียบ ๆ + เป็นช่องให้ยัด HTML เข้าหน้า
 * ทุกที่ที่วาง JSON-LD ต้องผ่านตัวนี้ ห้ามเรียก `JSON.stringify` ตรง ๆ
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/** ลิงก์หน้าสินค้า — `slug` ของสินค้า ไม่ใช่ id (id ในลิงก์อ่านไม่รู้เรื่องและเสีย SEO) */
export function storefrontProductUrl(cfg: StorefrontConfig, shopSlug: string, productSlug: string): string {
  return storefrontAbsoluteUrl(cfg, shopSlug, `/p/${productSlug}`);
}

/**
 * ลิงก์หน้าหมวด — หน้าร้านกรองด้วย query `?cat=` (ยังไม่มี path ของตัวเอง)
 * ส่ง **slug ของหมวด** เสมอ ไม่ใช่ชื่อ: ชื่อเปลี่ยนเมื่อไหร่ ลิงก์ที่ส่งไปหาลูกค้าตาย
 * (หน้าร้านยังรับชื่อได้อยู่เพื่อลิงก์เก่า — ดู `resolveCategoryParam`)
 */
export function storefrontCategoryUrl(cfg: StorefrontConfig, shopSlug: string, categorySlug: string): string {
  return `${storefrontAbsoluteUrl(cfg, shopSlug)}?cat=${encodeURIComponent(categorySlug)}`;
}

// ต่างกันให้พอเห็น — 10px กับ 20px บนการ์ดกว้าง 250px แทบแยกไม่ออก
const RADIUS_PX: Record<StorefrontConfig['radius'], string> = {
  sharp: '0px',
  soft: '12px',
  round: '28px',
};

function normalizeRatio(v: unknown): StorefrontConfig['image_ratio'] {
  if (v === '1:1' || v === '3:4' || v === 'auto') return v;
  if (v === '4:5') return '3:4';
  return DEFAULT_STOREFRONT.image_ratio;
}

const RATIO_CSS: Record<StorefrontConfig['image_ratio'], string> = {
  '1:1': '1 / 1',
  '3:4': '3 / 4',
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
    // สีอ่อนมาก เช่น ขาว ใช้เป็นตัวอักษรบนพื้นขาวไม่ได้ → ตกไปใช้สีตัวอักษรปกติของร้าน
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
  /**
   * ร้านตั้งตัวนี้เป็น "ตัวตั้งต้น" ไว้ (`product_variations.is_default`) — มีได้ตัวเดียวต่อสินค้า
   * ใส่ key เฉพาะตัวที่เป็น · ตัวที่หน้าสินค้าเลือกให้จริงอยู่ที่ `StorefrontProduct.default_variation_id`
   * (ตัวตั้งต้นที่ของหมดจะไม่ถูกเลือก)
   */
  is_default?: true;
  /**
   * สินค้าชุดเท่านั้น — ค่าที่เลือกในแต่ละช่อง เช่น `{ โครงรถเข็น: 'ดำ', ผ้าเบาะ: 'แดง' }`
   * (key = ชื่อช่องใน `option_groups`)
   */
  options?: Record<string, string>;
}

/**
 * รูปจิ๋วของ "ตัวเลือกแรก" บนการ์ดสินค้า (เช่น สีแดง/สีดำ)
 *
 * ⚠️ ไม่มีตารางใหม่ — มาจาก **รูปต่อตัวเลือกที่มีอยู่แล้ว** (`product_images.variation_id`
 * ที่ฟอร์มสินค้าอัปได้ 1 รูปต่อแถวตัวเลือก) จับกลุ่มตามค่าของตัวเลือกแรก
 * แล้วหยิบรูปของ variation ตัวแรกในกลุ่มที่มีรูปของตัวเอง
 */
export interface StorefrontSwatch {
  /** ค่าของตัวเลือก เช่น 'แดง' */
  value: string;
  image: string;
  /** variation ที่เป็นเจ้าของรูปนี้ (ใช้เลือกให้ตรงตัวตอนกดที่การ์ด) */
  variation_id: string;
}

/** ช่องให้เลือกของสินค้าชุด (เช่น "ผ้าเบาะ" 9 สี) — ค่าเรียงตามลำดับตัวเลือกในช่อง */
export interface StorefrontOptionGroup {
  name: string;
  values: string[];
}

/**
 * หน้าสินค้ายิง event นี้ตอนลูกค้าเลือกตัวเลือก → รูปหลักเปลี่ยนตาม
 * (detail = `{ image, label }` · image null = กลับไปรูปแรกของสินค้า)
 */
export const SF_VARIATION_PICK_EVENT = 'sf:variation-pick';

/** สิ่งที่ส่งไปกับ SF_VARIATION_PICK_EVENT ตอนลูกค้าเลือกตัวเลือกบนหน้าสินค้า */
export interface StorefrontVariationPick {
  image: string | null;
  label: string | null;
  price: number;
  /** ราคาก่อนลดของตัวเลือกนี้ (null = ไม่ได้ลด) */
  compare_at: number | null;
}

export interface StorefrontProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** ชื่อหมวดไว้ **แสดง** */
  category: string | null;
  /** slug ของหมวดไว้ **ทำลิงก์** (`?cat=`) — คนละค่ากับที่แสดง อย่าสลับกัน */
  category_slug: string | null;
  brand: string | null;
  images: string[];
  variations: StorefrontVariation[];
  price_min: number;
  price_max: number;
  in_stock: boolean;
  updated_at: string;
  /**
   * ตัวเลือกที่หน้าสินค้าเลือกให้ตอนเปิด + ตัวที่ขึ้นก่อนในแถว swatch
   * กติกา 3 ชั้น (`pickDefaultVariation()` ใน storefront-server.ts — ที่เดียวของทั้งระบบ):
   * ร้านตั้ง `is_default` ไว้และมีของ → ขายดีที่สุดใน 90 วันในบรรดาตัวที่มีของ → ตัวแรกที่มีของ
   * ไม่มี key นี้ = ของหมดทั้งสินค้า (หรือเป็นสินค้าชุดซึ่งเลือกทีละช่องเอง)
   */
  default_variation_id?: string;
  /** สินค้าชุด (เลือกหนึ่งตัวจากแต่ละช่อง) — ไม่มี key นี้ = สินค้าปกติ */
  is_composite?: true;
  /**
   * สินค้าชุดเท่านั้น — ช่องที่ลูกค้าต้องเลือก ตามลำดับช่อง · ช่องที่มีค่าเดียวไม่อยู่ในนี้
   * (ไม่มีอะไรให้เลือก) · ไม่มี key นี้ = ใช้รายการตัวเลือกแบบแบน
   */
  option_groups?: StorefrontOptionGroup[];
  /**
   * ตัวเลือกแรกพร้อมรูปจิ๋ว — การ์ดในหน้ารายการเอาไปทำแถว swatch (กดแล้วรูปใหญ่สลับ)
   * ไม่มี key นี้ = ไม่แสดงแถว swatch (สินค้าชิ้นเดียว · ไม่มี attributes · ไม่มีรูปต่อตัวเลือก
   * · สินค้าชุดซึ่งมี `option_groups` ของตัวเองอยู่แล้ว)
   */
  swatches?: { name: string; items: StorefrontSwatch[] };
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
  return `฿${storePriceDigits(n)}`;
}

/**
 * ตัวเลขราคาเปล่า ๆ ไม่มีสัญลักษณ์ — ใช้ตอนเขียนเป็น**ประโยค** ("ราคา 891 บาท")
 * ⚠️ อย่าใช้ `formatStorePrice` ในประโยคที่ลงท้ายด้วย "บาท" จะได้ "฿891 บาท" ซ้ำซ้อน
 */
export function storePriceDigits(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
