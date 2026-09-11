// Path: app/api/products/[id]/route.ts
//
// GET              → the product for the edit form (+ composite data for สินค้าชุด)
// GET ?view=component → `{ product: ComponentProduct }` — one product with every option,
//                    used by the composite editor when a slot product is picked
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { loadComponentInfo, componentOptionLabel } from '@/lib/composite-save';
import { getCompositeAvailability, getCompositePartsMap } from '@/lib/composite';
import { comboKey, type CompositeSlot } from '@/lib/composite-shared';
import type { ComponentProduct, SavedCombo } from '@/components/products/composite/types';

/**
 * Products that can fill a composite slot, each with all its (non-deleted) options.
 * `extraVariationIds` = options a saved slot still references (kept even if deleted since).
 */
async function loadComponentProducts(
  companyId: string,
  productIds: string[],
  extraVariationIds: string[] = [],
): Promise<Record<string, ComponentProduct>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const [varsRes, imagesRes, productsRes] = await Promise.all([
    supabaseAdmin
      .from('product_variations')
      .select('id, product_id')
      .eq('company_id', companyId)
      .in('product_id', ids)
      .is('deleted_at', null)
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('product_images')
      .select('product_id, variation_id, image_url, sort_order')
      .in('product_id', ids)
      .order('sort_order', { ascending: true }),
    supabaseAdmin
      .from('products')
      .select('id, name, code, image, variation_label, is_composite, is_active')
      .eq('company_id', companyId)
      .in('id', ids),
  ]);
  if (varsRes.error) throw new Error(varsRes.error.message);
  if (productsRes.error) throw new Error(productsRes.error.message);

  const variationIds = [...new Set([...(varsRes.data || []).map(v => v.id), ...extraVariationIds])];
  const info = await loadComponentInfo(supabaseAdmin, companyId, variationIds);

  const productImage = new Map<string, string>();
  const variationImage = new Map<string, string>();
  for (const img of imagesRes.data || []) {
    if (img.variation_id) {
      if (!variationImage.has(img.variation_id)) variationImage.set(img.variation_id, img.image_url);
    } else if (!productImage.has(img.product_id)) {
      productImage.set(img.product_id, img.image_url);
    }
  }

  const out: Record<string, ComponentProduct> = {};
  for (const p of productsRes.data || []) {
    out[p.id] = {
      product_id: p.id,
      name: p.name,
      code: p.code ?? null,
      image_url: productImage.get(p.id) || p.image || null,
      is_simple: p.variation_label != null,
      is_composite: !!p.is_composite,
      is_active: !!p.is_active,
      options: [],
    };
  }
  for (const id of variationIds) {
    const c = info.get(id);
    const product = c && out[c.product_id];
    if (!c || !product) continue;
    product.options.push({
      variation_id: c.id,
      label: componentOptionLabel(c),
      sku: c.sku,
      default_price: c.default_price,
      discount_price: c.discount_price,
      is_active: c.is_active,
      image_url: variationImage.get(c.id) || product.image_url,
    });
  }
  return out;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;

    const { id } = await params;

    if (request.nextUrl.searchParams.get('view') === 'component') {
      const map = await loadComponentProducts(companyId, [id]);
      const product = map[id];
      if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      return NextResponse.json({ product });
    }

    const [rpcRes, compositeRes, lockRes] = await Promise.all([
      supabaseAdmin.rpc('get_product_for_edit', {
        p_company_id: companyId,
        p_product_id: id,
      }),
      supabaseAdmin
        .from('products')
        .select('is_composite, composite_slots')
        .eq('id', id)
        .eq('company_id', companyId)
        .maybeSingle(),
      supabaseAdmin
        .from('product_variations')
        .select('id, price_locked')
        .eq('product_id', id)
        .eq('company_id', companyId)
        .is('deleted_at', null),
    ]);
    const { data, error } = rpcRes;

    if (error) {
      console.error('RPC get_product_for_edit error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // RPC returns array — take first element
    const rpcResult = Array.isArray(data) ? data[0] : data;

    if (!rpcResult || !rpcResult.product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    const product = rpcResult.product;
    const variations = rpcResult.variations || [];
    const images = rpcResult.images || [];
    const variationImages: Record<string, any[]> = rpcResult.variation_images || {};
    const isComposite = !!compositeRes.data?.is_composite;
    const priceLocked = new Map((lockRes.data || []).map(r => [r.id, !!r.price_locked]));

    // Determine product_type from variation_label (composite products are flagged separately)
    const productType = isComposite ? 'composite' : product.variation_label ? 'simple' : 'variation';

    // Build main_image_url from first product image
    const mainImageUrl = images.length > 0 ? images[0].image_url : null;

    // Build variation image_url lookup
    const variationImageMap = new Map<string, string>();
    for (const [varId, imgs] of Object.entries(variationImages)) {
      if (Array.isArray(imgs) && imgs.length > 0) {
        variationImageMap.set(varId, (imgs[0] as any).image_url);
      }
    }

    // Build the ProductItem shape that edit page expects
    const productItem: Record<string, any> = {
      product_id: product.id,
      code: product.code,
      name: product.name,
      description: product.description,
      image: product.image,
      product_type: productType,
      is_composite: isComposite,
      selected_variation_types: product.selected_variation_types,
      source: product.source || 'manual',
      category_id: product.category_id || null,
      brand_id: product.brand_id || null,
      is_active: product.is_active,
      created_at: product.created_at,
      updated_at: product.updated_at,
      main_image_url: mainImageUrl,
    };

    if (productType === 'simple' && variations.length > 0) {
      const sv = variations[0];
      productItem.simple_variation_label = product.variation_label;
      productItem.simple_sku = sv.sku;
      productItem.simple_barcode = sv.barcode;
      productItem.simple_default_price = sv.default_price;
      productItem.simple_discount_price = sv.discount_price;
      productItem.simple_stock = sv.stock;
      productItem.simple_min_stock = sv.min_stock;
    }

    // Map variations with image_url
    productItem.variations = variations.map((v: any) => ({
      ...v,
      price_locked: priceLocked.get(v.variation_id) ?? false,
      image_url: variationImageMap.get(v.variation_id) || null,
    }));

    if (isComposite) {
      const slots: CompositeSlot[] = Array.isArray(compositeRes.data?.composite_slots)
        ? compositeRes.data.composite_slots
        : [];
      const comboIds = (variations as { variation_id: string }[]).map(v => v.variation_id);
      const [parts, availability, options] = await Promise.all([
        getCompositePartsMap(supabaseAdmin, comboIds),
        getCompositeAvailability(supabaseAdmin, companyId, comboIds),
        loadComponentProducts(companyId, slots.map(s => s.product_id), slots.flatMap(s => s.variation_ids)),
      ]);
      const combos: SavedCombo[] = [];
      for (const v of variations) {
        const comps = parts.get(v.variation_id);
        if (!comps?.length) continue;
        const stock = availability.get(v.variation_id);
        combos.push({
          variation_id: v.variation_id,
          key: comboKey(comps.map(c => c.variationId)),
          variation_label: v.variation_label,
          sku: v.sku ?? null,
          barcode: v.barcode ?? null,
          is_active: !!v.is_active,
          price_locked: priceLocked.get(v.variation_id) ?? false,
          default_price: Number(v.default_price) || 0,
          discount_price: Number(v.discount_price) || 0,
          components: comps.map(c => ({ variation_id: c.variationId, quantity: c.quantity })),
          quantity: stock?.quantity ?? null,
          available: stock?.available ?? null,
        });
      }
      productItem.composite_slots = slots;
      productItem.composite_combos = combos;
      productItem.composite_options = options;
    }

    return NextResponse.json({
      product: productItem,
      images,
      variation_images: variationImages,
      marketplace_links: rpcResult.marketplace_links || [],
    });
  } catch (error) {
    console.error('GET /api/products/[id] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
