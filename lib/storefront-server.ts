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
import { resolveStorefrontWarehouse } from '@/lib/stock/order-warehouse';
import {
  getCompositePartsMap, getComboFallbackImages, type CompositePart,
} from '@/lib/composite';
import type { CompositeSlot } from '@/lib/composite-shared';
import { fetchAllRows } from '@/lib/supabase-paging';
import {
  parseStorefront, effectivePrice, STOREFRONT_PAGE_SIZE,
  type StorefrontConfig, type StorefrontProduct, type StorefrontSort,
  type StorefrontVariation, type StorefrontOptionGroup, type StorefrontSwatch,
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
  is_active: boolean;
  /** ร้านตั้งไว้ว่าเป็นตัวตั้งต้นของสินค้านี้ (ได้ตัวเดียวต่อสินค้า) */
  is_default?: boolean | null;
  /** `{ ชื่อตัวเลือก: ค่า }` — สินค้าปกติ เช่น `{ สี: 'แดง' }` · สินค้าชุด = `{ ชื่อช่อง: ตัวเลือกที่เลือก }` */
  attributes?: Record<string, unknown> | null;
}

// ⛔ ไม่มีคอลัมน์ `stock` โดยตั้งใจ — ดู fetchAvailability() ว่าทำไมห้ามอ่าน
const VARIATION_SELECT = 'id, product_id, variation_label, sku, default_price, discount_price, is_active, is_default, attributes';

/**
 * พร้อมขายจริงของแต่ละตัวเลือก — **ผ่าน RPC `get_variation_stock` เท่านั้น**
 *
 * ⛔ ห้ามกลับไปอ่าน `product_variations.stock` เด็ดขาด: คอลัมน์นั้นไม่มีใครอัปเดตแล้ว
 * (stock-service เขียนลงตาราง `inventory` และไม่มี trigger ย้อนกลับ) — ตอนหน้าร้าน
 * ยังอ่านคอลัมน์นี้ ร้าน ABC มีตัวเลือกที่ `stock > 0` แค่ 7 ตัวจาก 6,216 ทั้งที่ของจริง
 * ใน `inventory` (quantity − reserved > 0) มี 675 ตัว → หน้าร้านขึ้น "สินค้าหมดชั่วคราว"
 * เกือบทั้งร้านทั้งที่มีของ (ดู fix-bug.md 2026-09-14)
 *
 * RPC ครอบสินค้าชุด (composite) ให้แล้วผ่าน `get_composite_availability` ข้างใน
 * จึงไม่ต้องคำนวณชุดย่อยแยกอีก
 */
async function fetchAvailability(companyId: string, variationIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (variationIds.length === 0) return out;
  // **คลังเดียวกับที่ checkout จอง** — ไม่ส่ง warehouse = บวกทุกคลังรวมของที่ฝากไว้กับตัวแทน/ห้าง
  // แล้วลูกค้าจะเห็นของที่ขายจริงไม่ได้ (ดู resolveStorefrontWarehouse)
  const warehouseId = await resolveStorefrontWarehouse(companyId);
  const { data, error } = await supabaseAdmin.rpc('get_variation_stock', {
    p_company_id: companyId,
    p_variation_ids: variationIds,
    p_warehouse_id: warehouseId,
  });
  if (error || !data) return out;
  for (const [id, v] of Object.entries(data as Record<string, { available?: number | string }>)) {
    out.set(id, Number(v?.available) || 0);
  }
  return out;
}

/**
 * ยอดขายต่อ "ตัวเลือก" ใน 90 วันล่าสุด — ใช้เลือกตัวตั้งต้นเมื่อร้านไม่ได้ตั้ง `is_default` ไว้
 *
 * ⚠️ นิยาม "ขายดี" ต้องเป็นชุดเดียวกับ sort `best_selling` ของหน้ารายการ — ทั้งคู่จึงนับแบบเดียวกัน
 * (ไม่นับออเดอร์ที่ยกเลิก · ย้อนหลัง 90 วันจาก `orders.created_at` · filter `company_id`)
 * ผ่าน RPC `get_variation_sales` เพื่อไม่ลากแถว `order_items` ดิบข้ามเน็ตเวิร์ก
 *
 * ⛔ ยิง **ครั้งเดียวต่อหน้า** (รวม variation ของทุกสินค้าในหน้า) เหมือน fetchAvailability()
 * — หน้ารายการมี 20 สินค้า ยิงต่อสินค้าคือ 20 รอบ
 */
