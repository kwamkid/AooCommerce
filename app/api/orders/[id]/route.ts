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

    // Combine order with items
    const orderWithItems = {
      ...order,
      items: items || []
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
