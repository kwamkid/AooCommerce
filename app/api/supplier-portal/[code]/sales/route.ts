// Path: app/api/supplier-portal/[code]/sales/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePortalAccess, getSupplierVariationIds } from '@/lib/supplier-portal/validate';

// GET - Sales data (consignment only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;
    const result = await validatePortalAccess(code);

    if (!result.valid || !result.context) {
      return NextResponse.json({ error: 'Portal unavailable' }, { status: 403 });
    }

    const { supplierId, companyId, supplierType } = result.context;

    if (supplierType !== 'consignment') {
      return NextResponse.json({ error: 'Sales data available for consignment suppliers only' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const now = new Date();
    const year = parseInt(searchParams.get('year') || String(now.getFullYear()));
    const month = parseInt(searchParams.get('month') || String(now.getMonth() + 1));

    const variationIds = await getSupplierVariationIds(supplierId, companyId);

    if (variationIds.length === 0) {
      return NextResponse.json({ sales: [], total_quantity: 0, total_revenue: 0 });
    }

    // Date range
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;

    // Query completed orders
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select(`
        variation_id, quantity, subtotal,
        order:orders!inner(id, source, pos_terminal_id, order_date, order_status)
      `)
      .in('variation_id', variationIds)
      .gte('order.order_date', startDate)
      .lt('order.order_date', endDate)
      .eq('order.order_status', 'completed')
      .eq('order.company_id', companyId);

    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ sales: [], total_quantity: 0, total_revenue: 0 });
    }

    // Fetch variation info (no customer data exposed)
    const varIds = [...new Set(orderItems.map(oi => oi.variation_id))];
    const { data: variations } = await supabaseAdmin
      .from('product_variations')
      .select(`
        id, variation_label, sku, barcode,
        product:products(id, code, name, image)
      `)
      .in('id', varIds);
    const varMap = Object.fromEntries((variations || []).map(v => [v.id, v]));

    // Group by variation + source
    const salesMap = new Map<string, { variation_id: string; source: string; quantity_sold: number; revenue: number }>();
    for (const oi of orderItems) {
      const order = oi.order as unknown as { source: string };
      const key = `${oi.variation_id}_${order.source}`;
      const existing = salesMap.get(key);
      if (existing) {
        existing.quantity_sold += Number(oi.quantity);
        existing.revenue += Number(oi.subtotal || 0);
      } else {
        salesMap.set(key, {
          variation_id: oi.variation_id,
          source: order.source || 'manual',
          quantity_sold: Number(oi.quantity),
          revenue: Number(oi.subtotal || 0),
        });
      }
    }

    const sales = Array.from(salesMap.values()).map(s => ({
      ...s,
      variation: varMap[s.variation_id] || null,
    }));

    const totalQuantity = sales.reduce((s, r) => s + r.quantity_sold, 0);
    const totalRevenue = sales.reduce((s, r) => s + r.revenue, 0);

    return NextResponse.json({ sales, total_quantity: totalQuantity, total_revenue: totalRevenue });
  } catch (error) {
    console.error('Portal sales error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
