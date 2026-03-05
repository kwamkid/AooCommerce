import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// PUT - Replace all brand GP commissions for a customer
// Body: { customer_id, rows: [{ brand_id, gp_rate }] }
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { customer_id, rows } = await request.json();

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    // Delete existing commissions for this customer
    const { error: deleteError } = await supabaseAdmin
      .from('customer_brand_commissions')
      .delete()
      .eq('company_id', auth.companyId)
      .eq('customer_id', customer_id);

    if (deleteError) throw deleteError;

    // Insert new rows (if any)
    if (rows && rows.length > 0) {
      const insertData = rows.map((r: { brand_id: string; gp_rate: number; gp_base_price?: string }) => ({
        company_id: auth.companyId,
        customer_id,
        brand_id: r.brand_id,
        gp_rate: Number(r.gp_rate),
        gp_base_price: r.gp_base_price || 'retail',
      }));

      const { error: insertError } = await supabaseAdmin
        .from('customer_brand_commissions')
        .insert(insertData);

      if (insertError) throw insertError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT customer-brand-commissions/sync error:', error);
    return NextResponse.json({ error: 'Failed to sync' }, { status: 500 });
  }
}
