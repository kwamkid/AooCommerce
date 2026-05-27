import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

interface ApplyItem {
  product_id: string;
  code?: string;
  name?: string;
  is_active?: boolean;
  brand_name?: string;
  category_name?: string;
  description?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Permission: owner/admin only
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const { items, dry_run = false } = (await request.json()) as {
      items: ApplyItem[];
      dry_run?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการ' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('bulk_update_product_basic_info', {
      p_company_id: auth.companyId,
      p_items: items,
      p_dry_run: dry_run,
    });

    if (error) {
      console.error('bulk_update_product_basic_info RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('basic-info apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
