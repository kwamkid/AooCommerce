// Path: app/api/crm/payment-followup/route.ts
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

// Helper: Check auth
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
    const isAuth = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const minDays = searchParams.get('min_days'); // Filter by aging
    const maxDays = searchParams.get('max_days');
    const dateFrom = searchParams.get('date_from'); // e.g. '2025-01-01'
    const dateTo = searchParams.get('date_to'); // e.g. '2025-01-31'
    const sortBy = searchParams.get('sort_by') || 'days_overdue';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Get all unpaid orders (payment_status = pending/verifying) that are not cancelled
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        order_date,
        delivery_date,
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
          phone,
          credit_days
        )
      `)
      .in('payment_status', ['pending', 'verifying'])
      .neq('order_status', 'cancelled');

    // Apply date range filter on order_date
    if (dateFrom) {
      ordersQuery = ordersQuery.gte('order_date', dateFrom);
    }
    if (dateTo) {
      ordersQuery = ordersQuery.lte('order_date', dateTo);
    }

    const { data: orders, error } = await ordersQuery
      .order('order_date', { ascending: true });

    if (error) {
      console.error('Error fetching orders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get LINE contacts linked to customers
    const customerIds = [...new Set((orders || []).map((o: any) => o.customer_id).filter(Boolean))];
    let lineContactMap = new Map<string, { line_user_id: string; display_name: string }>();

    if (customerIds.length > 0) {
      const { data: lineContacts } = await supabaseAdmin
        .from('line_contacts')
        .select('customer_id, line_user_id, display_name')
        .in('customer_id', customerIds)
        .eq('status', 'active');

      (lineContacts || []).forEach((lc: any) => {
        if (lc.customer_id) {
          lineContactMap.set(lc.customer_id, {
            line_user_id: lc.line_user_id,
            display_name: lc.display_name
          });
        }
      });
    }

    // Group orders by customer
    const customerMap = new Map<string, {
      customerId: string;
      customerCode: string;
      customerName: string;
      contactPerson: string;
      phone: string;
      creditDays: number;
      totalPending: number;
      orderCount: number;
      oldestOrderDate: string;
      newestOrderDate: string;
      daysOverdue: number; // Days since oldest unpaid order
      lineUserId: string | null;
      lineDisplayName: string | null;
      orders: Array<{
        id: string;
        orderNumber: string;
        orderDate: string;
        deliveryDate: string | null;
        totalAmount: number;
        orderStatus: string;
        paymentStatus: string;
        daysAgo: number;
      }>;
    }>();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    (orders || []).forEach((order: any) => {
      const customerId = order.customer_id;
      if (!customerId) return;

      const customer = order.customers;
      const lineContact = lineContactMap.get(customerId);
      const orderDate = new Date(order.order_date);
      const daysAgo = Math.floor((today.getTime() - orderDate.getTime()) / (1000 * 60 * 60 * 24));

      if (!customerMap.has(customerId)) {
        customerMap.set(customerId, {
          customerId,
          customerCode: customer?.customer_code || '-',
          customerName: customer?.name || 'ไม่ระบุ',
          contactPerson: customer?.contact_person || '-',
          phone: customer?.phone || '-',
          creditDays: customer?.credit_days || 0,
          totalPending: 0,
          orderCount: 0,
          oldestOrderDate: order.order_date,
          newestOrderDate: order.order_date,
          daysOverdue: daysAgo,
          lineUserId: lineContact?.line_user_id || null,
          lineDisplayName: lineContact?.display_name || null,
          orders: []
        });
      }

      const cust = customerMap.get(customerId)!;
      cust.totalPending += order.total_amount || 0;
      cust.orderCount += 1;

      // Update oldest/newest dates
      if (order.order_date < cust.oldestOrderDate) {
        cust.oldestOrderDate = order.order_date;
        cust.daysOverdue = daysAgo;
      }
      if (order.order_date > cust.newestOrderDate) {
        cust.newestOrderDate = order.order_date;
      }

      cust.orders.push({
        id: order.id,
        orderNumber: order.order_number,
        orderDate: order.order_date,
        deliveryDate: order.delivery_date,
        totalAmount: order.total_amount,
        orderStatus: order.order_status,
        paymentStatus: order.payment_status,
        daysAgo
      });
    });

    // Convert to array
    let customers = Array.from(customerMap.values());

    // Apply search filter
    if (search) {
      const searchLower = search.toLowerCase();
      customers = customers.filter(c =>
        c.customerName.toLowerCase().includes(searchLower) ||
        c.customerCode.toLowerCase().includes(searchLower) ||
        c.phone.includes(search) ||
        c.contactPerson.toLowerCase().includes(searchLower)
      );
    }

    // Apply days filter (based on oldest order date)
    if (minDays) {
      const min = parseInt(minDays, 10);
      customers = customers.filter(c => c.daysOverdue >= min);
    }
    if (maxDays) {
      const max = parseInt(maxDays, 10);
      customers = customers.filter(c => c.daysOverdue <= max);
    }

    // Sort
    customers.sort((a, b) => {
      let aVal: any, bVal: any;

      switch (sortBy) {
        case 'days_overdue':
          aVal = a.daysOverdue;
          bVal = b.daysOverdue;
          break;
        case 'total_pending':
          aVal = a.totalPending;
          bVal = b.totalPending;
          break;
        case 'order_count':
          aVal = a.orderCount;
          bVal = b.orderCount;
          break;
        case 'oldest_order':
          aVal = new Date(a.oldestOrderDate).getTime();
          bVal = new Date(b.oldestOrderDate).getTime();
          break;
        case 'name':
          aVal = a.customerName;
          bVal = b.customerName;
          break;
        default:
          aVal = a.daysOverdue;
          bVal = b.daysOverdue;
      }

      if (sortOrder === 'asc') {
        return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      } else {
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
      }
    });

    // Get total before pagination
    const totalFiltered = customers.length;

    // Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedCustomers = customers.slice(startIndex, startIndex + limit);

    // Calculate summary
    const allCustomers = Array.from(customerMap.values());
    const summary = {
      totalCustomers: allCustomers.length,
      totalOrders: allCustomers.reduce((sum, c) => sum + c.orderCount, 0),
      totalPending: allCustomers.reduce((sum, c) => sum + c.totalPending, 0),
      customersWithLine: allCustomers.filter(c => c.lineUserId).length,
      rangeCounts: {
        '0-7': allCustomers.filter(c => c.daysOverdue >= 0 && c.daysOverdue <= 7).length,
        '8-14': allCustomers.filter(c => c.daysOverdue >= 8 && c.daysOverdue <= 14).length,
        '15-30': allCustomers.filter(c => c.daysOverdue >= 15 && c.daysOverdue <= 30).length,
        '31-60': allCustomers.filter(c => c.daysOverdue >= 31 && c.daysOverdue <= 60).length,
        '61-null': allCustomers.filter(c => c.daysOverdue > 60).length
      },
      dayRanges: [
        { minDays: 0, maxDays: 7, label: '0-7 วัน', color: 'green' },
        { minDays: 8, maxDays: 14, label: '8-14 วัน', color: 'yellow' },
        { minDays: 15, maxDays: 30, label: '15-30 วัน', color: 'orange' },
        { minDays: 31, maxDays: 60, label: '31-60 วัน', color: 'red' },
        { minDays: 61, maxDays: null, label: '60+ วัน', color: 'purple' }
      ]
    };

    return NextResponse.json({
      customers: paginatedCustomers,
      summary,
      pagination: {
        page,
        limit,
        total: totalFiltered,
        totalPages: Math.ceil(totalFiltered / limit)
      }
    });

  } catch (error) {
    console.error('Payment follow-up API error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