async function fetchVariationSales(companyId: string, variationIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (variationIds.length === 0) return out;
  const { data, error } = await supabaseAdmin.rpc('get_variation_sales', {
    p_company_id: companyId,
    p_variation_ids: variationIds,
  });
  if (error || !data) return out;
  for (const [id, qty] of Object.entries(data as Record<string, number | string>)) {
    out.set(id, Number(qty) || 0);
  }
  return out;
}

/**
 * ตัวเลือกที่ต้องถูกเลือกไว้ให้ตอนลูกค้าเปิดหน้าสินค้า — **กติกาเดียวของทั้งหน้าสินค้าและแถว swatch**
 * (เขียนซ้ำที่อื่น = การ์ดในหน้ารายการกับหน้าสินค้าจะเลือกคนละตัว)
 *
 * 1. ตัวที่ร้านตั้ง `is_default` ไว้ **และมีของ**
 * 2. ตัวที่ขายดีที่สุดในบรรดาตัวที่มีของ (90 วัน)
 * 3. ตัวแรกที่มีของ (กติกาเดิม — ใช้เมื่อสินค้ายังไม่เคยขายเลย หรือยอดเท่ากันหมด)
 */
function pickDefaultVariation(
  variations: StorefrontVariation[],
  sales: Map<string, number>,
): StorefrontVariation | null {
  const sellable = variations.filter(v => v.in_stock);
  if (sellable.length === 0) return null;
  const flagged = sellable.find(v => v.is_default);
  if (flagged) return flagged;
  let best = sellable[0];
  let bestQty = sales.get(best.id) ?? 0;
  for (const v of sellable) {
    const qty = sales.get(v.id) ?? 0;
    if (qty > bestQty) { best = v; bestQty = qty; }
  }
  return best;
}

