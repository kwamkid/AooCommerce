// Path: app/api/reports/sales/route.ts
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSummary(row: any) {
  return {
    totalOrders: Number(row.total_orders) || 0,
    totalRevenue: Number(row.total_revenue) || 0,
    totalDiscount: Number(row.total_discount) || 0,
    totalVat: Number(row.total_vat) || 0,
    totalNet: Number(row.total_net) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    pendingAmount: Number(row.pending_amount) || 0,
    averageOrderValue: Number(row.total_orders) > 0
      ? Number(row.total_net) / Number(row.total_orders)
      : 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeSummaryFromOrders(orders: any[]) {
  const summary = {
    totalOrders: orders.length,
    totalRevenue: 0,
    totalDiscount: 0,
    totalVat: 0,
    totalNet: 0,
    paidAmount: 0,
    pendingAmount: 0,
    averageOrderValue: 0,
  };
  for (const order of orders) {
    summary.totalRevenue += order.subtotal || 0;
    summary.totalDiscount += order.discount_amount || 0;
    summary.totalVat += order.vat_amount || 0;
    summary.totalNet += order.total_amount || 0;
    if (order.payment_status === 'paid') {
      summary.paidAmount += order.total_amount || 0;
    } else {
      summary.pendingAmount += order.total_amount || 0;
    }
  }
  if (summary.totalOrders > 0) {
    summary.averageOrderValue = summary.totalNet / summary.totalOrders;
  }
  return summary;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupByCustomer(orders: any[]) {
  const customerMap = new Map();
  for (const order of orders) {
    const customerId = order.customer_id;
    const customerName = order.customers?.name || 'ไม่ระบุ';
    const customerCode = order.customers?.customer_code || '-';
    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId,
        customerCode,
        customerName,
        orderCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        orders: [],
      });
    }
    const customer = customerMap.get(customerId);
    customer.orderCount += 1;
    customer.totalAmount += order.total_amount || 0;
    if (order.payment_status === 'paid') {
      customer.paidAmount += order.total_amount || 0;
    } else {
      customer.pendingAmount += order.total_amount || 0;
    }
    customer.orders.push({
      id: order.id,
      orderNumber: order.order_number,
      orderDate: order.order_date,
      totalAmount: order.total_amount,
      paymentStatus: order.payment_status,
    });
  }
  return Array.from(customerMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupByDate(orders: any[]) {
  const dateMap = new Map();
  for (const order of orders) {
    const date = order.order_date?.split('T')[0] || 'ไม่ระบุ';
    if (!dateMap.has(date)) {
      dateMap.set(date, {
        date,
        orderCount: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        orders: [],
      });
    }
    const dateGroup = dateMap.get(date);
    dateGroup.orderCount += 1;
    dateGroup.totalAmount += order.total_amount || 0;
    if (order.payment_status === 'paid') {
      dateGroup.paidAmount += order.total_amount || 0;
    } else {
      dateGroup.pendingAmount += order.total_amount || 0;
    }
    dateGroup.orders.push({
      id: order.id,
      orderNumber: order.order_number,
      customerName: order.customers?.name || 'ไม่ระบุ',
      totalAmount: order.total_amount,
      paymentStatus: order.payment_status,
    });
  }
  return Array.from(dateMap.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function groupByProduct(orders: any[]) {
  const productMap = new Map();
  for (const order of orders) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const item of (order.order_items || []) as any[]) {
      const productKey = `${item.product_code}-${item.bottle_size}`;
      if (!productMap.has(productKey)) {
        productMap.set(productKey, {
          productCode: item.product_code,
          productName: item.product_name,
          bottleSize: item.bottle_size,
          totalQuantity: 0,
          totalAmount: 0,
          orderCount: 0,
        });
      }
      const product = productMap.get(productKey);
      product.totalQuantity += item.quantity || 0;
      product.totalAmount += item.total || 0;
      product.orderCount += 1;
    }
  }
  return Array.from(productMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const groupBy = searchParams.get('group_by') || 'date';

    const rpcParams = {
      p_company_id: companyId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
    };

    // === Product groupBy: fully DB-side (no individual orders needed) ===
    if (groupBy === 'product') {
      const [summaryResult, productResult] = await Promise.all([
        supabaseAdmin.rpc('get_sales_summary', rpcParams),
        supabaseAdmin.rpc('get_sales_by_product', rpcParams),
      ]);

      // If RPCs work, use DB aggregation
      if (!summaryResult.error && !productResult.error) {
        const summaryRow = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
        const summary = mapSummary(summaryRow || {});
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const groupedData = (productResult.data || []).map((row: any) => ({
          productCode: row.product_code,
          productName: row.product_name,
          bottleSize: row.bottle_size,
          totalQuantity: Number(row.total_quantity),
          totalAmount: Number(row.total_amount),
          orderCount: Number(row.order_count),
        }));

        return NextResponse.json({ summary, groupedData, groupBy, dateRange: { startDate, endDate } });
      }

      // Fallback: legacy JS aggregation
      console.warn('Sales RPC not available, using fallback:', summaryResult.error?.message || productResult.error?.message);
      return legacyReport(companyId, startDate, endDate, groupBy);
    }

    // === Date/Customer groupBy: summary from RPC + orders for drilldown (no order_items) ===
    let ordersQuery = supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, order_date, subtotal, discount_amount, vat_amount,
        total_amount, payment_status, customer_id,
        customers (customer_code, name)
      `)
      .eq('company_id', companyId)
      .neq('order_status', 'cancelled');
    if (startDate) ordersQuery = ordersQuery.gte('order_date', startDate);
    if (endDate) ordersQuery = ordersQuery.lte('order_date', endDate);
    ordersQuery = ordersQuery.order('order_date', { ascending: false });

    const [summaryResult, ordersResult] = await Promise.all([
      supabaseAdmin.rpc('get_sales_summary', rpcParams),
      ordersQuery,
    ]);

    if (ordersResult.error) {
      console.error('Error fetching orders:', ordersResult.error);
      return NextResponse.json({ error: ordersResult.error.message }, { status: 500 });
    }

    const orders = ordersResult.data || [];

    // Summary: prefer RPC, fallback to JS
    let summary;
    if (!summaryResult.error && summaryResult.data) {
      const s = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
      summary = mapSummary(s || {});
    } else {
      console.warn('get_sales_summary RPC not available, computing from orders');
      summary = computeSummaryFromOrders(orders);
    }

    const groupedData = groupBy === 'customer'
      ? groupByCustomer(orders)
      : groupByDate(orders);

    return NextResponse.json({ summary, groupedData, groupBy, dateRange: { startDate, endDate } });

  } catch (error) {
    console.error('Sales report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Full legacy fallback (when RPCs don't exist)
async function legacyReport(companyId: string, startDate: string | null, endDate: string | null, groupBy: string) {
  let query = supabaseAdmin
    .from('orders')
    .select(`
      id, order_number, order_date, subtotal, discount_amount, vat_amount,
      total_amount, payment_status, customer_id,
      customers (id, customer_code, name),
      order_items (id, product_name, product_code, bottle_size, quantity, unit_price, discount_amount, total)
    `)
    .eq('company_id', companyId)
    .neq('order_status', 'cancelled');
  if (startDate) query = query.gte('order_date', startDate);
  if (endDate) query = query.lte('order_date', endDate);
  query = query.order('order_date', { ascending: false });

  const { data: orders, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const summary = computeSummaryFromOrders(orders || []);

  let groupedData;
  if (groupBy === 'customer') {
    groupedData = groupByCustomer(orders || []);
  } else if (groupBy === 'product') {
    groupedData = groupByProduct(orders || []);
  } else {
    groupedData = groupByDate(orders || []);
  }

  return NextResponse.json({ summary, groupedData, groupBy, dateRange: { startDate, endDate } });
}
