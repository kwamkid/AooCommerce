// Path: app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - Get dashboard stats
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
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
      .eq('company_id', auth.companyId)
      .gte('delivery_date', today.toISOString().split('T')[0])
      .lt('delivery_date', tomorrow.toISOString().split('T')[0])
      .in('order_status', ['new', 'shipping'])
      .order('delivery_date', { ascending: true });

    if (deliveriesError) {
      console.error('Deliveries error:', deliveriesError);
    }

    // Low stock items (stock feature - best effort, table may not exist)
    let lowStockCount = 0;
    try {
      const { data: inventoryItems, error: invError } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity, reserved_quantity')
        .eq('company_id', auth.companyId);

      if (!invError && inventoryItems) {
        lowStockCount = inventoryItems.filter(item => {
          const available = (item.quantity || 0) - (item.reserved_quantity || 0);
          return available <= 5 && available >= 0;
        }).length;
      }
    } catch {
      // Stock feature might not be enabled or table doesn't exist, ignore
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
      },
      lowStockCount,
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
