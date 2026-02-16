import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransaction(tx: any, userMap: Record<string, string>) {
  let varLabel = '';
  const attrs = tx.attributes ?? tx.variation?.attributes;
  const bottleSize = tx.bottle_size ?? tx.variation?.bottle_size;
  if (attrs && typeof attrs === 'object') {
    varLabel = Object.values(attrs as Record<string, string>).join(' / ');
  } else if (bottleSize) {
    varLabel = bottleSize;
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
    warehouse_name: tx.warehouse_name ?? tx.warehouse?.name ?? '',
    warehouse_code: tx.warehouse_code ?? tx.warehouse?.code ?? '',
    product_code: tx.product_code ?? tx.variation?.product?.code ?? '',
    product_name: tx.product_name ?? tx.variation?.product?.name ?? '',
    sku: tx.sku ?? tx.variation?.sku ?? '',
    variation_label: varLabel,
    created_by_name: tx.created_by ? (userMap[tx.created_by] || '') : '',
  };
}

// GET - List inventory transactions
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id');
    const variationId = searchParams.get('variation_id');
    const type = searchParams.get('type');
    const search = searchParams.get('search');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = (page - 1) * limit;

    // Try flattened view first
    let query = supabaseAdmin
      .from('inventory_transactions_view')
      .select('*', { count: 'exact' })
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (warehouseId) query = query.eq('warehouse_id', warehouseId);
    if (variationId) query = query.eq('variation_id', variationId);
    if (type) query = query.eq('type', type);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59.999Z');

    if (search) {
      const s = `%${search}%`;
      query = query.or(`product_name.ilike.${s},product_code.ilike.${s},sku.ilike.${s},notes.ilike.${s}`);
    }

    const [stockConfig, viewResult] = await Promise.all([
      getStockConfig(auth.companyId!),
      query.range(offset, offset + limit - 1),
    ]);

    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any[] | null;
    let count: number | null;

    if (viewResult.error) {
      // Fallback: view not available, use legacy join query
      console.warn('inventory_transactions_view not available, using fallback:', viewResult.error.message);
      let fallbackQuery = supabaseAdmin
        .from('inventory_transactions')
        .select(`
          id, warehouse_id, variation_id, type, quantity, balance_after,
          reference_type, reference_id, notes, created_by, created_at,
          warehouse:warehouses(id, name, code),
          variation:product_variations(
            id, bottle_size, sku, attributes,
            product:products(id, code, name)
          )
        `, { count: 'exact' })
        .eq('company_id', auth.companyId)
        .order('created_at', { ascending: false });

      if (warehouseId) fallbackQuery = fallbackQuery.eq('warehouse_id', warehouseId);
      if (variationId) fallbackQuery = fallbackQuery.eq('variation_id', variationId);
      if (type) fallbackQuery = fallbackQuery.eq('type', type);
      if (dateFrom) fallbackQuery = fallbackQuery.gte('created_at', dateFrom);
      if (dateTo) fallbackQuery = fallbackQuery.lte('created_at', dateTo + 'T23:59:59.999Z');

      const fallbackResult = await fallbackQuery.range(offset, offset + limit - 1);
      if (fallbackResult.error) throw fallbackResult.error;

      // Apply search in JS for fallback
      let filtered = fallbackResult.data || [];
      if (search) {
        const s = search.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        filtered = filtered.filter((tx: any) => {
          const pName = tx.variation?.product?.name || '';
          const pCode = tx.variation?.product?.code || '';
          const sku = tx.variation?.sku || '';
          return pName.toLowerCase().includes(s) ||
            pCode.toLowerCase().includes(s) ||
            sku.toLowerCase().includes(s) ||
            (tx.notes || '').toLowerCase().includes(s);
        });
      }

      data = filtered;
      count = search ? filtered.length : (fallbackResult.count || 0);
    } else {
      data = viewResult.data;
      count = viewResult.count;
    }

    // Fetch user profiles for created_by
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userIds = [...new Set((data || []).map((tx: any) => tx.created_by).filter(Boolean))];
    const userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', userIds);
      (profiles || []).forEach((p: { id: string; name: string }) => {
        userMap[p.id] = p.name || '';
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions = (data || []).map((tx: any) => mapTransaction(tx, userMap));

    return NextResponse.json({
      transactions,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('GET inventory/transactions error:', error);
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
  }
}
