import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

export async function PUT(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if ('error' in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const stockConfig = await getStockConfig(auth.companyId!);
  if (!stockConfig.stockEnabled) {
    return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
  }

  try {
    const body = await request.json();

    // Bulk update ALL variations for this company
    if (body.all === true && typeof body.min_stock === 'number' && body.min_stock >= 0) {
      const minStock = Math.floor(body.min_stock);
      // Get all active variation IDs for this company
      const { data: allVariations } = await supabaseAdmin
        .from('product_variations')
        .select('id, product:products!inner(company_id, is_active)')
        .eq('products.company_id', auth.companyId!)
        .eq('products.is_active', true);

      const ids = (allVariations || []).map((v: { id: string }) => v.id);
      if (ids.length === 0) {
        return NextResponse.json({ success: true, updated: 0 });
      }

      // Batch update in chunks of 500
      let totalUpdated = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { error } = await supabaseAdmin
          .from('product_variations')
          .update({ min_stock: minStock, updated_at: new Date().toISOString() })
          .in('id', chunk);
        if (error) throw error;
        totalUpdated += chunk.length;
      }

      return NextResponse.json({ success: true, updated: totalUpdated });
    }

    const { items } = body as { items: { variation_id: string; min_stock: number }[] };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    // Validate values
    for (const item of items) {
      if (!item.variation_id || typeof item.min_stock !== 'number' || item.min_stock < 0) {
        return NextResponse.json({ error: 'Invalid item: variation_id and min_stock >= 0 required' }, { status: 400 });
      }
    }

    // Verify all variation_ids belong to this company
    const variationIds = items.map(i => i.variation_id);
    const { data: validVariations } = await supabaseAdmin
      .from('product_variations')
      .select('id, product:products!inner(company_id)')
      .in('id', variationIds)
      .eq('products.company_id', auth.companyId!);

    const validIds = new Set((validVariations || []).map((v: { id: string }) => v.id));
    const validItems = items.filter(i => validIds.has(i.variation_id));

    if (validItems.length === 0) {
      return NextResponse.json({ error: 'No valid items found' }, { status: 404 });
    }

    // Group by min_stock value for batch efficiency
    const groupedByValue: Record<number, string[]> = {};
    for (const item of validItems) {
      const key = Math.floor(item.min_stock);
      if (!groupedByValue[key]) groupedByValue[key] = [];
      groupedByValue[key].push(item.variation_id);
    }

    let totalUpdated = 0;
    for (const [minStock, ids] of Object.entries(groupedByValue)) {
      const { error } = await supabaseAdmin
        .from('product_variations')
        .update({ min_stock: Number(minStock), updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;
      totalUpdated += ids.length;
    }

    return NextResponse.json({ success: true, updated: totalUpdated });
  } catch (error) {
    console.error('Error updating min stock:', error);
    return NextResponse.json({ error: 'Failed to update min stock' }, { status: 500 });
  }
}
