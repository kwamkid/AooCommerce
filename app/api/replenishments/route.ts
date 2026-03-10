import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { reserveStock } from '@/lib/stock-service';

// GET /api/replenishments
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || '';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('replenishments')
      .select(`
        id,
        replenishment_number,
        status,
        notes,
        total_amount,
        confirmed_total,
        shipping_method,
        shipping_carrier,
        tracking_number,
        receive_token,
        shipped_at,
        received_at,
        receiver_name,
        receive_photo_url,
        printed_packing_at,
        printed_dn_at,
        printed_label_at,
        created_at,
        customer:customers(id, name, customer_code, phone, customer_type),
        created_by_profile:user_profiles!replenishments_created_by_fkey(id, name),
        replenishment_items(id)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      // "received" tab includes both received and partial_received
      if (status === 'received') {
        query = query.in('status', ['received', 'partial_received']);
      } else {
        query = query.eq('status', status);
      }
    }

    if (search) {
      // Find matching customer IDs first (can't filter on joined table directly)
      const { data: matchingCustomers } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('company_id', auth.companyId)
        .ilike('name', `%${search}%`);

      const customerIds = (matchingCustomers || []).map((c: { id: string }) => c.id);

      if (customerIds.length > 0) {
        query = query.or(
          `replenishment_number.ilike.%${search}%,customer_id.in.(${customerIds.join(',')})`
        );
      } else {
        query = query.ilike('replenishment_number', `%${search}%`);
      }
    }

    query = query.range(offset, offset + limit - 1);

    const { data: replenishments, error, count } = await query;

    if (error) {
      console.error('Replenishments GET error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Status counts for tab badges
    const { data: statusRows } = await supabaseAdmin
      .from('replenishments')
      .select('status')
      .eq('company_id', auth.companyId);

    const statusCounts: Record<string, number> = {};
    for (const row of statusRows || []) {
      const s = (row as { status: string }).status;
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    }
    // Merge partial_received count into received for tab badge
    if (statusCounts['partial_received']) {
      statusCounts['received'] = (statusCounts['received'] || 0) + statusCounts['partial_received'];
    }

    return NextResponse.json({
      replenishments: replenishments || [],
      pagination: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      },
      status_counts: statusCounts,
    });
  } catch (err) {
    console.error('Replenishments GET unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/replenishments
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customer_id, warehouse_id, notes, internal_notes, items, shipping_fee } = body;

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 });
    }

    // Validate customer is consignment_dealer
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, customer_type')
      .eq('id', customer_id)
      .eq('company_id', auth.companyId)
      .single();

    if (!customer || customer.customer_type !== 'consignment_dealer') {
      return NextResponse.json({ error: 'Customer must be consignment_dealer type' }, { status: 400 });
    }

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: { quantity: number; unit_price: number }) =>
      sum + (item.quantity || 0) * (item.unit_price || 0), 0);

    // Generate running number
    const { data: numberData, error: numberError } = await supabaseAdmin
      .rpc('generate_replenishment_number', { p_company_id: auth.companyId });

    if (numberError) {
      return NextResponse.json({ error: 'Failed to generate replenishment number' }, { status: 500 });
    }

    // Insert replenishment
    const { data: replenishment, error: insertError } = await supabaseAdmin
      .from('replenishments')
      .insert({
        company_id: auth.companyId,
        replenishment_number: numberData,
        customer_id,
        warehouse_id: warehouse_id || null,
        status: 'pending',
        notes: notes || null,
        internal_notes: internal_notes || null,
        total_amount: totalAmount,
        created_by: auth.userId,
        receive_token: crypto.randomUUID(),
      })
      .select('id, replenishment_number')
      .single();

    if (insertError || !replenishment) {
      console.error('Replenishment insert error:', insertError);
      return NextResponse.json({ error: insertError?.message || 'Failed to create' }, { status: 500 });
    }

    // Insert items
    const itemRows = items.map((item: {
      product_id?: string;
      variation_id?: string;
      product_name: string;
      variation_label?: string;
      quantity: number;
      unit_price: number;
      brand_id?: string;
      default_price?: number;
      discount_price?: number;
      gp_rate?: number;
      gp_base_price?: string;
      gp_level?: number;
      sku?: string;
    }, index: number) => ({
      replenishment_id: replenishment.id,
      product_id: item.product_id || null,
      variation_id: item.variation_id || null,
      product_name: item.product_name,
      variation_label: item.variation_label || null,
      quantity: item.quantity,
      unit_price: item.unit_price || 0,
      brand_id: item.brand_id || null,
      default_price: item.default_price || 0,
      discount_price: item.discount_price || 0,
      gp_rate: item.gp_rate ?? null,
      gp_base_price: item.gp_base_price || null,
      gp_level: item.gp_level ?? null,
      sku: item.sku || null,
      sort_order: index,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('replenishment_items')
      .insert(itemRows);

    if (itemsError) {
      console.error('Replenishment items insert error:', itemsError);
      // Rollback replenishment
      await supabaseAdmin.from('replenishments').delete().eq('id', replenishment.id);
      return NextResponse.json({ error: itemsError.message }, { status: 500 });
    }

    // Reserve stock on source warehouse (if warehouse_id provided)
    if (warehouse_id) {
      for (const item of items as { variation_id?: string; quantity: number }[]) {
        if (!item.variation_id) continue;
        const qty = item.quantity || 0;
        if (qty <= 0) continue;

        await reserveStock({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: warehouse_id,
          variationId: item.variation_id,
          qty,
          referenceType: 'replenishment',
          referenceId: replenishment.id,
          notes: `จองสต๊อกสำหรับใบเติมสินค้า ${replenishment.replenishment_number}`,
          createdBy: auth.userId,
        });
      }
    }

    return NextResponse.json({
      success: true,
      id: replenishment.id,
      replenishment_number: replenishment.replenishment_number,
    });
  } catch (err) {
    console.error('Replenishments POST unhandled error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
