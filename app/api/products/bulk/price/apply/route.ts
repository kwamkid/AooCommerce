import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, canBulkEdit } from '@/lib/supabase-admin';

interface ApplyItem {
  product_id?: string;
  variation_id: string;
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

    if (!canBulkEdit(auth.companyRoles)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const canEditCost = auth.canViewCost === true;

    const { items, dry_run = false } = (await request.json()) as {
      items: ApplyItem[];
      dry_run?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการ' }, { status: 400 });
    }

    // Defense-in-depth: strip cost_price if user lacks permission
    const sanitized = canEditCost
      ? items
      : items.map(({ cost_price: _cost, ...rest }) => rest);

    const { data, error } = await supabaseAdmin.rpc('bulk_update_variation_prices', {
      p_company_id: auth.companyId,
      p_items: sanitized,
      p_dry_run: dry_run,
      p_can_edit_cost: canEditCost,
    });

    if (error) {
      console.error('bulk_update_variation_prices RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('price apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
