import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { newAccessCode } from '@/lib/portal-access';


// POST — Generate/regenerate consignment dealer portal access code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'customer.edit')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' }, { status: 403 });
    }

    const { id } = await params;

    // Verify customer belongs to company and is consignment_dealer
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('id, customer_type')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }
    if (customer.customer_type !== 'consignment_dealer') {
      return NextResponse.json({ error: 'Only consignment dealers have portal access' }, { status: 400 });
    }

    // Generate unique code (retry on collision)
    let accessCode = newAccessCode();
    let retries = 5;
    while (retries > 0) {
      const { data, error } = await supabaseAdmin
        .from('customers')
        .update({ portal_access_code: accessCode, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .select('id, portal_access_code, portal_token')
        .single();

      if (!error && data) {
        return NextResponse.json({ data });
      }

      if (error?.code === '23505') {
        accessCode = newAccessCode();
        retries--;
        continue;
      }

      throw error;
    }

    return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 });
  } catch (error) {
    console.error('POST regenerate-portal-code error:', error);
    return NextResponse.json({ error: 'Failed to regenerate code' }, { status: 500 });
  }
}
