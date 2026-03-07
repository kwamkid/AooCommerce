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
          email,
          customer_type
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

    // Enrich with document data from document tables
    const [abbRes, taxRes, recRes, dnRes] = await Promise.all([
      supabaseAdmin.from('abbreviated_invoices')
        .select('invoice_number, invoice_date, voided_at, voided_reason')
        .eq('order_id', orderId).eq('company_id', auth.companyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date, customer_name, customer_tax_id, customer_branch, customer_address, replaces_abbreviated_id')
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', auth.companyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('receipts')
        .select('receipt_number, receipt_date')
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', auth.companyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabaseAdmin.from('delivery_notes')
        .select('dn_number, dn_date')
        .eq('source_type', 'order').eq('source_id', orderId).eq('company_id', auth.companyId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const abb = abbRes.data;
    const tax = taxRes.data;
    const rec = recRes.data;
    const dn = dnRes.data;

    // Derive document fields (same shape as old columns for backward compat)
    let taxInvoiceDocType: string | null = null;
    let taxInvoiceNumber: string | null = null;
    let taxInvoiceDate: string | null = null;
    let taxInvoiceVoidedAt: string | null = null;
    let taxInvoiceReplacedAbbrevNumber: string | null = null;

    if (tax) {
      taxInvoiceDocType = 'tax';
      taxInvoiceNumber = tax.invoice_number;
      taxInvoiceDate = tax.invoice_date;
      // If TAX replaces ABB, get the ABB number
      if (tax.replaces_abbreviated_id && abb) {
        taxInvoiceReplacedAbbrevNumber = abb.invoice_number;
      }
    } else if (abb && !abb.voided_at) {
      taxInvoiceDocType = 'abbreviated';
      taxInvoiceNumber = abb.invoice_number;
      taxInvoiceDate = abb.invoice_date;
    } else if (abb && abb.voided_at) {
      // Voided ABB — show the TAX that replaced it
      taxInvoiceDocType = 'abbreviated';
      taxInvoiceNumber = abb.invoice_number;
      taxInvoiceDate = abb.invoice_date;
      taxInvoiceVoidedAt = abb.voided_at;
    } else if (rec) {
      taxInvoiceDocType = 'receipt';
      taxInvoiceNumber = rec.receipt_number;
      taxInvoiceDate = rec.receipt_date;
    }

    // Combine order with enriched items + document data
    const orderWithItems = {
      ...order,
      // Override with document table data
      tax_invoice_doc_type: taxInvoiceDocType,
      tax_invoice_number: taxInvoiceNumber,
      tax_invoice_date: taxInvoiceDate,
      tax_invoice_voided_at: taxInvoiceVoidedAt,
      tax_invoice_replaced_abbrev_number: taxInvoiceReplacedAbbrevNumber,
      receipt_number: rec?.receipt_number || null,
      receipt_date: rec?.receipt_date || null,
      dn_number: dn?.dn_number || null,
      dn_date: dn?.dn_date || null,
      // Tax customer info from TAX doc (if available) or keep order's fields
      ...(tax ? {
        tax_invoice_name: tax.customer_name || order.tax_invoice_name,
        tax_invoice_tax_id: tax.customer_tax_id || order.tax_invoice_tax_id,
        tax_invoice_branch: tax.customer_branch || order.tax_invoice_branch,
        tax_invoice_address: tax.customer_address || order.tax_invoice_address,
      } : {}),
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
