import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// GET - List inventory transactions
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const stockConfig = await getStockConfig(auth.userId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id');
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('inventory_transactions')
      .select(`
        id, warehouse_id, variation_id, type, quantity, balance_after,
        reference_type, reference_id, notes, created_by, created_at,
        warehouse:warehouses(id, name, code),
        variation:product_variations(
          id, bottle_size, sku, attributes,
          product:products(id, code, name)
        ),
        user:users(id, name)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    if (type) query = query.eq('type', type);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) throw error;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions = (data || []).map((tx: any) => {
      const variation = tx.variation;
      const product = variation?.product;
      const warehouse = tx.warehouse;
      const user = tx.user;

      let varLabel = '';
      if (variation?.attributes && typeof variation.attributes === 'object') {
        varLabel = Object.values(variation.attributes as Record<string, string>).join(' / ');
      } else if (variation?.bottle_size) {
        varLabel = variation.bottle_size;
      }

      return {
        id: tx.id,
        type: tx.type,
        quantity: tx.quantity,
        balance_after: tx.balance_after,
        reference_type: tx.reference_type,
        reference_id: tx.reference_id,
        notes: tx.notes,
        created_at: tx.created_at,
        warehouse_name: warehouse?.name || '',
        warehouse_code: warehouse?.code || '',
        product_code: product?.code || '',
        product_name: product?.name || '',
        sku: variation?.sku || '',
        variation_label: varLabel,
        created_by_name: user?.name || '',
      };
    });

    // Apply search filter (post-query since it spans multiple joined fields)
    let filtered = transactions;
    if (search) {
      const s = search.toLowerCase();
      filtered = transactions.filter((tx: { product_name: string; product_code: string; sku: string; notes: string | null }) =>
        tx.product_name.toLowerCase().includes(s) ||
        tx.product_code.toLowerCase().includes(s) ||
        tx.sku.toLowerCase().includes(s) ||
        (tx.notes || '').toLowerCase().includes(s)
      );
    }

    return NextResponse.json({
      transactions: filtered,
      total: search ? filtered.length : (count || 0),
      page,
      limit,
    });
  } catch (error) {
    console.error('GET inventory/transactions error:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
