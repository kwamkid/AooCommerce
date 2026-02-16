import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: accounts, error } = await supabaseAdmin
      .from('shopee_accounts')
      .select('id, company_id, shop_id, shop_name, is_active, last_sync_at, access_token_expires_at, refresh_token_expires_at, metadata, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Add connection status to each account
    const now = new Date();
    const accountsWithStatus = (accounts || []).map(a => {
      const refreshExpiry = a.refresh_token_expires_at ? new Date(a.refresh_token_expires_at) : null;
      const isExpired = refreshExpiry ? refreshExpiry.getTime() < now.getTime() : true;
      return {
        ...a,
        connection_status: !a.is_active ? 'disconnected' : isExpired ? 'expired' : 'connected',
      };
    });

    return NextResponse.json(accountsWithStatus);
  } catch (error) {
    console.error('Shopee accounts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    // Soft delete - set is_active to false and clear tokens
    const { error } = await supabaseAdmin
      .from('shopee_accounts')
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shopee accounts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to disconnect shop' }, { status: 500 });
  }
}
