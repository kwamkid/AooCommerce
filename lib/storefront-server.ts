// Storefront data access — server only (service role, bypasses RLS).
//
// ⚠️ Every query MUST filter company_id and MUST only select fields that are
// safe to expose publicly. Never return cost_price, internal notes, stock
// numbers, supplier data, or anything not needed to render the shop.
//
// Results are wrapped in React cache() so generateMetadata + the page body
// share one fetch per request (same pattern as /bills/[id]).
import { cache } from 'react';
import { parseLineLogin } from '@/lib/line-login';
import { parseGiftCard, type GiftCardSettings } from '@/lib/gift-card';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  getCompositeAvailability, getCompositePartsMap, getComboFallbackImages, type CompositePart,
} from '@/lib/composite';
import type { CompositeSlot } from '@/lib/composite-shared';
import {
  parseStorefront, effectivePrice,
  type StorefrontConfig, type StorefrontProduct, type StorefrontVariation, type StorefrontOptionGroup,
} from '@/lib/storefront';
import { parseFeatures, type FeatureFlags } from '@/lib/features';

export interface StorefrontLineOa {
  /** ชื่อ OA ที่แสดงกับลูกค้า */
  name: string;
  /** ลิงก์เพิ่มเพื่อน — https://line.me/R/ti/p/@xxxx */
  add_friend_url: string;
  picture_url: string | null;
}

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
  /** LINE OA ของร้าน — ใช้ทำลิงก์เพิ่มเพื่อน (คนละเรื่องกับปุ่มเข้าสู่ระบบ) */
  line_oa: StorefrontLineOa | null;
  /** LINE Login channel ของร้าน — ว่าง = ยังไม่ได้ตั้งค่า */
  line_login_channel_id: string;
  /** บริการการ์ดอวยพร — ตั้งที่ระดับร้าน ใช้ได้ทุกช่องทางที่สร้างออเดอร์ */
  gift_card: GiftCardSettings;
}

export interface ClosedStorefront {
  /** ร้านที่เคยตั้งค่าหน้าร้านไว้แล้วแต่ปิดอยู่ — โชว์แบรนด์ + ช่องทางติดต่อได้ */
  name: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  config: StorefrontConfig;
  line_oa: StorefrontLineOa | null;
}

/**
 * หาบริษัทจาก slug ที่อยู่ใน URL — **อ่านจาก `storefront_slug` อย่างเดียว**
 *
 * `companies.slug` เป็นตัวระบุภายใน ลูกค้าไม่เคยเห็นและไม่ควรมามีผลกับ URL หน้าร้าน
 * (เคยตกไปหามันเป็นทางถอย แล้วกลายเป็นสอง namespace ปนกัน ต้องคอยกันชนข้ามคอลัมน์
 * ทุกที่ที่เขียน — ตัดออกแล้วเหลือความจริงเดียว และ unique index ของ DB กันซ้ำให้พอ)
 *
 * ⇒ ร้านที่ยังไม่ตั้ง `storefront_slug` **เปิดหน้าร้านไม่ได้** (API กันตอนกดเปิดอยู่แล้ว)
 */
async function findCompanyBySlug<T extends string>(slug: string, columns: T) {
  const { data } = await supabaseAdmin
    .from('companies')
    .select(columns)
    .eq('storefront_slug', slug)
    .maybeSingle();
  return (data as unknown as Record<string, unknown> | null) ?? null;
}

/**
 * ร้านที่ "ปิดหน้าร้านชั่วคราว" — ต่างจากร้านที่ไม่มีอยู่จริง
 *
 * คืนค่าเฉพาะร้านที่ **เคยตั้งค่า storefront ไว้แล้ว** (มี key `storefront`
 * ใน settings) เท่านั้น — บริษัทที่ไม่เคยเปิดหน้าร้านเลยต้องคืน null
 * ไม่งั้นใครก็เดา slug เพื่อดูว่าบริษัทไหนมีอยู่ในระบบได้
 *
 * ⚠️ คืนแค่ชื่อ/โลโก้/ช่องทางติดต่อ — ห้ามคืนข้อมูลสินค้าเด็ดขาด
 */
export const getClosedStorefront = cache(async (slug: string): Promise<ClosedStorefront | null> => {
  const data = await findCompanyBySlug(slug, 'id, name, logo_url, phone, email, settings, is_active, storefront_slug') as {
    id: string; name: string; logo_url: string | null; phone: string | null; email: string | null;
    settings: Record<string, unknown> | null; is_active: boolean | null;
  } | null;

  if (!data || data.is_active === false) return null;
  const settings = data.settings || {};
  if (!settings.storefront) return null;          // ไม่เคยตั้งค่า = ถือว่าไม่มีร้านนี้

  const config = parseStorefront(settings);
  if (config.enabled) return null;                // ยังเปิดอยู่ ไม่ใช่เคสนี้

  return {
    name: config.display_name || data.name,
    logo_url: data.logo_url,
    phone: data.phone,
    email: data.email,
    config,
    line_oa: await getCompanyLineOa(data.id),
  };
});

