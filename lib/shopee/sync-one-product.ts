// ซิงค์สินค้า 1 ตัวกับร้าน Shopee 1 ร้าน — **ต้องระบุทิศทางเสมอ**
//
// กติกา (2026-08-29): ห้ามมีปุ่ม "sync" ที่ไม่บอกว่าใครทับใคร
// ระบบเรากับ marketplace ถือข้อมูลชุดเดียวกันคนละชุด การกดปุ่มโดยไม่รู้ทิศทาง
// = เสี่ยงทับของที่ถูกด้วยของที่ผิด (เคยเกิดจริง: สต็อกหลุดกัน 3 เดือนแล้วไม่รู้ว่า
// ฝั่งไหนคือความจริง ดู fix-bug.md 2026-08-29)
//
// - `pull` = เอา Shopee ทับเรา   (Shopee เป็นความจริง)
// - `push` = เอาเราทับ Shopee    (ระบบเราเป็นความจริง)
//
// ทุกทิศทางรองรับ `dryRun` เพื่อดูก่อนว่าจะเปลี่ยนอะไรบ้าง — pattern เดียวกับ bulk edit

import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getItemFullDetails,
  updateItemInfo,
  ShopeeAccountRow,
} from '@/lib/shopee/api';
import { uploadProductImages } from '@/lib/shopee/product-export';
import {
  pushPriceToShopee,
  pushStockToShopee,
  pushInfoToShopee,
  pushCategoryToShopee,
} from '@/lib/shopee/product-sync';
import { upsertProductImage } from '@/lib/marketplace/product-helpers';

export type SyncDirection = 'pull' | 'push';
export const SYNC_FIELDS = ['image', 'name', 'price', 'stock', 'category'] as const;
export type SyncField = (typeof SYNC_FIELDS)[number];

export const SYNC_FIELD_LABEL: Record<SyncField, string> = {
  image: 'รูปสินค้า',
  name: 'ชื่อสินค้า',
  price: 'ราคา',
  stock: 'สต็อก',
  category: 'หมวดหมู่',
};

export interface SyncChange {
  field: SyncField;
  label: string;
  from: string;
  to: string;
}

export interface SyncOneResult {
  success: boolean;
  direction: SyncDirection;
  dry_run: boolean;
  changes: SyncChange[];
  errors: string[];
}

const short = (v: unknown, n = 60) => {
  const s = v === null || v === undefined || v === '' ? '(ว่าง)' : String(v);
  return s.length > n ? s.slice(0, n) + '…' : s;
};

/**
 * ซิงค์สินค้า 1 ตัวกับร้าน 1 ร้าน ตามทิศทางและ field ที่เลือก
 *
 * @param fields ไม่ส่ง = ทุก field
 */
export async function syncProductWithShop(
  account: ShopeeAccountRow,
  productId: string,
  opts: { direction: SyncDirection; fields?: SyncField[]; dryRun?: boolean }
): Promise<SyncOneResult> {
  const fields = opts.fields?.length ? opts.fields : [...SYNC_FIELDS];
  const dryRun = opts.dryRun === true;
  const result: SyncOneResult = {
    success: false, direction: opts.direction, dry_run: dryRun, changes: [], errors: [],
  };

  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('id, external_item_id, external_model_id, variation_id, platform_price, platform_primary_image, platform_product_name, shopee_category_id, shopee_category_name')
    .eq('product_id', productId)
    .eq('account_id', account.id)
    .eq('platform', 'shopee');

  if (!links || links.length === 0) {
    result.errors.push('สินค้านี้ยังไม่ได้ผูกกับร้านนี้');
    return result;
  }

  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, name, image, company_id')
    .eq('id', productId)
    .single();
  if (!product) {
    result.errors.push('ไม่พบสินค้า');
    return result;
  }

  const itemId = Number(links[0].external_item_id);

  try {
    if (opts.direction === 'pull') {
      await pullIntoSystem(account, product, links, itemId, fields, dryRun, result);
    } else {
      await pushToShopee(account, product, links, itemId, fields, dryRun, result);
    }
    result.success = result.errors.length === 0;
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : 'Unknown error');
  }
  return result;
}

// ─── pull: Shopee ทับเรา ─────────────────────────────────────────────────────

type LinkRow = {
  id: string; external_item_id: string; external_model_id: string; variation_id: string | null;
  platform_price: number | null; platform_primary_image: string | null; platform_product_name: string | null;
  shopee_category_id: number | null; shopee_category_name: string | null;
};
type ProductRow = { id: string; name: string; image: string | null; company_id: string };

