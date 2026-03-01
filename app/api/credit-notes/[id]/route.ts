// Path: app/api/credit-notes/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — Credit Note detail
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

    // Fetch CN without FK joins (avoid FK name mismatch)
    const { data: cn, error } = await supabaseAdmin
      .from('credit_notes')
      .select(`
        id, cn_number, order_id, type, status, reason,
        subtotal, discount_amount, vat_amount, total_amount,
        exchange_order_id, issued_at, created_at, created_by
      `)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (error || !cn) {
      return NextResponse.json({ error: 'Credit note not found' }, { status: 404 });
    }

    // Fetch order + customer separately
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, source, customer_id')
      .eq('id', cn.order_id)
      .single();

    let customer = null;
    if (order?.customer_id) {
      const { data: cust } = await supabaseAdmin
        .from('customers')
        .select('name, phone')
        .eq('id', order.customer_id)
        .single();
      customer = cust;
    }

    // Fetch creator info
    let creator = null;
    if (cn.created_by) {
      const { data: user } = await supabaseAdmin
        .from('user_profiles')
        .select('name, email')
        .eq('id', cn.created_by)
        .single();
      creator = user;
    }

    // Get CN items
    const { data: items } = await supabaseAdmin
      .from('credit_note_items')
      .select('id, order_item_id, variation_id, product_name, product_code, variation_label, quantity, unit_price, discount_amount, total')
      .eq('credit_note_id', id);

    // Fetch product images for CN items
    const variationIds = (items || []).map(i => i.variation_id).filter(Boolean);
    const imageMap: Record<string, string> = {};
    if (variationIds.length > 0) {
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('variation_id, image_url')
        .in('variation_id', variationIds)
        .order('sort_order', { ascending: true });

      for (const img of images || []) {
        if (img.variation_id && !imageMap[img.variation_id]) {
          imageMap[img.variation_id] = img.image_url;
        }
      }
    }

    const enrichedItems = (items || []).map(item => ({
      ...item,
      image: (item.variation_id && imageMap[item.variation_id]) || null,
    }));

    // Fetch exchange order info if exists
    let exchangeOrder = null;
    if (cn.exchange_order_id) {
      const { data: exOrder } = await supabaseAdmin
        .from('orders')
        .select('id, order_number, source')
        .eq('id', cn.exchange_order_id)
        .single();
      exchangeOrder = exOrder;
    }

    return NextResponse.json({
      credit_note: {
        ...cn,
        order: order ? { ...order, customer } : null,
        exchange_order: exchangeOrder,
        creator,
        items: enrichedItems,
      },
    });
  } catch (err) {
    console.error('[CN GET detail]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH — Update exchange_order_id (link CN to replacement order)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { exchange_order_id } = body as { exchange_order_id: string };

    if (!exchange_order_id) {
      return NextResponse.json({ error: 'exchange_order_id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('credit_notes')
      .update({
        exchange_order_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .eq('type', 'exchange');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[CN PATCH]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
