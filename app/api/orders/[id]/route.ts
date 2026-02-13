import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// GET - Get single order by ID
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { error: 'No authorization header' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
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
      .eq('order_id', orderId);

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