async function pullIntoSystem(
  account: ShopeeAccountRow,
  product: ProductRow,
  links: LinkRow[],
  itemId: number,
  fields: SyncField[],
  dryRun: boolean,
  result: SyncOneResult
): Promise<void> {
  const creds = await ensureValidToken(account);
  const details = await getItemFullDetails(creds, [itemId]);
  const detail = details.get(itemId);
  if (!detail) {
    result.errors.push(`ดึงข้อมูลสินค้า ${itemId} จาก Shopee ไม่สำเร็จ`);
    return;
  }

  const now = new Date().toISOString();
  const productUpdate: Record<string, unknown> = {};
  const linkUpdate: Record<string, unknown> = {};

  if (fields.includes('name') && detail.item_name && detail.item_name !== product.name) {
    result.changes.push({ field: 'name', label: SYNC_FIELD_LABEL.name, from: short(product.name), to: short(detail.item_name) });
    productUpdate.name = detail.item_name;
    linkUpdate.platform_product_name = detail.item_name;
  }

  if (fields.includes('image')) {
    const cover = detail.images?.[0];
    if (cover && cover !== links[0].platform_primary_image) {
      result.changes.push({ field: 'image', label: SYNC_FIELD_LABEL.image, from: short(links[0].platform_primary_image), to: short(cover) });
      linkUpdate.platform_primary_image = cover;
      if (!product.image) productUpdate.image = cover;
      if (!dryRun) {
        for (const img of detail.images || []) {
          await upsertProductImage(product.company_id, product.id, null, img);
        }
      }
    }
  }

  if (fields.includes('category') && detail.category_id && Number(links[0].shopee_category_id) !== detail.category_id) {
    result.changes.push({ field: 'category', label: SYNC_FIELD_LABEL.category, from: short(links[0].shopee_category_name || links[0].shopee_category_id), to: short(detail.category_id) });
    linkUpdate.shopee_category_id = detail.category_id;
  }

  for (const link of links) {
    const model = detail.models.find(m => String(m.model_id) === String(link.external_model_id))
      || (detail.models.length === 1 ? detail.models[0] : undefined);
    if (!model || !link.variation_id) continue;

    // ราคาที่ตั้งไว้จริงบน Shopee = original_price (current_price คือราคาหลังโปรฯ ซึ่งไม่ใช่ราคาตั้ง)
    const shopeePrice = model.original_price || model.current_price;
    if (fields.includes('price') && shopeePrice > 0) {
      const { data: variation } = await supabaseAdmin
        .from('product_variations').select('default_price').eq('id', link.variation_id).single();
      if (variation && Number(variation.default_price) !== shopeePrice) {
        result.changes.push({ field: 'price', label: SYNC_FIELD_LABEL.price, from: `${variation.default_price}`, to: `${shopeePrice}` });
        if (!dryRun) {
          await supabaseAdmin.from('product_variations')
            .update({ default_price: shopeePrice, updated_at: now }).eq('id', link.variation_id);
        }
      }
    }

    if (fields.includes('stock')) {
      const { data: wh } = await supabaseAdmin.from('warehouses')
        .select('id').eq('company_id', product.company_id).eq('is_active', true).eq('is_default', true).maybeSingle();
      if (wh) {
        const { data: inv } = await supabaseAdmin.from('inventory')
          .select('id, quantity, reserved_quantity').eq('warehouse_id', wh.id).eq('variation_id', link.variation_id).maybeSingle();
        const reserved = inv?.reserved_quantity || 0;
        const ourAvailable = (inv?.quantity || 0) - reserved;
        const shopeeStock = model.stock ?? 0;
        if (ourAvailable !== shopeeStock) {
          result.changes.push({ field: 'stock', label: SYNC_FIELD_LABEL.stock, from: `${ourAvailable}`, to: `${shopeeStock}` });
          if (!dryRun) {
            // quantity = ยอด Shopee + reserved → "ยอดขายได้" ตรงกับ Shopee (สมมาตรกับ push)
            if (inv) {
              await supabaseAdmin.from('inventory')
                .update({ quantity: shopeeStock + reserved, updated_at: now }).eq('id', inv.id);
            } else {
              await supabaseAdmin.from('inventory').insert({
                company_id: product.company_id, warehouse_id: wh.id,
                variation_id: link.variation_id, quantity: shopeeStock, reserved_quantity: 0,
              });
            }
          }
        }
      }
    }
  }

  if (!dryRun) {
    if (Object.keys(productUpdate).length > 0) {
      await supabaseAdmin.from('products').update({ ...productUpdate, updated_at: now }).eq('id', product.id);
    }
    if (Object.keys(linkUpdate).length > 0) {
      await supabaseAdmin.from('marketplace_product_links')
        .update({ ...linkUpdate, last_synced_at: now, updated_at: now })
        .in('id', links.map(l => l.id));
    }
  }
}