/** LINE OA ที่เปิดใช้งานของบริษัท (basic_id = @xxxx ใช้ทำลิงก์เพิ่มเพื่อน) */
async function getCompanyLineOa(companyId: string): Promise<StorefrontLineOa | null> {
  const { data } = await supabaseAdmin
    .from('chat_accounts')
    .select('account_name, credentials')
    .eq('company_id', companyId)
    .eq('platform', 'line')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const cred = (data?.credentials as Record<string, unknown> | null) || {};
  // ลิงก์เพิ่มเพื่อนใช้ premium ID (@abcthebaby) ถ้ามี — จำง่ายกว่า basic ID ที่ LINE สุ่ม
  const premiumId = typeof cred.premium_id === 'string' ? cred.premium_id.trim() : '';
  const basicId = premiumId || (typeof cred.basic_id === 'string' ? cred.basic_id.trim() : '');
  if (!basicId) return null;
  return {
    name: (cred.bot_name as string) || data?.account_name || 'LINE',
    add_friend_url: `https://line.me/R/ti/p/${basicId.startsWith('@') ? basicId : `@${basicId}`}`,
    picture_url: (cred.bot_picture_url as string) || null,
  };
}

/**
 * Resolve a storefront by company slug. Returns null when the company is
 * missing/inactive OR the storefront is switched off — callers must 404 so a
 * disabled shop never leaks product data.
 */
export const getStorefrontCompany = cache(async (slug: string): Promise<StorefrontCompany | null> => {
  const data = await findCompanyBySlug(
    slug,
    'id, slug, storefront_slug, name, logo_url, description, phone, email, address, settings, is_active',
  ) as {
    id: string; slug: string; storefront_slug: string | null; name: string;
    logo_url: string | null; description: string | null; phone: string | null;
    email: string | null; address: string | null;
    settings: Record<string, unknown> | null; is_active: boolean | null;
  } | null;

  if (!data || data.is_active === false) return null;

  const settings = data.settings || {};
  const config = parseStorefront(settings);
  if (!config.enabled) return null;

  const line_oa = await getCompanyLineOa(data.id);
  // เฉพาะ channel id — เปิดเผยได้เพราะมันอยู่ใน URL ที่พาไป LINE อยู่แล้ว
  // secret อยู่ใน settings.line_login และต้องไม่หลุดออกจากฝั่ง server
  const line_login_channel_id = parseLineLogin(settings).channel_id;

  return {
    id: data.id,
    // slug สาธารณะที่ใช้ประกอบลิงก์ทุกที่ (sitemap / canonical / llms.txt)
    slug: data.storefront_slug!,
    name: data.name,
    logo_url: data.logo_url,
    description: data.description,
    phone: data.phone,
    email: data.email,
    address: data.address,
    config,
    features: parseFeatures(settings).features,
    line_oa,
    line_login_channel_id,
    gift_card: parseGiftCard(settings),
  };
});

interface RawVariation {
  id: string;
  product_id: string;
  variation_label: string | null;
  sku: string | null;
  default_price: number;
  discount_price: number | null;
  stock: number | null;
  is_active: boolean;
  /** combo of a composite product: `{ slot name: picked option }` */
  attributes?: Record<string, unknown> | null;
}

const VARIATION_SELECT = 'id, product_id, variation_label, sku, default_price, discount_price, stock, is_active, attributes';

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

/** What a composite product (สินค้าชุด) needs on top of the normal assembly. */
interface CompositeExtras {
  slots: CompositeSlot[];
  /** combo id → component variations (used to order option values like the slot does) */
  parts: Map<string, CompositePart[]>;
  /** picture for combos without an image of their own (built from component images) */
  fallbackImages: Map<string, string>;
}

function parseSlots(raw: unknown): CompositeSlot[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is CompositeSlot => !!s && typeof s === 'object'
    && typeof (s as CompositeSlot).name === 'string' && (s as CompositeSlot).name.trim() !== ''
    && Array.isArray((s as CompositeSlot).variation_ids));
}

function attributesOf(v: RawVariation | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  const a = v?.attributes;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return out;
  for (const [k, val] of Object.entries(a)) {
    if (typeof val === 'string' && val.trim()) out[k.trim()] = val.trim();
  }
  return out;
}

