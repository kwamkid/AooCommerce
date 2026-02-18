// Path: app/api/products/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin.rpc('get_product_for_edit', {
      p_company_id: auth.companyId,
      p_product_id: id,
    });

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

    // Determine product_type from variation_label
    const productType = product.variation_label ? 'simple' : 'variation';

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
      image_url: variationImageMap.get(v.variation_id) || null,
    }));

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
