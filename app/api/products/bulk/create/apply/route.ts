import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  importCompositeProducts,
  hasComponents,
  type CreateResultRow,
  type FileProduct,
} from '@/lib/bulk/composite-import';

interface CreateItem {
  code: string;
  name?: string;
  variation_label?: string;
  attributes?: Record<string, string>;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
  brand_name?: string;
  category_name?: string;
  description?: string;
  is_active?: boolean;
  /** "SKU1 + SKU2×2" — any row of a code with components makes that code a composite product */
  components?: string;
  __rowNum?: number;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!can(auth, 'product.bulk_edit')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const canEditCost = auth.canViewCost === true;

    const { items, dry_run = false } = (await request.json()) as {
      items: CreateItem[];
      dry_run?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการ' }, { status: 400 });
    }

    // Group rows by product code (same grouping as the RPC) — a code with components on any
    // row is a composite product (สินค้าชุด), created in TS; the rest go to the RPC unchanged
    const groups = new Map<string, CreateItem[]>();
    for (const it of items) {
      if (!it.code) continue;
      groups.set(it.code, [...(groups.get(it.code) || []), it]);
    }
    const compositeCodes = new Set([...groups].filter(([, rows]) => rows.some(hasComponents)).map(([code]) => code));

    const normalItems = items
      .filter(it => !compositeCodes.has(it.code))
      .map(({ components: _c, ...rest }) => rest);
    const sanitized = canEditCost
      ? normalItems
      : normalItems.map(({ cost_price: _cost, ...rest }) => rest);

    // Normal products first — composites may reference the SKUs/codes they create
    let rpcResults: CreateResultRow[] = [];
    if (sanitized.length > 0) {
      const { data, error } = await supabaseAdmin.rpc('bulk_create_products', {
        p_company_id: auth.companyId,
        p_user_id: auth.userId,
        p_items: sanitized,
        p_dry_run: dry_run,
        p_can_edit_cost: canEditCost,
      });

      if (error) {
        console.error('bulk_create_products RPC error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      rpcResults = data?.results || [];
    }

    let compositeResults: CreateResultRow[] = [];
    if (compositeCodes.size > 0) {
      const created = new Set(rpcResults.filter(r => r.action === 'created').map(r => r.code));
      const fileProducts: FileProduct[] = dry_run
        ? [...groups]
            .filter(([code]) => !compositeCodes.has(code) && created.has(code))
            .map(([code, rows]) => ({
              code,
              name: rows[0].name || code,
              rows: rows.map(r => ({ variation_label: r.variation_label, sku: r.sku })),
            }))
        : [];
      compositeResults = await importCompositeProducts(supabaseAdmin, {
        companyId: auth.companyId,
        userId: auth.userId,
        groups: [...compositeCodes].map(code => [code, groups.get(code)!]),
        dryRun: dry_run,
        fileProducts,
      });
    }

    // Results back in file order
    const order = new Map([...groups.keys()].map((code, i) => [code, i]));
    const results = [...rpcResults, ...compositeResults].sort(
      (a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0),
    );

    return NextResponse.json({
      results,
      summary: {
        total: results.length,
        created: results.filter(r => r.action === 'created').length,
        errors: results.filter(r => r.action === 'error').length,
      },
      dry_run,
    });
  } catch (error) {
    console.error('create apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
