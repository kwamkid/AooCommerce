// Path: app/api/reports/sales/route.ts
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    console.log('Sales report API called');

    const { isAuth, companyId } = await checkAuthWithCompany(request);
    console.log('Auth check result:', isAuth, 'companyId:', companyId);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const groupBy = searchParams.get('group_by') || 'date'; // date, customer, product

    // Base query - ดึง orders ที่ไม่ถูกยกเลิก
    let query = supabaseAdmin
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
        customer_id,
        customers (
          id,
          customer_code,
          name
        ),
        order_items (
          id,
          product_name,
          product_code,
          bottle_size,
          quantity,
          unit_price,
          discount_amount,
          total
        )
      `)
      .eq('company_id', companyId)
      .neq('order_status', 'cancelled');

    // Filter by date range
    if (startDate) {
      query = query.gte('order_date', startDate);
    }
    if (endDate) {
      query = query.lte('order_date', endDate);
    }

    query = query.order('order_date', { ascending: false });

    const { data: orders, error } = await query;

    console.log('Query result - orders count:', orders?.length, 'error:', error);

    if (error) {
      console.error('Error fetching orders:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Calculate summary
    const summary = {
      totalOrders: orders?.length || 0,
      totalRevenue: 0,
      totalDiscount: 0,
      totalVat: 0,
      totalNet: 0,
      paidAmount: 0,
      pendingAmount: 0,
      averageOrderValue: 0
    };

    orders?.forEach((order: any) => {
      summary.totalRevenue += order.subtotal || 0;
      summary.totalDiscount += order.discount_amount || 0;
      summary.totalVat += order.vat_amount || 0;
      summary.totalNet += order.total_amount || 0;

      if (order.payment_status === 'paid') {
        summary.paidAmount += order.total_amount || 0;
      } else {
        summary.pendingAmount += order.total_amount || 0;
      }
    });

    if (summary.totalOrders > 0) {
      summary.averageOrderValue = summary.totalNet / summary.totalOrders;
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

        if (!customerMap.has(customerId)) {
          customerMap.set(customerId, {
            customerId,
            customerCode,
            customerName,
            orderCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            orders: []
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
          paymentStatus: order.payment_status
        });
      });

      groupedData = Array.from(customerMap.values())
        .sort((a, b) => b.totalAmount - a.totalAmount);

    } else if (groupBy === 'product') {
      // Group by product
      const productMap = new Map();

      orders?.forEach((order: any) => {
        order.order_items?.forEach((item: any) => {
          const productKey = `${item.product_code}-${item.bottle_size}`;

          if (!productMap.has(productKey)) {
            productMap.set(productKey, {
              productCode: item.product_code,
              productName: item.product_name,
              bottleSize: item.bottle_size,
              totalQuantity: 0,
              totalAmount: 0,
              orderCount: 0
            });
          }

          const product = productMap.get(productKey);
          product.totalQuantity += item.quantity || 0;
          product.totalAmount += item.total || 0;
          product.orderCount += 1;
        });
      });

      groupedData = Array.from(productMap.values())
        .sort((a, b) => b.totalAmount - a.totalAmount);

    } else {
      // Group by date (default)
      const dateMap = new Map();

      orders?.forEach((order: any) => {
        const date = order.order_date?.split('T')[0] || 'ไม่ระบุ';

        if (!dateMap.has(date)) {
          dateMap.set(date, {
            date,
            orderCount: 0,
            totalAmount: 0,
            paidAmount: 0,
            pendingAmount: 0,
            orders: []
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
          paymentStatus: order.payment_status
        });
      });

      groupedData = Array.from(dateMap.values())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    return NextResponse.json({
      summary,
      groupedData,
      groupBy,
      dateRange: {
        startDate: startDate || null,
        endDate: endDate || null
      }
    });

  } catch (error) {
    console.error('Sales report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
