import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET /api/customers/order-context?customer_id=xxx
// Returns customer detail + shipping addresses + brand commissions + global brands + consignment settings
// in a single RPC call (replaces 4-5 separate API calls)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const customerId = new URL(request.url).searchParams.get('customer_id');
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('get_customer_order_context', {
      p_company_id: auth.companyId,
      p_customer_id: customerId,
    });

    if (error) {
      console.error('get_customer_order_context error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Customer order context error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
