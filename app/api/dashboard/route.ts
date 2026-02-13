// Path: app/api/dashboard/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Create Supabase Admin client (service role)
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

// Helper function: Check authentication
async function checkAuth(request: NextRequest): Promise<boolean> {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return false;
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

// GET - Get dashboard stats
export async function GET(request: NextRequest) {
  try {
    const isAuth = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Orders to deliver today
    const { data: todayDeliveries, error: deliveriesError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        delivery_date,
        order_status,
        total_amount,
        customers (
          id,
          name,
          phone
        )
      `)
      .gte('delivery_date', today.toISOString().split('T')[0])
      .lt('delivery_date', tomorrow.toISOString().split('T')[0])
      .in('order_status', ['new', 'shipping'])
      .order('delivery_date', { ascending: true });

    if (deliveriesError) {
      console.error('Deliveries error:', deliveriesError);
    }

    // Format the data
    const stats = {
      todayDeliveries: {
        count: todayDeliveries?.length || 0,
        orders: (todayDeliveries || []).map((order: any) => ({
          id: order.id,
          orderNumber: order.order_number,
          deliveryDate: order.delivery_date,
          status: order.order_status,
          totalAmount: order.total_amount,
          customer: {
            id: order.customers?.id,
            name: order.customers?.name,
            phone: order.customers?.phone
          }
        }))
      }
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
