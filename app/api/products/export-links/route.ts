import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const variationIds = new URL(request.url).searchParams.get('variation_ids')?.split(',').filter(Boolean);
    if (!variationIds || variationIds.length === 0) {
      return NextResponse.json([]);
    }

    const { data } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('variation_id, account_id, platform_price, platform_discount_price')
      .eq('company_id', auth.companyId)
      .eq('sync_enabled', true)
      .in('variation_id', variationIds);

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Export links error:', error);
    return NextResponse.json({ error: 'Failed to fetch links' }, { status: 500 });
  }
}
