import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTransaction(tx: any, userMap: Record<string, string>) {
  let varLabel = '';
  const attrs = tx.attributes ?? tx.variation?.attributes;
  const variationLabel = tx.variation_label ?? tx.variation?.variation_label;
  if (attrs && typeof attrs === 'object') {
    varLabel = Object.values(attrs as Record<string, string>).join(' / ');
  } else if (variationLabel) {
    varLabel = variationLabel;
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
    product_image: tx.product_image ?? null,
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
    // Convert bare dates to Bangkok timezone (UTC+7) boundaries
    if (dateFrom) query = query.gte('created_at', dateFrom.includes('T') ? dateFrom : dateFrom + 'T00:00:00+07:00');
    if (dateTo) query = query.lte('created_at', dateTo.includes('T') ? dateTo : dateTo + 'T23:59:59.999+07:00');

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
            id, variation_label, sku, attributes,
            product:products(id, code, name)
          )
        `, { count: 'exact' })
        .eq('company_id', auth.companyId)
        .order('created_at', { ascending: false });

      if (warehouseId) fallbackQuery = fallbackQuery.eq('warehouse_id', warehouseId);
      if (variationId) fallbackQuery = fallbackQuery.eq('variation_id', variationId);
      if (type) fallbackQuery = fallbackQuery.eq('type', type);
      if (dateFrom) fallbackQuery = fallbackQuery.gte('created_at', dateFrom.includes('T') ? dateFrom : dateFrom + 'T00:00:00+07:00');
      if (dateTo) fallbackQuery = fallbackQuery.lte('created_at', dateTo.includes('T') ? dateTo : dateTo + 'T23:59:59.999+07:00');

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

    // Fetch user profiles + product images in parallel
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userIds = [...new Set((data || []).map((tx: any) => tx.created_by).filter(Boolean))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const variationIds = [...new Set((data || []).map((tx: any) => tx.variation_id).filter(Boolean))];

    const userMap: Record<string, string> = {};
    const imageMap: Record<string, string> = {};

    const [profilesResult, imagesResult] = await Promise.all([
      userIds.length > 0
        ? supabaseAdmin.from('user_profiles').select('id, name').in('id', userIds)
        : Promise.resolve({ data: null }),
      variationIds.length > 0
        ? supabaseAdmin.from('product_images').select('variation_id, image_url').in('variation_id', variationIds).order('sort_order', { ascending: true })
        : Promise.resolve({ data: null }),
    ]);

    (profilesResult.data || []).forEach((p: { id: string; name: string }) => {
      userMap[p.id] = p.name || '';
    });
    // First image per variation wins
    (imagesResult.data || []).forEach((img: { variation_id: string; image_url: string }) => {
      if (!imageMap[img.variation_id]) imageMap[img.variation_id] = img.image_url;
    });

    // Also check product.image for variations without product_images
    if (variationIds.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const missingImageVarIds = variationIds.filter((vid: string) => !imageMap[vid]);
      if (missingImageVarIds.length > 0) {
        const { data: pvData } = await supabaseAdmin
          .from('product_variations')
          .select('id, product:products(image)')
          .in('id', missingImageVarIds);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (pvData || []).forEach((pv: any) => {
          if (pv.product?.image) imageMap[pv.id] = pv.product.image;
        });
      }
    }

    // Attach images to data rows
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data || []).forEach((tx: any) => {
      if (tx.variation_id && imageMap[tx.variation_id]) {
        tx.product_image = imageMap[tx.variation_id];
      }
    });

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