/**
 * One group per slot, values ordered like the slot's options (via each combo's component in that
 * slot). Returns null when the combos can't drive a picker — a combo missing a slot value, or two
 * combos with the same picks — so the page falls back to the flat list instead of hiding a combo.
 */
function buildOptionGroups(
  slots: CompositeSlot[],
  variations: StorefrontVariation[],
  parts: Map<string, CompositePart[]>,
): StorefrontOptionGroup[] | null {
  if (slots.length === 0 || variations.length === 0) return null;
  const groups: StorefrontOptionGroup[] = [];
  for (const slot of slots) {
    const name = slot.name.trim();
    const rank = new Map<string, number>();       // insertion order = first seen (tie-break)
    for (const v of variations) {
      const value = v.options?.[name];
      if (!value) return null;
      const idx = (parts.get(v.id) || [])
        .map(p => slot.variation_ids.indexOf(p.variationId))
        .filter(i => i >= 0);
      const r = idx.length ? Math.min(...idx) : Number.MAX_SAFE_INTEGER;
      rank.set(value, Math.min(rank.get(value) ?? Number.MAX_SAFE_INTEGER, r));
    }
    groups.push({ name, values: [...rank.keys()].sort((a, b) => rank.get(a)! - rank.get(b)!) });
  }
  const tuples = new Set(variations.map(v => JSON.stringify(groups.map(g => v.options![g.name]))));
  return tuples.size === variations.length ? groups : null;
}

/**
 * Composite product: combo options + fallback pictures + option groups.
 * Combos are re-ordered to match the picker (slot order, then option order) so "first in-stock
 * combo" means the same thing on the page as in the data. Slots with a single value are left out
 * of `option_groups` — nothing to choose, and the cart label still names the value.
 */
function applyComposite(product: StorefrontProduct, raw: RawVariation[], extras: CompositeExtras): StorefrontProduct {
  const rawById = new Map(raw.map(v => [v.id, v]));
  const slotNames = extras.slots.map(s => s.name.trim());
  const variations = product.variations.map(v => {
    const attrs = attributesOf(rawById.get(v.id));
    return {
      ...v,
      image: v.image || extras.fallbackImages.get(v.id) || null,
      options: Object.fromEntries(slotNames.filter(n => attrs[n]).map(n => [n, attrs[n]])),
    };
  });

  const groups = buildOptionGroups(extras.slots, variations, extras.parts);
  if (groups) {
    const key = (v: StorefrontVariation) => groups.map(g => g.values.indexOf(v.options![g.name]));
    variations.sort((a, b) => {
      const ka = key(a), kb = key(b);
      for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] - kb[i];
      return 0;
    });
  }
  const optionGroups = (groups || []).filter(g => g.values.length > 1);

  // ชุดที่ไม่มีรูปของตัวเองเลย ใช้รูปของชุดย่อยแรกเป็นปก (ดีกว่าการ์ด "ไม่มีรูป")
  const cover = variations.find(v => v.image)?.image;
  return {
    ...product,
    is_composite: true,
    variations,
    images: product.images.length || !cover ? product.images : [cover],
    ...(optionGroups.length ? { option_groups: optionGroups } : {}),
  };
}

/**
 * Loads CompositeExtras for the composite rows among `variations` — one components query for all,
 * fallback pictures per product (in parallel). Failures degrade to "no extras" rather than
 * taking the shop page down.
 */
async function loadCompositeExtras(
  rows: { id: string; composite_slots?: unknown }[],
  variations: RawVariation[],
  ownImageVariationIds: Set<string>,
): Promise<Map<string, CompositeExtras>> {
  const out = new Map<string, CompositeExtras>();
  if (rows.length === 0) return out;
  const productIds = new Set(rows.map(r => r.id));
  const combos = variations.filter(v => v.is_active && productIds.has(v.product_id));
  if (combos.length === 0) return out;

  const [parts, ...fallbacks] = await Promise.all([
    getCompositePartsMap(supabaseAdmin, combos.map(v => v.id)).catch(() => new Map<string, CompositePart[]>()),
    ...rows.map(r => getComboFallbackImages(
      supabaseAdmin,
      parseSlots(r.composite_slots),
      combos.filter(v => v.product_id === r.id && !ownImageVariationIds.has(v.id)).map(v => v.id),
    ).catch(() => new Map<string, string>())),
  ]);
  rows.forEach((r, i) => out.set(r.id, { slots: parseSlots(r.composite_slots), parts, fallbackImages: fallbacks[i] }));
  return out;
}

