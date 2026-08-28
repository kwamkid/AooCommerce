/**
 * Product helpers ที่ใช้ร่วมได้ทุก marketplace
 *
 * เดิมอยู่ใน `lib/shopee/product-helpers.ts` ทั้งหมด — ตอน TikTok ต้องดูดสินค้าเข้า
 * เหมือนกันจึงยกส่วนที่ไม่ผูกกับ Shopee ออกมาไว้ตรงนี้ แล้วให้ไฟล์ของ Shopee
 * re-export ต่อ (call site เดิมไม่ต้องแก้ พฤติกรรมเดิมไม่เปลี่ยน — `platform`
 * default เป็น 'shopee')
 *
 * เพิ่ม marketplace ใหม่ → ใช้ตัวพวกนี้ ห้าม copy ไปไว้ใน lib/<platform>/ ของตัวเอง
 */
import { supabaseAdmin } from '@/lib/supabase-admin';

/** platform ที่มี product import — ใช้ตั้ง `products.source` + `product_images.storage_path` */
export type MarketplacePlatform = 'shopee' | 'tiktok' | 'lazada';

// companyId:name → variation_type id (singleton ต่อ process)
const variationTypeCache: Record<string, string> = {};

/**
 * แปลงชื่อ tier/sales attribute ของ marketplace เป็น variation_type id ของบริษัท
 * e.g. ["สี", "ขนาด"] → [uuid1, uuid2] · ไม่มีชื่อมาเลย fallback "ตัวเลือกสินค้า"
 */
