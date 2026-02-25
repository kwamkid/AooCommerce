import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

/**
 * GET - Lightweight count of orders in "ready_to_ship" status.
 * Used by sidebar badge (polled / realtime).
 */
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { count, error } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('order_status', 'ready_to_ship');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ count: count || 0 });
  } catch (error) {
    console.error('[Orders Ready Count] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