function assembleProduct(
  row: { id: string; slug: string | null; name: string; description: string | null; image: string | null; updated_at: string; category?: { name: string } | null; brand?: { name: string } | null },
  variations: RawVariation[],
  images: { variation_id: string | null; image_url: string }[],
  stockEnabled: boolean,
  composite?: CompositeExtras,
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

  const product: StorefrontProduct = {
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
  return composite ? applyComposite(product, variations.filter(v => v.is_active), composite) : product;
}

/**
 * Combos of a composite product (สินค้าชุด) hold no stock of their own — their `stock`
 * becomes the sellable sets across all warehouses (the scarcest component decides).
 */
async function withComboStock(
  companyId: string,
  variations: RawVariation[],
  compositeProductIds: Set<string>,
): Promise<RawVariation[]> {
  const comboIds = variations.filter(v => compositeProductIds.has(v.product_id)).map(v => v.id);
  if (comboIds.length === 0) return variations;
  const avail = await getCompositeAvailability(supabaseAdmin, companyId, comboIds);
  return variations.map(v => (compositeProductIds.has(v.product_id)
    ? { ...v, stock: avail.get(v.id)?.available ?? 0 }
    : v));
}

const PRODUCT_SELECT = `
  id, slug, name, description, image, updated_at, is_composite, composite_slots,
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
      .select(VARIATION_SELECT)
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

  const compositeRows = filtered.filter(r => r.is_composite);
  const compositeIds = new Set<string>(compositeRows.map(r => r.id));
  const rawVars = (variations || []) as RawVariation[];
  const ownImageIds = new Set<string>((images || []).map(i => i.variation_id).filter(Boolean) as string[]);
  const [catalogVars, compositeExtras] = await Promise.all([
    stockEnabled ? withComboStock(companyId, rawVars, compositeIds) : Promise.resolve(rawVars),
    loadCompositeExtras(compositeRows, rawVars, ownImageIds),
  ]);
  const varsByProduct = new Map<string, RawVariation[]>();
  for (const v of catalogVars) {
    const list = varsByProduct.get(v.product_id) || [];
    list.push(v);
    varsByProduct.set(v.product_id, list);
  }
  const imgsByProduct = new Map<string, { variation_id: string | null; image_url: string }[]>();
  for (const i of images || []) {
    const list = imgsByProduct.get(i.product_id) || [];
    list.push({ variation_id: i.variation_id, image_url: i.image_url });
    imgsByProduct.set(i.product_id, list);
  }

  return filtered
    .map(r => assembleProduct(r, varsByProduct.get(r.id) || [], imgsByProduct.get(r.id) || [], stockEnabled, compositeExtras.get(r.id)))
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
      .select(VARIATION_SELECT)
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

  const rawVars = (variations || []) as RawVariation[];
  const isComposite = !!typedRow.is_composite;
  const ownImageIds = new Set<string>((images || []).map(i => i.variation_id).filter(Boolean) as string[]);
  const [productVars, compositeExtras] = await Promise.all([
    stockEnabled && isComposite
      ? withComboStock(companyId, rawVars, new Set([typedRow.id as string]))
      : Promise.resolve(rawVars),
    isComposite ? loadCompositeExtras([typedRow], rawVars, ownImageIds) : Promise.resolve(new Map<string, CompositeExtras>()),
  ]);
  const product = assembleProduct(
    typedRow,
    productVars,
    (images || []).map(i => ({ variation_id: i.variation_id, image_url: i.image_url })),
    stockEnabled,
    compositeExtras.get(typedRow.id),
  );
  return product.variations.length > 0 ? product : null;
});

export interface DiscontinuedProduct {
  name: string;
  image: string | null;
  category: string | null;
}

/**
 * สินค้าที่ "เคยมี" แต่ตอนนี้ปิดขาย/ซ่อนจากหน้าร้าน
 *
 * ใช้แยกให้ออกระหว่าง URL ที่ Google เคยเก็บไว้ตอนสินค้ายังขายอยู่
 * (ต้องเก็บคนที่ค้นเจอไว้ในร้าน ไม่ปล่อยให้เด้งออก) กับ URL มั่วที่ไม่เคยมีจริง
 */
export const getDiscontinuedProduct = cache(async (
  companyId: string,
  slugOrId: string,
): Promise<DiscontinuedProduct | null> => {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slugOrId);
  const { data } = await supabaseAdmin
    .from('products')
    .select('name, image, category:product_categories ( name )')
    .eq('company_id', companyId)
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return { name: row.name, image: row.image || null, category: row.category?.name ?? null };
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
