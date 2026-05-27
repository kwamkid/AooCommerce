import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

interface CreateItem {
  code: string;
  name?: string;
  variation_label?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
  brand_name?: string;
  category_name?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminRole(auth.companyRoles)) {
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

    const sanitized = canEditCost
      ? items
      : items.map(({ cost_price: _cost, ...rest }) => rest);

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

    return NextResponse.json(data);
  } catch (error) {
    console.error('create apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
