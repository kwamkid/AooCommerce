import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

/**
 * Consolidated init endpoint for the OrderForm.
 *
 * Replaces the 4 separate critical-path GETs that fire on /orders/new
 * mount — /api/customers?active=true, /api/products, /api/warehouses,
 * /api/sales-channels?active=true — with one round trip. The DB queries
 * fan out in parallel inside a single serverless invocation, so total
 * latency is bounded by the slowest one instead of the sum of all four
 * (and the auth check + Next.js routing overhead is paid once instead
 * of four times).
 *
 * Returns the same response shapes as the individual endpoints so the
 * caller can fan them back out to existing setters without reshaping.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;

    const stockConfigPromise = getStockConfig(companyId);

    // Pre-query the default warehouse id so we can fold its inventory into the
    // same parallel batch. Tiny query (~10-50ms) — net win vs the client
    // firing /api/inventory separately after the warehouses come back.
    const { data: defaultWh } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('warehouse_type', 'internal')
      .eq('is_default', true)
      .maybeSingle();
    const defaultWarehouseId = defaultWh?.id ?? null;

    // Fire all base queries in parallel
    const [
      customersResult,
      productsViewResult,
      warehousesResult,
      salesChannelsResult,
      inventoryResult,
    ] = await Promise.all([
      supabaseAdmin
        .from('customers')
        .select('*')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('products')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabaseAdmin
        .from('warehouses')
        .select('*, customer:customers(id, name, customer_type)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('warehouse_type', 'internal')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('sales_channels')
        .select('id, code, name, channel_type, platform, chat_account_id, icon, color, is_active, is_system, is_default, sort_order')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      defaultWarehouseId
        ? supabaseAdmin
            .from('inventory')
            .select('variation_id, quantity, reserved_quantity')
            .eq('company_id', companyId)
            .eq('warehouse_id', defaultWarehouseId)
        : Promise.resolve({ data: [] as { variation_id: string; quantity: number; reserved_quantity: number }[] }),
    ]);

    const productIds = (productsViewResult.data || []).map(p => p.id);
    let groupedProducts: Record<string, unknown>[] = [];

    if (productIds.length > 0) {
      // Same chunking pattern as /api/products — keep PostgREST URL and row caps in check
      const ID_CHUNK = 200;
      const productIdChunks: string[][] = [];
      for (let i = 0; i < productIds.length; i += ID_CHUNK) {
        productIdChunks.push(productIds.slice(i, i + ID_CHUNK));
      }

      const [viewChunks, imageChunks] = await Promise.all([
        Promise.all(productIdChunks.map(c =>
          supabaseAdmin
            .from('products_with_variations')
            .select('*')
            .in('product_id', c)
        )),
        Promise.all(productIdChunks.map(c =>
          supabaseAdmin
            .from('product_images')
            .select('product_id, variation_id, image_url, sort_order')
            .in('product_id', c)
            .order('sort_order', { ascending: true })
        )),
      ]);

      const viewRows = viewChunks.flatMap(r => r.data ?? []);
      const imageRows = imageChunks.flatMap(r => r.data ?? []);

      const productImageMap = new Map<string, string>();
      const variationImageMap = new Map<string, string>();
      for (const img of imageRows) {
        if (img.variation_id && !variationImageMap.has(img.variation_id)) {
          variationImageMap.set(img.variation_id, img.image_url);
        } else if (img.product_id && !img.variation_id && !productImageMap.has(img.product_id)) {
          productImageMap.set(img.product_id, img.image_url);
        }
      }

      // Group rows by product, mirroring /api/products' transform exactly so
      // the consumer doesn't need to know which endpoint it came from.
      const productMap = new Map<string, Record<string, unknown>>();
      for (const row of viewRows as Record<string, any>[]) {
        const variationVisible = row.variation_id && !row.variation_deleted_at;
        const variationActiveAndVisible = variationVisible && row.variation_is_active !== false;

        let existing = productMap.get(row.product_id);
        if (!existing) {
          existing = {
            product_id: row.product_id,
            code: row.code,
            name: row.name,
            description: row.description,
            image: row.image,
            product_type: row.product_type,
            selected_variation_types: row.selected_variation_types,
            source: row.source || 'manual',
            category_id: row.category_id || null,
            brand_id: row.brand_id || null,
            is_active: row.is_active,
            created_at: row.created_at,
            updated_at: row.updated_at,
            main_image_url: productImageMap.get(row.product_id) || null,
            variations: [] as Record<string, unknown>[],
          };
          if (row.product_type === 'simple') {
            existing.simple_variation_label = row.simple_variation_label;
          }
          productMap.set(row.product_id, existing);
        }

        if (!variationVisible) continue;

        const variations = existing.variations as Record<string, unknown>[];
        if (row.product_type === 'simple') {
          if (variationActiveAndVisible) {
            existing.simple_sku = row.sku;
            existing.simple_barcode = row.barcode;
            existing.simple_default_price = row.simple_default_price;
            existing.simple_discount_price = row.simple_discount_price;
            existing.simple_stock = row.simple_stock;
            existing.simple_min_stock = row.simple_min_stock;
          }
          variations.push({
            variation_id: row.variation_id,
            variation_label: row.simple_variation_label,
            default_price: row.simple_default_price,
            discount_price: row.simple_discount_price,
            cost_price: row.cost_price,
            stock: row.simple_stock,
            min_stock: row.simple_min_stock,
            is_active: row.variation_is_active,
            image_url: variationImageMap.get(row.variation_id) || null,
          });
        } else {
          variations.push({
            variation_id: row.variation_id,
            variation_label: row.variation_label,
            sku: row.sku,
            barcode: row.barcode,
            attributes: row.attributes,
            default_price: row.default_price,
            discount_price: row.discount_price,
            cost_price: row.cost_price,
            stock: row.stock,
            min_stock: row.min_stock,
            is_active: row.variation_is_active,
            image_url: variationImageMap.get(row.variation_id) || null,
          });
        }
      }

      // Maintain the original product order
      groupedProducts = productIds
        .map(id => productMap.get(id))
        .filter((p): p is Record<string, unknown> => Boolean(p));

      // Scrub cost_price for users without can_view_cost
      if (auth.canViewCost !== true) {
        for (const p of groupedProducts) {
          const variations = p.variations as Record<string, unknown>[] | undefined;
          if (Array.isArray(variations)) {
            for (const v of variations) delete v.cost_price;
          }
        }
      }
    }

    const stockConfig = await stockConfigPromise;

    // Build inventory map for default warehouse — same shape OrderForm expects
    const inventoryMap: Record<string, { quantity: number; reserved_quantity: number; available: number }> = {};
    for (const row of inventoryResult.data || []) {
      const quantity = Number(row.quantity) || 0;
      const reserved = Number(row.reserved_quantity) || 0;
      inventoryMap[row.variation_id] = {
        quantity,
        reserved_quantity: reserved,
        available: quantity - reserved,
      };
    }

    return NextResponse.json({
      customers: customersResult.data || [],
      products: groupedProducts,
      warehouses: warehousesResult.data || [],
      stockConfig,
      salesChannels: salesChannelsResult.data || [],
      defaultWarehouseId,
      inventoryMap,
    });
  } catch (error) {
    console.error('[Orders New Init] Error:', error);
    return NextResponse.json({ error: 'Failed to initialize order form' }, { status: 500 });
  }
}