// ─── push: เราทับ Shopee ─────────────────────────────────────────────────────

async function pushToShopee(
  account: ShopeeAccountRow,
  product: ProductRow,
  links: LinkRow[],
  itemId: number,
  fields: SyncField[],
  dryRun: boolean,
  result: SyncOneResult
): Promise<void> {
  // preview เทียบกับ "ค่าล่าสุดที่เรารู้จากร้าน" (platform_*) — ไม่ยิง API เพื่อดูเฉย ๆ
  // ค่าจริงจะถูกยืนยันตอนกดส่งจริง
  if (fields.includes('name') && product.name !== links[0].platform_product_name) {
    result.changes.push({ field: 'name', label: SYNC_FIELD_LABEL.name, from: short(links[0].platform_product_name), to: short(product.name) });
    if (!dryRun) {
      const r = await pushInfoToShopee(account, itemId, product.name);
      if (!r.success) result.errors.push(`ชื่อสินค้า: ${r.error}`);
    }
  }

  if (fields.includes('image')) {
    const { data: images } = await supabaseAdmin
      .from('product_images').select('image_url')
      .eq('product_id', product.id).eq('company_id', product.company_id)
      .order('sort_order', { ascending: true });
    const urls = (images || []).map(i => i.image_url).filter(Boolean) as string[];
    if (urls.length === 0 && product.image) urls.push(product.image);

    if (urls.length > 0) {
      result.changes.push({ field: 'image', label: SYNC_FIELD_LABEL.image, from: short(links[0].platform_primary_image), to: short(urls[0]) });
      if (!dryRun) {
        const creds = await ensureValidToken(account);
        const { image_id_list, errors } = await uploadProductImages(creds, urls);
        if (image_id_list.length === 0) {
          result.errors.push(`รูปสินค้า: อัปโหลดไม่สำเร็จ ${errors.join('; ')}`);
        } else {
          const { error } = await updateItemInfo(creds, itemId, { image: { image_id_list } });
          if (error) result.errors.push(`รูปสินค้า: ${error}`);
          else {
            await supabaseAdmin.from('marketplace_product_links')
              .update({ platform_primary_image: urls[0], updated_at: new Date().toISOString() })
              .in('id', links.map(l => l.id));
          }
        }
      }
    }
  }

  if (fields.includes('price')) {
    // เทียบเป็นตัวเลขจริงต่อ variation — ตัวที่ราคาตรงกับที่ร้านรู้ล่าสุดแล้วไม่ต้องขึ้นในรายการ
    let willChangePrice = false;
    for (const link of links) {
      if (!link.variation_id) continue;
      const { data: v } = await supabaseAdmin
        .from('product_variations').select('default_price').eq('id', link.variation_id).single();
      const ours = Number(v?.default_price ?? 0);
      if (ours > 0 && Number(link.platform_price ?? -1) !== ours) {
        willChangePrice = true;
        result.changes.push({ field: 'price', label: SYNC_FIELD_LABEL.price, from: short(link.platform_price), to: `${ours}` });
      }
    }
    if (!dryRun && willChangePrice) {
      const r = await pushPriceToShopee(account, product.id);
      if (!r.success) result.errors.push(`ราคา: ${r.errors.join('; ')}`);
    }
  }

  if (fields.includes('stock')) {
    // ยอดบน Shopee ตอนนี้เราไม่รู้โดยไม่ยิง API (ไม่ได้เก็บไว้ใน link) — บอกให้ชัดว่าจะส่งเลขอะไรขึ้นไป
    const { data: wh } = await supabaseAdmin.from('warehouses')
      .select('id').eq('company_id', product.company_id).eq('is_active', true).eq('is_default', true).maybeSingle();
    for (const link of links) {
      if (!wh || !link.variation_id) continue;
      const { data: inv } = await supabaseAdmin.from('inventory')
        .select('quantity, reserved_quantity').eq('warehouse_id', wh.id).eq('variation_id', link.variation_id).maybeSingle();
      const available = Math.max(0, (inv?.quantity || 0) - (inv?.reserved_quantity || 0));
      result.changes.push({ field: 'stock', label: SYNC_FIELD_LABEL.stock, from: 'ยอดบน Shopee ตอนนี้', to: `${available}` });
    }
    if (!dryRun) {
      const r = await pushStockToShopee(account, product.id);
      if (!r.success) result.errors.push(`สต็อก: ${r.errors.join('; ')}`);
    }
  }

  if (fields.includes('category') && links[0].shopee_category_id) {
    if (!dryRun) {
      const r = await pushCategoryToShopee(account, itemId, Number(links[0].shopee_category_id), links[0].id, product.company_id);
      if (!r.success) result.errors.push(`หมวดหมู่: ${r.error}`);
    }
  }
}