/** variation → public shape. Stock is exposed as a boolean only, never a count. */
function toPublicVariation(
  v: RawVariation,
  imageByVariation: Map<string, string>,
  stockEnabled: boolean,
  available: Map<string, number>,
): StorefrontVariation {
  const { price, compare_at } = effectivePrice(v.default_price, v.discount_price);
  return {
    id: v.id,
    label: v.variation_label,
    sku: v.sku,
    price,
    compare_at,
    // ร้านที่ไม่ได้ใช้ระบบคลัง ถือว่าพร้อมขายเสมอ — ไม่งั้นทั้งร้านขึ้น "สินค้าหมด"
    in_stock: stockEnabled ? (available.get(v.id) ?? 0) > 0 : true,
    image: imageByVariation.get(v.id) || null,
    ...(v.is_default ? { is_default: true as const } : {}),
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

/**
 * แถว swatch ของ "ตัวเลือกแรก" บนการ์ดสินค้า — **ไม่มี query เพิ่ม**
 * ใช้ของที่ประกอบอยู่แล้วใน assembleProduct: `attributes` ของ variation + รูปต่อตัวเลือก
 *
 * "ตัวเลือกแรก" = key แรกของ `attributes` ของ variation ตัวแรกที่มี attributes —
 * ไม่ได้ใช้ `products.selected_variation_types` เพราะมันเก็บเป็น **id ของ variation_types**
 * (ตรวจของจริงแล้ว) ส่วน key ใน attributes เป็น **ชื่อ** จึงต้องยิง query เพิ่มเพื่อ map
 * ซึ่งไม่คุ้มกับการเดา key แรกที่ตรงกันอยู่แล้วในทางปฏิบัติ
 *
 * variation เก่าที่ไม่มี attributes ใช้ `variation_label` เป็นค่าแทน
 * ค่าที่ไม่มี variation ตัวไหนมีรูปของตัวเองเลย = ไม่เอาเข้าแถว (swatch ต้องมีรูป)
 */
function buildSwatches(
  activeVars: RawVariation[],
  imageByVariation: Map<string, string>,
  /** ตัวที่หน้าสินค้าเลือกให้ (pickDefaultVariation) — ค่าของมันต้องขึ้นก่อน แถวโชว์แค่ 6 อันแรก */
  defaultVariationId?: string,
): { name: string; items: StorefrontSwatch[] } | null {
  // สินค้าตัวเลือกเดียว = ไม่มีอะไรให้เลือก (สินค้าแบบ simple ก็เข้าทางนี้)
  if (activeVars.length < 2) return null;

  const withAttrs = activeVars.map(v => attributesOf(v));
  const firstName = withAttrs.map(a => Object.keys(a)[0]).find(k => !!k) || '';

  // ค่าของตัวเลือกแรก → variation ตัวแรกในกลุ่มที่มีรูปของตัวเอง (คงลำดับเดิม)
  const imageByValue = new Map<string, { image: string; variation_id: string }>();
  const order: string[] = [];
  activeVars.forEach((v, i) => {
    const value = (firstName ? withAttrs[i][firstName] : '') || (v.variation_label || '').trim();
    if (!value) return;
    if (!order.includes(value)) order.push(value);
    const image = imageByVariation.get(v.id);
    if (image && !imageByValue.has(value)) imageByValue.set(value, { image, variation_id: v.id });
  });

  // ค่าของตัวที่ถูกเลือกขึ้นเป็นอันแรก · ที่เหลือคงลำดับเดิม (created_at)
  // ⛔ ห้ามเรียงทั้งแถวตามยอดขาย — ลำดับจะขยับเองเรื่อย ๆ ลูกค้าที่กลับมาดูซ้ำจะงง
  const defaultIndex = activeVars.findIndex(v => v.id === defaultVariationId);
  if (defaultIndex >= 0) {
    const defaultValue = (firstName ? withAttrs[defaultIndex][firstName] : '')
      || (activeVars[defaultIndex].variation_label || '').trim();
    const at = order.indexOf(defaultValue);
    if (at > 0) {
      order.splice(at, 1);
      order.unshift(defaultValue);
    }
  }

  const items: StorefrontSwatch[] = order
    .filter(value => imageByValue.has(value))
    .map(value => ({ value, ...imageByValue.get(value)! }));
  if (items.length === 0) return null;
  return { name: firstName || 'ตัวเลือก', items };
}

function assembleProduct(
  row: { id: string; slug: string | null; name: string; description: string | null; image: string | null; updated_at: string; category?: { name: string; slug: string | null } | null; brand?: { name: string } | null },
  variations: RawVariation[],
  images: { variation_id: string | null; image_url: string }[],
  stockEnabled: boolean,
  available: Map<string, number>,
  sales: Map<string, number>,
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

  const publicVariations = variations.filter(v => v.is_active)
    .map(v => toPublicVariation(v, imageByVariation, stockEnabled, available));
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
    category_slug: row.category?.slug ?? null,
    brand: row.brand?.name ?? null,
    images: Array.from(new Set(gallery)),
    variations: publicVariations,
    price_min: prices.length ? Math.min(...prices) : 0,
    price_max: prices.length ? Math.max(...prices) : 0,
    in_stock: publicVariations.some(v => v.in_stock),
    updated_at: row.updated_at,
  };
  if (composite) return applyComposite(product, variations.filter(v => v.is_active), composite);

  // สินค้าปกติเท่านั้น — สินค้าชุดมี option_groups ของตัวเองอยู่แล้ว (เลือกทีละช่อง)
  const picked = pickDefaultVariation(publicVariations, sales);
  if (picked) product.default_variation_id = picked.id;
  const swatches = buildSwatches(variations.filter(v => v.is_active), imageByVariation, picked?.id);
  return swatches ? { ...product, swatches } : product;
}

const PRODUCT_SELECT = `
  id, slug, name, description, image, updated_at, is_composite, composite_slots,
  category:product_categories ( name, slug ),
  brand:product_brands ( name )
`;

export interface CatalogOptions {
  /** ชื่อหมวด (ตรงตัว) — เทียบกับ product_categories.name เหมือนเดิม */
  category?: string;
  search?: string;
  /** หน้าที่ 1, 2, 3 … (ค่าเพี้ยน = 1) */
  page?: number;
  pageSize?: number;
  sort?: StorefrontSort;
  /** ซ่อนสินค้าที่ไม่มีของ — มีผลเฉพาะร้านที่เปิดระบบคลัง (stockEnabled) */
  hideOutOfStock?: boolean;
  /** ซ่อนสินค้าที่ไม่มีรูปเลย (ทั้ง products.image และ product_images) */
  hideNoImage?: boolean;
}

export interface CatalogPage {
  products: StorefrontProduct[];
  /** จำนวนสินค้าทั้งหมดหลังกรอง (ก่อนแบ่งหน้า) */
  total: number;
  page: number;
  pageSize: number;
}

/**
 * ตัวเลือกที่มาจาก config ของร้าน — **ทุก caller ต้องใช้ชุดเดียวกัน** รวมทั้ง
 * sitemap.xml กับ llms.txt ด้วย: ไม่ควรพา crawler ไปหน้าที่ลูกค้าหาไม่เจอในรายการ
 */
export function catalogOptionsFor(
  company: Pick<StorefrontCompany, 'config' | 'features'>,
): Pick<CatalogOptions, 'sort' | 'hideOutOfStock' | 'hideNoImage'> {
  return {
    sort: company.config.sort_by,
    hideOutOfStock: company.features.stock && !company.config.show_out_of_stock,
    hideNoImage: !company.config.show_without_image,
  };
}

/** `.in(...)` ยาวเกินไปกลายเป็น URL ที่ยิงไม่ผ่าน — แบ่งเป็นก้อนแล้วยิงขนาน */
const DETAIL_CHUNK = 100;

/**
 * variation ที่ "มีอะไรให้เลือก" เท่านั้น — สินค้าที่เปิดขายตัวเลือกเดียวไม่ต้องรู้ยอดขาย
 * (ตัดของที่ไม่ต้องใช้ทิ้งก่อนยิง RPC — sitemap ประกอบทีเดียวเป็นพัน ๆ สินค้า)
 */
function multiOptionVariationIds(vars: RawVariation[]): string[] {
  const byProduct = new Map<string, string[]>();
  for (const v of vars) {
    if (!v.is_active) continue;
    const list = byProduct.get(v.product_id) || [];
    list.push(v.id);
    byProduct.set(v.product_id, list);
  }
  const out: string[] = [];
  for (const list of byProduct.values()) if (list.length > 1) out.push(...list);
  return out;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * ประกอบสินค้าเต็มรูปจาก id ที่ RPC เลือกมาให้ — **คงลำดับตาม `ids`**
 * (RPC เป็นคนตัดสินการเรียงตาม cfg.sort_by แล้ว ห้ามเรียงชื่อทับทีหลัง)
 */
async function assembleCatalog(
  companyId: string,
  ids: string[],
  stockEnabled: boolean,
): Promise<StorefrontProduct[]> {
  const groups = chunk(ids, DETAIL_CHUNK);
  const parts = await Promise.all(groups.map(async g => {
    const [products, variations, images] = await Promise.all([
      supabaseAdmin.from('products').select(PRODUCT_SELECT).eq('company_id', companyId).in('id', g),
      // หน้าใหญ่ (sitemap) ตัวเลือก/รูปทะลุเพดาน 1,000 แถวของ PostgREST ได้ → fetchAllRows
      fetchAllRows<RawVariation>((from, to) => supabaseAdmin
        .from('product_variations')
        .select(VARIATION_SELECT)
        .eq('company_id', companyId)
        .in('product_id', g)
        .is('deleted_at', null)
        // ⚠️ ต้องมี order เสมอ — ไม่ใส่ = Postgres คืนลำดับไหนก็ได้ แล้ว "ตัวเลือกแรก"
        // (ตัวที่ถูกเลือกให้ตอนเปิดหน้าสินค้า + ลำดับ swatch) เปลี่ยนไปมาเองระหว่างรีเฟรช
        // ตารางยังไม่มีคอลัมน์ลำดับที่ร้านตั้งเอง จึงยึดลำดับที่ถูกเพิ่มเข้าระบบ
        .order('created_at', { ascending: true })
        .range(from, to)),
      fetchAllRows<{ product_id: string; variation_id: string | null; image_url: string }>((from, to) => supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url, sort_order')
        .eq('company_id', companyId)
        .in('product_id', g)
        .order('sort_order', { ascending: true })
        .range(from, to)),
    ]);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rows: (products.data || []) as any[],
      variations: variations.rows,
      images: images.rows,
    };
  }));

  const rows = parts.flatMap(p => p.rows);
  if (rows.length === 0) return [];
  const rawVars = parts.flatMap(p => p.variations);
  const images = parts.flatMap(p => p.images);

  const compositeRows = rows.filter(r => r.is_composite);
  const ownImageIds = new Set<string>(images.map(i => i.variation_id).filter(Boolean) as string[]);
  const [available, sales, compositeExtras] = await Promise.all([
    stockEnabled
      ? fetchAvailability(companyId, rawVars.filter(v => v.is_active).map(v => v.id))
      : Promise.resolve(new Map<string, number>()),
    // ยอดขายต่อตัวเลือก — ยิงรอบเดียวรวมทุกสินค้าในหน้า
    fetchVariationSales(companyId, multiOptionVariationIds(rawVars)),
    loadCompositeExtras(compositeRows, rawVars, ownImageIds),
  ]);

  const varsByProduct = new Map<string, RawVariation[]>();
  for (const v of rawVars) {
    const list = varsByProduct.get(v.product_id) || [];
    list.push(v);
    varsByProduct.set(v.product_id, list);
  }
  const imgsByProduct = new Map<string, { variation_id: string | null; image_url: string }[]>();
  for (const i of images) {
    const list = imgsByProduct.get(i.product_id) || [];
    list.push({ variation_id: i.variation_id, image_url: i.image_url });
    imgsByProduct.set(i.product_id, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>(rows.map(r => [r.id as string, r]));
  return ids
    .map(id => byId.get(id))
    .filter(Boolean)
    .map(r => assembleProduct(
      r,
      varsByProduct.get(r.id) || [],
      imgsByProduct.get(r.id) || [],
      stockEnabled,
      available,
      sales,
      compositeExtras.get(r.id),
    ))
    // สินค้าที่ไม่มี variation ที่ขายได้เลย ไม่ต้องโชว์ (ราคาเป็น 0 ดูเหมือนของฟรี)
    .filter(p => p.variations.length > 0);
}

/**
 * Public catalog — active + storefront_visible products only.
 *
 * กรอง/เรียง/แบ่งหน้า **ที่ DB เสมอ** ผ่าน RPC `get_storefront_catalog`
 * (เดิมดึง 200 แถวแรกตามชื่อแล้วกรองหมวดใน JS — ร้านที่มีสินค้าหลายพันตัว
 * ลูกค้าเห็นแค่ 200 ตัวแรก) · เงื่อนไข "ขึ้นหน้าร้านได้" ใน RPC ต้องตรงกับ
 * `getStorefrontProduct` เป๊ะ ไม่งั้นลิงก์ในรายการพาไปหน้า 404
 */
export const getStorefrontCatalog = cache(async (
  companyId: string,
  options: CatalogOptions = {},
  stockEnabled = false,
): Promise<CatalogPage> => {
  const pageSize = Math.max(1, Math.floor(options.pageSize ?? STOREFRONT_PAGE_SIZE));
  const page = Math.max(1, Math.floor(options.page ?? 1));

  const { data, error } = await supabaseAdmin.rpc('get_storefront_catalog', {
    p_company_id: companyId,
    p_category: options.category || null,
    p_search: options.search || null,
    p_sort: options.sort || 'name',
    p_stock_enabled: stockEnabled,
    p_hide_out_of_stock: !!options.hideOutOfStock,
    p_hide_no_image: !!options.hideNoImage,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  const picked = (data || []) as { id: string; total_count: number | string }[];
  if (error || picked.length === 0) return { products: [], total: 0, page, pageSize };

  const total = Number(picked[0].total_count) || picked.length;
  const products = await assembleCatalog(companyId, picked.map(r => r.id), stockEnabled);
  return { products, total, page, pageSize };
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
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
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
  // สต็อกมาจาก RPC เท่านั้น (ครอบสินค้าชุดให้แล้ว) — ห้ามอ่านคอลัมน์ stock
  const [available, sales, compositeExtras] = await Promise.all([
    stockEnabled
      ? fetchAvailability(companyId, rawVars.filter(v => v.is_active).map(v => v.id))
      : Promise.resolve(new Map<string, number>()),
    isComposite ? Promise.resolve(new Map<string, number>()) : fetchVariationSales(companyId, multiOptionVariationIds(rawVars)),
    isComposite ? loadCompositeExtras([typedRow], rawVars, ownImageIds) : Promise.resolve(new Map<string, CompositeExtras>()),
  ]);
  const product = assembleProduct(
    typedRow,
    rawVars,
    (images || []).map(i => ({ variation_id: i.variation_id, image_url: i.image_url })),
    stockEnabled,
    available,
    sales,
    compositeExtras.get(typedRow.id),
  );
  return product.variations.length > 0 ? product : null;
});

export interface DiscontinuedProduct {
  name: string;
  image: string | null;
  /** ชื่อหมวดไว้ **แสดง** */
  category: string | null;
  /** slug ของหมวดไว้ **ทำลิงก์** — คนละค่ากับที่แสดง อย่าสลับกัน */
  categorySlug: string | null;
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
    .select('name, image, category:product_categories ( name, slug )')
    .eq('company_id', companyId)
    .eq(isUuid ? 'id' : 'slug', slugOrId)
    .maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any;
  return {
    name: row.name,
    image: row.image || null,
    category: row.category?.name ?? null,
    categorySlug: row.category?.slug ?? null,
  };
});

/**
 * แปลงค่า `?cat=` ให้เป็น **ชื่อหมวด** ที่ RPC ใช้กรอง
 *
 * รับได้สองแบบ: **slug** (ลิงก์ที่ระบบสร้างให้ร้านส่งหาลูกค้า — ไม่ตายเมื่อเปลี่ยนชื่อหมวด)
 * และ **ชื่อหมวดตรง ๆ** (ลิงก์ที่ส่งออกไปแล้วก่อนจะมี slug + ลิงก์ในแถบหมวดของหน้าร้านเอง)
 * ⛔ ห้ามตัดขาชื่อทิ้ง — ลิงก์เก่าอยู่ในมือลูกค้าและใน index ของ Google แล้ว
 *
 * หา slug ไม่เจอ = คืนค่าเดิมให้ RPC ไปกรองตามชื่อเหมือนเดิม (ค่ามั่ว = ไม่เจอสินค้า เท่าเดิม)
 */
/**
 * metadata ของหน้า "ธุรกรรม" ในร้าน (ตะกร้า · checkout · คำสั่งซื้อ · บัญชี)
 *
 * หน้าพวกนี้ `noindex` เสมอ แต่ **ต้องมีชื่อร้านใน `<title>`** — ไม่ใช่เพื่ออันดับ
 * แต่เพราะระบบเป็น multi-tenant: ตั้งเป็นสตริงตายตัวแล้วทุกร้านจะมี `<title>ตะกร้าสินค้า</title>`
 * เหมือนกันหมด ลูกค้าเปิดหลายแท็บ/ดูประวัติ/แชร์ลิงก์แล้วไม่รู้ว่าร้านไหน
 *
 * `getStorefrontCompany` ห่อ cache() แล้วและตัวหน้าเรียกอยู่แล้วในคำขอเดียวกัน — ไม่ยิง query เพิ่ม
 */
export async function storeUtilityMetadata(slug: string, pageTitle: string) {
  const company = await getStorefrontCompany(slug);
  const shopName = company ? (company.config.display_name || company.name) : '';
  return {
    title: shopName ? `${pageTitle} | ${shopName}` : pageTitle,
    robots: { index: false, follow: false },
  };
}

export interface ResolvedCategory {
  /** ค่าที่ส่งให้ RPC กรอง — หาไม่เจอก็ส่งค่าดิบต่อ (ผลลัพธ์ = ไม่เจอสินค้า เท่าเดิม) */
  filter: string;
  /**
   * ชื่อจริงไว้ **แสดง** — `null` เมื่อค่าใน URL ไม่ตรงหมวดไหนเลย
   * ⛔ ห้ามเอาค่าดิบจาก URL ไปวาดเป็น `<h1>`/`<title>`/JSON-LD — ใครก็ยัด `?cat=<ข้อความอะไรก็ได้>`
   * แล้วได้หน้าที่มีข้อความของตัวเองอยู่บนโดเมนของร้าน
   */
  name: string | null;
}

export const resolveCategoryParam = cache(async (
  companyId: string,
  cat: string | undefined | null,
): Promise<ResolvedCategory | null> => {
  const value = (cat || '').trim();
  if (!value) return null;

  const bySlug = await supabaseAdmin
    .from('product_categories')
    .select('name')
    .eq('company_id', companyId)
    .eq('slug', value)
    .maybeSingle();
  if (bySlug.data?.name) return { filter: bySlug.data.name, name: bySlug.data.name };

  // ⚠️ แยกเป็นคนละ query ไม่ใช่ `.or()` — ชื่อหมวดมีคอมมา/วงเล็บได้ ซึ่งเป็นไวยากรณ์ของตัวกรอง
  // PostgREST เอง ยัดค่าดิบลงไปแล้วตัวกรองเพี้ยน (cache() ทำให้ยิงรอบเดียวต่อ request อยู่แล้ว)
  const byName = await supabaseAdmin
    .from('product_categories')
    .select('name')
    .eq('company_id', companyId)
    .eq('name', value)
    .limit(1)
    .maybeSingle();
  return { filter: value, name: byName.data?.name ?? null };
});

export interface StorefrontCategory {
  /** ไว้ **แสดง** บนแถบหมวด/breadcrumb */
  name: string;
  /** ไว้ **ทำลิงก์** (`?cat=`) — ไม่ตายเมื่อร้านเปลี่ยนชื่อหมวด */
  slug: string;
}

/**
 * หมวดที่ **มีสินค้าขึ้นหน้าร้านจริง** — ใช้ทั้งแถบหมวด · llms.txt · โมดัลแทรกลิงก์
 * (หมวดที่ไม่มีสินค้าเลย ลิงก์ไปแล้วเจอหน้าเปล่า ⇒ ห้ามยื่นให้ร้านส่งหาลูกค้า)
 *
 * ⚠️ **ยุบตามชื่อ ไม่ใช่ตามแถว** — ร้านมีหมวดชื่อซ้ำกันได้จริง (เจอ `YOYO® Spare Part` 2 แถว)
 * ถ้าไล่ตามแถวจะขึ้นสองช่องป้ายเหมือนกันเป๊ะ · เลือก slug ตัวแทนอันเดียวพอ เพราะ
 * `resolveCategoryParam` แปลง slug → **ชื่อ** แล้ว RPC กรองด้วยชื่อ ⇒ ยังเห็นสินค้าของทุกแถวครบ
 */
export const getStorefrontCategories = cache(async (companyId: string): Promise<StorefrontCategory[]> => {
  const { data } = await supabaseAdmin
    .from('products')
    .select('category:product_categories ( name, slug )')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .eq('storefront_visible', true);
  const byName = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data as any[] | null) || []) {
    const name: string | undefined = row.category?.name;
    if (!name) continue;
    // slug หลุดเป็น null ไม่ควรเกิด (trigger เติมให้ทุกแถว) — ตกไปใช้ชื่อ ดีกว่าปล่อย `?cat=` เปล่า
    const slug: string = row.category?.slug || name;
    const current = byName.get(name);
    // ชื่อซ้ำ = เลือกตัวที่เรียงก่อน เพื่อให้ลิงก์เดิมนิ่งทุกครั้งที่ประกอบหน้าใหม่
    if (!current || slug < current) byName.set(name, slug);
  }
  return Array.from(byName, ([name, slug]) => ({ name, slug }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
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
