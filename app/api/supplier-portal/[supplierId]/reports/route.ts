// Path: app/api/supplier-portal/[supplierId]/reports/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { validatePortalAccess } from '@/lib/supplier-portal/validate';

// GET - Snapshot list for this supplier
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ supplierId: string }> }
) {
  try {
    const { supplierId } = await params;
    const result = await validatePortalAccess(supplierId);

    if (!result.valid || !result.context) {
      return NextResponse.json({ error: 'Portal unavailable' }, { status: 403 });
    }

    const { companyId } = result.context;

    // Only show confirmed/sent snapshots (not drafts)
    const { data, error } = await supabaseAdmin
      .from('supplier_snapshots')
      .select(`
        id, supplier_type, period_year, period_month, snapshot_date, status,
        total_stock_remaining, total_sold_quantity, total_sold_amount,
        total_received_quantity, total_received_amount,
        created_at
      `)
      .eq('company_id', companyId)
      .eq('supplier_id', supplierId)
      .in('status', ['confirmed', 'sent'])
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false });

    if (error) {
      console.error('Portal reports list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ snapshots: data || [] });
  } catch (error) {
    console.error('Portal reports list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
