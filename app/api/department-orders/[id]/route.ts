import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET /api/department-orders/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('department_orders')
      .select(`
        *,
        customer:customers(id, name, customer_code, phone, customer_type, tax_id, tax_company_name, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code),
        created_by_profile:user_profiles!department_orders_created_by_fkey(id, name),
        items:department_order_items(
          id, product_id, variation_id, product_name, variation_label,
          quantity, unit_price
        )
      `)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch product images
    const variationIds = (data.items as { variation_id?: string | null }[])
      .map(i => i.variation_id).filter(Boolean) as string[];
    const productIds = (data.items as { product_id?: string | null }[])
      .map(i => i.product_id).filter(Boolean) as string[];

    const imageMap: Record<string, string> = {};
    if (variationIds.length > 0 || productIds.length > 0) {
      const orParts: string[] = [];
      if (variationIds.length > 0) orParts.push(`variation_id.in.(${[...new Set(variationIds)].join(',')})`);
      if (productIds.length > 0) orParts.push(`product_id.in.(${[...new Set(productIds)].join(',')})`);
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url')
        .or(orParts.join(','))
        .order('sort_order', { ascending: true });
      for (const img of images || []) {
        if (img.variation_id && !imageMap[`v:${img.variation_id}`]) imageMap[`v:${img.variation_id}`] = img.image_url;
        if (img.product_id && !imageMap[`p:${img.product_id}`]) imageMap[`p:${img.product_id}`] = img.image_url;
      }
    }

    const items = (data.items as {
      id: string; product_id?: string | null; variation_id?: string | null;
      product_name: string; variation_label?: string | null;
      quantity: number; unit_price: number;
    }[]).map(item => ({
      ...item,
      image: (item.variation_id ? imageMap[`v:${item.variation_id}`] : null)
        || (item.product_id ? imageMap[`p:${item.product_id}`] : null)
        || null,
    }));

    return NextResponse.json({ order: { ...data, items } });
  } catch (err) {
    console.error('Department order GET [id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/department-orders/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { status, shipping_carrier, tracking_number, tax_invoice_number, tax_invoice_date, notes } = body;

    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from('department_orders')
      .select('id, status')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (status) updateData.status = status;
    if (shipping_carrier !== undefined) updateData.shipping_carrier = shipping_carrier || null;
    if (tracking_number !== undefined) updateData.tracking_number = tracking_number || null;
    if (tax_invoice_number !== undefined) updateData.tax_invoice_number = tax_invoice_number || null;
    if (tax_invoice_date !== undefined) updateData.tax_invoice_date = tax_invoice_date || null;
    if (notes !== undefined) updateData.notes = notes || null;

    if (status === 'shipped') updateData.shipped_at = new Date().toISOString();
    if (status === 'invoiced') updateData.invoiced_at = new Date().toISOString();
    if (status === 'paid') updateData.paid_at = new Date().toISOString();

    const { error } = await supabaseAdmin
      .from('department_orders')
      .update(updateData)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Department order PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
