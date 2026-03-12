// Temporary endpoint to list and cleanup orphaned Add-on Deals on Shopee
// DELETE this file after use

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ensureValidToken, ShopeeAccountRow } from '@/lib/shopee/api';
import { getAddOnDealList, getAddOnDealMainItems, deleteAddOnDeal } from '@/lib/shopee/deals';

export async function POST(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { account_id, action, deal_id } = body;

  if (!account_id) {
    return NextResponse.json({ error: 'account_id required' }, { status: 400 });
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', account_id)
    .eq('company_id', companyId)
    .eq('platform', 'shopee')
    .single();

  if (!account) {
    return NextResponse.json({ error: 'Account not found' }, { status: 404 });
  }

  const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);

  // Action: list — list all add-on deals
  if (action === 'list') {
    const result = await getAddOnDealList(creds, 'upcoming');
    const ongoing = await getAddOnDealList(creds, 'ongoing');
    return NextResponse.json({
      upcoming: result,
      ongoing: ongoing,
    });
  }

  // Action: inspect — get main items of a specific deal
  if (action === 'inspect' && deal_id) {
    const mainItems = await getAddOnDealMainItems(creds, deal_id);
    return NextResponse.json({ deal_id, ...mainItems });
  }

  // Action: delete — delete a specific deal
  if (action === 'delete' && deal_id) {
    await deleteAddOnDeal(creds, deal_id);
    return NextResponse.json({ deleted: deal_id });
  }

  return NextResponse.json({ error: 'Invalid action. Use: list, inspect, delete' }, { status: 400 });
}
