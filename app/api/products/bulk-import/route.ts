import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

interface ImportItem {
  product_id?: string;
  variation_id?: string;
  code: string;
  name: string;
  variation_label?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const canEditCost = auth.canViewCost === true;

    const { items, dry_run = false } = (await request.json()) as {
      items: ImportItem[];
      dry_run?: boolean;
    };

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items to import' }, { status: 400 });
    }

    // Strip cost_price from payload if user lacks permission (defense-in-depth)
    const sanitizedItems = canEditCost
      ? items
      : items.map(({ cost_price: _cost_price, ...rest }) => rest);

    const { data, error } = await supabaseAdmin.rpc('bulk_upsert_products', {
      p_company_id: auth.companyId,
      p_user_id: auth.userId,
      p_items: sanitizedItems,
      p_dry_run: dry_run,
      p_can_edit_cost: canEditCost,
    });

    if (error) {
      console.error('bulk_upsert_products RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = data as {
      results: Array<{
        code: string;
        name: string;
        action: string;
        changes?: Array<{ field: string; from?: unknown; to?: unknown }>;
        price_changed?: boolean;
        product_id?: string;
        variation_id?: string;
        error?: string;
      }>;
      summary: { total: number; created: number; updated: number; unchanged: number; errors: number };
      dry_run: boolean;
    };

    // Trigger marketplace sync for price changes (only on real import, not dry-run)
    if (!dry_run) {
      const priceChangedVarIds = result.results
        .filter(r => r.price_changed && r.variation_id)
        .map(r => r.variation_id as string);

      if (priceChangedVarIds.length > 0) {
        triggerMarketplaceSync(priceChangedVarIds).catch(() => {});
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function triggerMarketplaceSync(variationIds: string[]) {
  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, account_id, platform')
    .in('variation_id', variationIds)
    .eq('sync_enabled', true);

  if (!links || links.length === 0) return;

  const seen = new Set<string>();
  for (const link of links) {
    const key = `${link.product_id}:${link.account_id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (link.platform === 'shopee') {
      import('@/lib/shopee/auto-sync').then(m => {
        m.triggerShopeePriceSync(link.product_id);
      }).catch(() => {});
    }
  }
}
