// Path: app/api/reports/pending/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Helper: ตรวจสอบ auth
async function checkAuth(request: NextRequest): Promise<boolean> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return false;

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    return !error && !!user;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    console.log('Pending report API called');

    const isAuth = await checkAuth(request);
    console.log('Auth check result:', isAuth);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const groupBy = searchParams.get('group_by') || 'customer'; // customer, order
    console.log('Group by:', groupBy);

    // ดึง orders ที่ยังไม่ชำระ (payment_status = pending) และไม่ถูกยกเลิก
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        order_date,
        delivery_date,
        subtotal,
        discount_amount,
        vat_amount,
        total_amount,
        payment_status,
        order_status,
        payment_method,
        customer_id,
        customers (
          id,
          customer_code,
          name,
          contact_person,
          phone
        )
      `)
      .eq('payment_status', 'pending')
      .neq('order_status', 'cancelled')
      .order('delivery_date', { ascending: true });

    console.log('Query result - orders count:', orders?.length, 'error:', error);

    if (error) {
      console.error('Error fetching pending orders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate summary
    const summary = {
      totalOrders: orders?.length || 0,
      totalPending: 0,
      oldestPending: null as string | null,
      newestPending: null as string | null
    };

    orders?.forEach((order: any) => {
      summary.totalPending += order.total_amount || 0;
    });

    // Find oldest and newest delivery dates
    if (orders && orders.length > 0) {
      const sortedByDate = [...orders].sort((a, b) =>
        new Date(a.delivery_date || a.order_date).getTime() - new Date(b.delivery_date || b.order_date).getTime()
      );
      summary.oldestPending = sortedByDate[0]?.delivery_date || sortedByDate[0]?.order_date;
      summary.newestPending = sortedByDate[sortedByDate.length - 1]?.delivery_date || sortedByDate[sortedByDate.length - 1]?.order_date;
    }

    // Group data based on groupBy parameter
    let groupedData: any[] = [];

    if (groupBy === 'customer') {
      // Group by customer
      const customerMap = new Map();

      orders?.forEach((order: any) => {
        const customerId = order.customer_id;
        const customerName = order.customers?.name || 'ไม่ระบุ';
        const customerCode = order.customers?.customer_code || '-';
        const contactPerson = order.customers?.contact_person || '-';
        const phone = order.customers?.phone || '-';

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customerId,
            customerCode,
            customerName,
            contactPerson,
            phone,
            orderCount: 0,
            totalPending: 0,
            orders: []
          });
        }

        const customer = customerMap.get(customerId);
        customer.orderCount += 1;
        customer.totalPending += order.total_amount || 0;

        customer.orders.push({
          id: order.id,
          orderNumber: order.order_number,
          orderDate: order.order_date,
          deliveryDate: order.delivery_date,
          totalAmount: order.total_amount,
          orderStatus: order.order_status,
          paymentMethod: order.payment_method
        });
      });

      // Sort customers by total pending amount (highest first)
      groupedData = Array.from(customerMap.values())
        .sort((a, b) => b.totalPending - a.totalPending);

    } else {
      // Group by order (flat list)
      groupedData = (orders || []).map((order: any) => ({
        id: order.id,
        orderNumber: order.order_number,
        orderDate: order.order_date,
        deliveryDate: order.delivery_date,
        totalAmount: order.total_amount,
        orderStatus: order.order_status,
        paymentMethod: order.payment_method,
        customerId: order.customer_id,
        customerCode: order.customers?.customer_code || '-',
        customerName: order.customers?.name || 'ไม่ระบุ',
        contactPerson: order.customers?.contact_person || '-',
        phone: order.customers?.phone || '-'
      }));
    }

    return NextResponse.json({
      summary,
      groupedData,
      groupBy
    });

  } catch (error) {
    console.error('Pending report error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
