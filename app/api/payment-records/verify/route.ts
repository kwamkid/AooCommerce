import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// POST - Verify or reject a payment record (admin only)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { payment_record_id, action } = await request.json();

    if (!payment_record_id || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!['verify', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    const newStatus = action === 'verify' ? 'verified' : 'rejected';

    const { error: updateError } = await supabaseAdmin
      .from('payment_records')
      .update({ status: newStatus })
      .eq('id', payment_record_id)
      .eq('company_id', auth.companyId);

    if (updateError) {
      console.error('Error updating payment record:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (error) {
    console.error('Error in payment-records verify:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