export async function getOrCreateVariationTypeIds(companyId: string, tierVariationNames: string[]): Promise<string[]> {
  const names = tierVariationNames.length > 0 ? tierVariationNames : ['ตัวเลือกสินค้า'];
  const ids: string[] = [];

  for (const name of names) {
    const cacheKey = `${companyId}:${name}`;
    if (variationTypeCache[cacheKey]) {
      ids.push(variationTypeCache[cacheKey]);
      continue;
    }

    const { data: existing } = await supabaseAdmin
      .from('variation_types')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (existing) {
      variationTypeCache[cacheKey] = existing.id;
      ids.push(existing.id);
      continue;
    }

    // Check if it exists globally with a different company_id (seeded types)
    const { data: globalExisting } = await supabaseAdmin
      .from('variation_types')
      .select('id, company_id')
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (globalExisting) {
      if (globalExisting.company_id !== companyId) {
        await supabaseAdmin
          .from('variation_types')
          .update({ company_id: companyId })
          .eq('id', globalExisting.id);
      }
      variationTypeCache[cacheKey] = globalExisting.id;
      ids.push(globalExisting.id);
      continue;
    }

    const { data: maxData } = await supabaseAdmin
      .from('variation_types')
      .select('sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const { data: newType, error } = await supabaseAdmin
      .from('variation_types')
      .insert({ company_id: companyId, name, sort_order: (maxData?.sort_order || 0) + 1 })
      .select()
      .single();

    if (error || !newType) {
      console.error(`[Marketplace] Failed to create variation type "${name}":`, error);
      continue;
    }

    variationTypeCache[cacheKey] = newType.id;
    ids.push(newType.id);
  }

  return ids;
}

/** รูปสินค้าจาก CDN ของ marketplace (ไม่ได้ upload เข้า storage ของเรา) */
export async function upsertProductImage(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrl: string,
  sortOrder: number = 0,
  platform: MarketplacePlatform = 'shopee'
): Promise<void> {
  if (!imageUrl) return;
  try {
    let query = supabaseAdmin.from('product_images').select('id, sort_order').eq('image_url', imageUrl).eq('company_id', companyId);
    if (productId) query = query.eq('product_id', productId);
    if (variationId) query = query.eq('variation_id', variationId);
    const { data: existing } = await query.limit(1).single();
    if (existing) {
      if (existing.sort_order !== sortOrder) {
        await supabaseAdmin.from('product_images').update({ sort_order: sortOrder }).eq('id', existing.id);
      }
      return;
    }

    await supabaseAdmin.from('product_images').insert({
      company_id: companyId,
      product_id: productId,
      variation_id: variationId,
      image_url: imageUrl,
      storage_path: `${platform}-external`,
      sort_order: sortOrder,
    });
  } catch (e) {
    console.error('[Marketplace] Failed to upsert product image:', e);
  }
}

/** Batch insert multiple product images in parallel */
export async function upsertProductImages(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrls: string[],
  platform: MarketplacePlatform = 'shopee'
): Promise<void> {
  const urls = imageUrls.filter(Boolean);
  if (urls.length === 0) return;
  await Promise.all(urls.map((url, i) => upsertProductImage(companyId, productId, variationId, url, i, platform)));
}

/**
 * เติมรูปจาก marketplace ให้ variation ที่ "ยังไม่มีรูปเลย"
 *
 * order sync เดิมใส่รูปเฉพาะตอน**สร้างสินค้าใหม่** — ออเดอร์ที่ match กับสินค้าที่มี
 * อยู่แล้ว (ผ่าน link / SKU / product code) จึงไม่เคยได้รูป และ Lazada/TikTok ที่ยัง
 * ไม่มี product import ก็ไม่มีทางอื่นให้รูปเข้ามา → การ์ดออเดอร์ขึ้นไอคอนกล่องเปล่า
 * ตลอดไป (เจอจริง 2026-08-28)
 *
 * มีรูปอยู่แล้วแม้รูปเดียว (ระดับ variation หรือระดับ product) = ไม่แตะ — รูปที่
 * ผู้ใช้ใส่เองต้องชนะรูปจาก marketplace เสมอ
 */
export async function ensureVariationImage(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrl: string,
  platform: MarketplacePlatform = 'shopee'
): Promise<void> {
  if (!imageUrl || !variationId) return;
  try {
    // นับทั้งรูป variation นี้ และรูประดับ product (list page fallback ไปใช้ตัวนั้น)
    const filters = [`variation_id.eq.${variationId}`];
    if (productId) filters.push(`and(product_id.eq.${productId},variation_id.is.null)`);

    const { count, error } = await supabaseAdmin
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .or(filters.join(','));

    if (error) {
      console.error('[Marketplace] ensureVariationImage lookup failed:', error);
      return;
    }
    if ((count ?? 0) > 0) return;

    await upsertProductImage(companyId, productId, variationId, imageUrl, 0, platform);
  } catch (e) {
    console.error('[Marketplace] ensureVariationImage failed:', e);
  }
}

/** Re-activate a soft-deleted product and all its variations */
export async function reactivateProduct(
  productId: string,
  platform: MarketplacePlatform = 'shopee'
): Promise<void> {
  const now = new Date().toISOString();
  await supabaseAdmin.from('products').update({ is_active: true, source: platform, updated_at: now }).eq('id', productId);
  await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', productId);
  console.log(`[${platform}] Reactivated product ${productId}`);
}

/** หา variation ที่ SKU ตรงกัน — เจอตัวที่ถูก soft-delete ไว้จะปลุกคืนให้ด้วย */
export async function tryAutoMatchBySku(
  companyId: string,
  sku: string,
  platform: MarketplacePlatform = 'shopee'
): Promise<{ product_id: string; variation_id: string } | null> {
  if (!sku) return null;

  // Try active products first
  const { data } = await supabaseAdmin
    .from('product_variations')
    .select('id, product_id')
    .eq('company_id', companyId)
    .eq('sku', sku)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (data) {
    return { product_id: data.product_id, variation_id: data.id };
  }

  // Then try inactive products — reactivate them
  const { data: inactive } = await supabaseAdmin
    .from('product_variations')
    .select('id, product_id')
    .eq('company_id', companyId)
    .eq('sku', sku)
    .eq('is_active', false)
    .limit(1)
    .single();

  if (inactive) {
    await reactivateProduct(inactive.product_id, platform);
    return { product_id: inactive.product_id, variation_id: inactive.id };
  }

  return null;
}

/**
 * หา link เดิมของ (account, item, model)
 *
 * id เป็น **string** เสมอ — TikTok/Lazada ใช้ id 18-19 หลักซึ่งเกินความละเอียดของ
 * JS number ห้ามแปลงเป็นตัวเลขระหว่างทาง (Shopee เป็นตัวเลขจริงจึงส่ง String(x) มาได้)
 */
export async function findMarketplaceLink(accountId: string, externalItemId: string, externalModelId: string) {
  const { data } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id, product_id, variation_id')
    .eq('account_id', accountId)
    .eq('external_item_id', externalItemId)
    .eq('external_model_id', externalModelId)
    .limit(1)
    .maybeSingle();
  return data;
}
