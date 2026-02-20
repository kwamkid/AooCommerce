import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// GET - Get total unread message count across all chat platforms
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    // Count unread from both platforms in parallel
    const [lineResult, fbResult] = await Promise.all([
      supabaseAdmin
        .from('line_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
      supabaseAdmin
        .from('fb_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0),
    ]);

    let total = 0;
    (lineResult.data || []).forEach(c => { total += c.unread_count || 0; });
    (fbResult.data || []).forEach(c => { total += c.unread_count || 0; });

    return NextResponse.json({ unread: total });
  } catch (error) {
    console.error('Unread count error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
