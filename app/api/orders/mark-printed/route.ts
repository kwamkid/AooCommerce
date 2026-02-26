import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { order_ids, print_type } = await request.json();

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'order_ids is required' }, { status: 400 });
    }

    const validTypes = ['label', 'packing', 'invoice'] as const;
    if (!print_type || !validTypes.includes(print_type)) {
      return NextResponse.json({ error: 'print_type must be label, packing, or invoice' }, { status: 400 });
    }

    const column = `printed_${print_type}_at`;

    const { error } = await supabaseAdmin
      .from('orders')
      .update({ [column]: new Date().toISOString() })
      .in('id', order_ids)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('mark-printed error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mark-printed server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
