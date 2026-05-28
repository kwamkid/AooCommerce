import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, canBulkEdit } from '@/lib/supabase-admin';

interface CreateCategoryItem {
  name: string;
  parent_name?: string;
  is_active?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!canBulkEdit(auth.companyRoles)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const { items, dry_run = false } = (await request.json()) as {
      items: CreateCategoryItem[];
      dry_run?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการ' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('bulk_create_categories', {
      p_company_id: auth.companyId,
      p_user_id: auth.userId,
      p_items: items,
      p_dry_run: dry_run,
    });

    if (error) {
      console.error('bulk_create_categories RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(data);
  } catch (error) {
    console.error('create-categories apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
