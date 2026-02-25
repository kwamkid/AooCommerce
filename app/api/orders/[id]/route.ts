import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - Get single order by ID
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const params = await context.params;
    const orderId = params.id;

    // Fetch order with customer info
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select(`
        *,
        customer:customers (
          id,
          customer_code,
          name,
          contact_person,
          phone,
          email
        )
      `)
      .eq('id', orderId)
      .eq('company_id', auth.companyId)
      .single();

    if (orderError || !order) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // Fetch order items with shipments
    const { data: items, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select(`
        *,
        shipments:order_shipments (
          id,
          shipping_address_id,
          quantity,
          delivery_status,
          delivery_date,
          received_date,
          delivery_notes,
          shipping_address:shipping_addresses (
            id,
            address_name,
            contact_person,
            phone,
            address_line1,
            district,
            amphoe,
            province,
            postal_code,
            google_maps_link
          )
        )
      `)
      .eq('order_id', orderId)
      .eq('company_id', auth.companyId);

    if (itemsError) {
      console.error('Error fetching items:', itemsError);
      return NextResponse.json(
        { error: 'Failed to fetch order items' },
        { status: 500 }
      );
    }

    // Fetch product images and variations in parallel
    const variationIds = (items || []).map(i => i.variation_id).filter(Boolean);
    const productIds = (items || []).map(i => i.product_id).filter(Boolean);

    const [imagesResult, variationsResult] = await Promise.all([
      (variationIds.length > 0 || productIds.length > 0)
        ? supabaseAdmin
            .from('product_images')
            .select('product_id, variation_id, image_url, sort_order')
            .eq('company_id', auth.companyId)
            .or(
              [
                variationIds.length > 0 ? `variation_id.in.(${variationIds.join(',')})` : '',
                productIds.length > 0 ? `product_id.in.(${productIds.join(',')})` : ''
              ].filter(Boolean).join(',')
            )
            .order('sort_order', { ascending: true })
        : Promise.resolve({ data: [] as { product_id: string; variation_id: string; image_url: string }[] }),
      variationIds.length > 0
        ? supabaseAdmin
            .from('product_variations')
            .select('id, sku, barcode')
            .in('id', variationIds)
        : Promise.resolve({ data: [] as { id: string; sku: string | null; barcode: string | null }[] }),
    ]);

    // Build image map: prefer variation image, fallback to product image
    const imageMap: Record<string, string> = {};
    const productImageMap: Record<string, string> = {};
    const variationImageMap: Record<string, string> = {};
    for (const img of imagesResult.data || []) {
      if (img.variation_id && !variationImageMap[img.variation_id]) {
        variationImageMap[img.variation_id] = img.image_url;
      }
      if (img.product_id && !productImageMap[img.product_id]) {
        productImageMap[img.product_id] = img.image_url;
      }
    }
    for (const item of items || []) {
      const image = variationImageMap[item.variation_id] || productImageMap[item.product_id];
      if (image) imageMap[item.id] = image;
    }

    // Build variation lookup for barcode/sku
    const variationLookup: Record<string, { sku: string | null; barcode: string | null }> = {};
    for (const v of variationsResult.data || []) {
      variationLookup[v.id] = { sku: v.sku, barcode: v.barcode };
    }

    const itemsEnriched = (items || []).map(item => {
      const variation = variationLookup[item.variation_id] || {};
      return {
        ...item,
        image: imageMap[item.id] || null,
        sku: (variation as any).sku || null,
        barcode: (variation as any).barcode || null,
      };
    });

    // Fetch parcels if order is split
    let parcels: any[] = [];
    if (order.is_split) {
      const { data: parcelData } = await supabaseAdmin
        .from('order_parcels')
        .select('id, parcel_number, tracking_number, shipping_carrier, package_number, status')
        .eq('order_id', orderId)
        .order('parcel_number');

      if (parcelData && parcelData.length > 0) {
        // Fetch parcel items
        const parcelIds = parcelData.map(p => p.id);
        const { data: parcelItems } = await supabaseAdmin
          .from('order_parcel_items')
          .select('parcel_id, order_item_id, quantity')
          .in('parcel_id', parcelIds);

        parcels = parcelData.map(p => ({
          ...p,
          items: (parcelItems || [])
            .filter(pi => pi.parcel_id === p.id)
            .map(pi => {
              const orderItem = itemsEnriched.find(i => i.id === pi.order_item_id);
              return {
                ...pi,
                product_name: orderItem?.product_name || '',
                variation_label: orderItem?.variation_label || null,
                image: orderItem?.image || null,
              };
            }),
        }));
      }
    }

    // Combine order with enriched items
    const orderWithItems = {
      ...order,
      items: itemsEnriched,
      parcels,
    };

    return NextResponse.json({ order: orderWithItems });
  } catch (error) {
    console.error('Error in orders/[id] GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
