// Path: app/api/crm/customers/route.ts
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
async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return { isAuth: false };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { isAuth: false };
    }

    return { isAuth: true, userId: user.id };
  } catch (error) {
    console.error('Auth check error:', error);
    return { isAuth: false };
  }
}

// GET - Get customers with CRM data (last order, total orders, LINE contact, etc.)
export async function GET(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const minDaysSinceOrder = searchParams.get('min_days');
    const maxDaysSinceOrder = searchParams.get('max_days');
    const hasOrders = searchParams.get('has_orders'); // 'true', 'false', or null (all)
    const sortBy = searchParams.get('sort_by') || 'days_since_last_order';
    const sortOrder = searchParams.get('sort_order') || 'desc';

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    // Step 1: Get all active customers
    let customersQuery = supabaseAdmin
      .from('customers')
      .select('id, customer_code, name, contact_person, phone, province, customer_type_new, is_active')
      .eq('is_active', true);

    if (search) {
      customersQuery = customersQuery.or(`name.ilike.%${search}%,customer_code.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: customers, error: customersError } = await customersQuery;

    if (customersError) {
      return NextResponse.json(
        { error: customersError.message },
        { status: 500 }
      );
    }

    if (!customers || customers.length === 0) {
      return NextResponse.json({
        customers: [],
        summary: {
          totalCustomers: 0,
          customersWithOrders: 0,
          customersNeverOrdered: 0,
          customersWithLine: 0,
          rangeCounts: {},
          dayRanges: []
        },
        pagination: { page: 1, limit, total: 0, totalPages: 0 }
      });
    }

    // Step 2: Get order stats for all customers
    const customerIds = customers.map(c => c.id);

    const { data: orderStats, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('customer_id, order_date, total_amount, order_status')
      .in('customer_id', customerIds)
      .neq('order_status', 'cancelled')
      .order('order_date', { ascending: false });

    if (ordersError) {
      console.error('Orders query error:', ordersError);
    }

    // Step 3: Get LINE contacts for customers
    const { data: lineContacts } = await supabaseAdmin
      .from('line_contacts')
      .select('customer_id, line_user_id, display_name')
      .in('customer_id', customerIds)
      .eq('status', 'active');

    // Build LINE contact map
    const lineContactMap = new Map<string, { line_user_id: string; display_name: string }>();
    (lineContacts || []).forEach(lc => {
      if (lc.customer_id) {
        lineContactMap.set(lc.customer_id, {
          line_user_id: lc.line_user_id,
          display_name: lc.display_name
        });
      }
    });

    // Build stats map per customer
    const customerStatsMap = new Map<string, {
      lastOrderDate: string | null;
      firstOrderDate: string | null;
      totalOrders: number;
      totalSpent: number;
      completedOrders: number;
      orderDates: string[];
    }>();

    // Initialize all customers with empty stats
    customers.forEach(c => {
      customerStatsMap.set(c.id, {
        lastOrderDate: null,
        firstOrderDate: null,
        totalOrders: 0,
        totalSpent: 0,
        completedOrders: 0,
        orderDates: []
      });
    });

    // Process orders (sorted desc by order_date)
    (orderStats || []).forEach(order => {
      const stats = customerStatsMap.get(order.customer_id);
      if (stats) {
        if (!stats.lastOrderDate && order.order_date) {
          stats.lastOrderDate = order.order_date;
        }
        if (order.order_date) {
          stats.firstOrderDate = order.order_date;
          stats.orderDates.push(order.order_date);
        }
        stats.totalOrders++;
        stats.totalSpent += order.total_amount || 0;
        if (order.order_status === 'completed') {
          stats.completedOrders++;
        }
      }
    });

    // Step 4: Calculate days since last order and enrich customer data
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enrichedCustomers = customers.map(customer => {
      const stats = customerStatsMap.get(customer.id)!;
      const lineContact = lineContactMap.get(customer.id);
      let daysSinceLastOrder: number | null = null;
      let avgOrderFrequency: number | null = null;

      if (stats.lastOrderDate) {
        const lastDate = new Date(stats.lastOrderDate);
        lastDate.setHours(0, 0, 0, 0);
        daysSinceLastOrder = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Calculate average order frequency (if has 2+ orders)
      if (stats.orderDates.length >= 2) {
        const sortedDates = stats.orderDates
          .map(d => new Date(d).getTime())
          .sort((a, b) => a - b);

        let totalGap = 0;
        for (let i = 1; i < sortedDates.length; i++) {
          totalGap += (sortedDates[i] - sortedDates[i - 1]) / (1000 * 60 * 60 * 24);
        }
        avgOrderFrequency = Math.round(totalGap / (sortedDates.length - 1));
      }

      return {
        ...customer,
        customer_type: customer.customer_type_new,
        last_order_date: stats.lastOrderDate,
        days_since_last_order: daysSinceLastOrder,
        avg_order_frequency: avgOrderFrequency,
        total_orders: stats.totalOrders,
        total_spent: stats.totalSpent,
        completed_orders: stats.completedOrders,
        // LINE contact info
        line_user_id: lineContact?.line_user_id || null,
        line_display_name: lineContact?.display_name || null
      };
    });

    // Step 5: Apply CRM filters
    let filteredCustomers = enrichedCustomers;

    // Filter by has_orders
    if (hasOrders === 'true') {
      filteredCustomers = filteredCustomers.filter(c => c.total_orders > 0);
    } else if (hasOrders === 'false') {
      filteredCustomers = filteredCustomers.filter(c => c.total_orders === 0);
    }

    // Filter by days since last order
    if (minDaysSinceOrder) {
      const minDays = parseInt(minDaysSinceOrder, 10);
      filteredCustomers = filteredCustomers.filter(c =>
        c.days_since_last_order !== null && c.days_since_last_order >= minDays
      );
    }

    if (maxDaysSinceOrder) {
      const maxDays = parseInt(maxDaysSinceOrder, 10);
      filteredCustomers = filteredCustomers.filter(c =>
        c.days_since_last_order !== null && c.days_since_last_order <= maxDays
      );
    }

    // Step 6: Sort
    filteredCustomers.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'days_since_last_order':
          if (a.days_since_last_order === null && b.days_since_last_order === null) comparison = 0;
          else if (a.days_since_last_order === null) comparison = 1;
          else if (b.days_since_last_order === null) comparison = -1;
          else comparison = a.days_since_last_order - b.days_since_last_order;
          break;
        case 'total_orders':
          comparison = a.total_orders - b.total_orders;
          break;
        case 'total_spent':
          comparison = a.total_spent - b.total_spent;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'last_order_date':
          if (!a.last_order_date && !b.last_order_date) comparison = 0;
          else if (!a.last_order_date) comparison = 1;
          else if (!b.last_order_date) comparison = -1;
          else comparison = new Date(a.last_order_date).getTime() - new Date(b.last_order_date).getTime();
          break;
        default:
          comparison = 0;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Get total before pagination
    const totalFiltered = filteredCustomers.length;

    // Step 7: Apply pagination
    const startIndex = (page - 1) * limit;
    const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + limit);

    // Fetch day ranges from CRM settings
    interface DayRange {
      minDays: number;
      maxDays: number | null;
      label: string;
      color: string;
    }

    let dayRanges: DayRange[] = [
      { minDays: 0, maxDays: 3, label: '0-3 วัน', color: 'green' },
      { minDays: 4, maxDays: 7, label: '4-7 วัน', color: 'yellow' },
      { minDays: 8, maxDays: 14, label: '8-14 วัน', color: 'orange' },
      { minDays: 15, maxDays: null, label: '15+ วัน', color: 'red' }
    ];

    try {
      const { data: settingsData } = await supabaseAdmin
        .from('crm_settings')
        .select('setting_value')
        .eq('setting_key', 'follow_up_day_ranges')
        .single();

      if (settingsData?.setting_value) {
        dayRanges = settingsData.setting_value;
      }
    } catch {
      // Use defaults if settings table doesn't exist
    }

    // Calculate dynamic summary based on configured day ranges
    const rangeCounts: Record<string, number> = {};
    dayRanges.forEach(range => {
      const key = `${range.minDays}-${range.maxDays ?? 'null'}`;
      rangeCounts[key] = enrichedCustomers.filter(c => {
        if (c.days_since_last_order === null) return false;
        const days = c.days_since_last_order;
        const inMin = days >= range.minDays;
        const inMax = range.maxDays === null || days <= range.maxDays;
        return inMin && inMax;
      }).length;
    });

    const summary = {
      totalCustomers: enrichedCustomers.length,
      customersWithOrders: enrichedCustomers.filter(c => c.total_orders > 0).length,
      customersNeverOrdered: enrichedCustomers.filter(c => c.total_orders === 0).length,
      customersWithLine: enrichedCustomers.filter(c => c.line_user_id).length,
      rangeCounts,
      dayRanges
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
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
