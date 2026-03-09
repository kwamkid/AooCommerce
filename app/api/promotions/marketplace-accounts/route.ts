import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - List active marketplace accounts for promotion pricing
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accounts, error } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('id, shop_name, platform, is_active')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('platform')
      .order('shop_name');

    if (error) throw error;

    return NextResponse.json({ accounts: accounts || [] });
  } catch (error) {
    console.error('Marketplace accounts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}
