import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { NextRequest, NextResponse } from 'next/server';

// GET - Get total unread message count across all chat platforms
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    // Count unread from all platforms in parallel
    // ⚠️ บวกเองจากแถวที่ดึงมา — ร้านที่มีห้องค้างอ่านเกิน 1,000 ห้องต่อแพลตฟอร์มจะได้
    //    เลขแจ้งเตือนตัน (กรอง unread > 0 แล้วจึงไม่ค่อยหนัก แต่ที่ถูกจริง ๆ ควรให้ DB SUM)
    const [lineResult, fbResult, shopeeResult, lazadaResult, tiktokResult] = await Promise.all([
      fetchAllRows<{ unread_count: number }>((from, to) => supabaseAdmin
        .from('line_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0)
        .range(from, to)),
      fetchAllRows<{ unread_count: number }>((from, to) => supabaseAdmin
        .from('fb_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0)
        .range(from, to)),
      fetchAllRows<{ unread_count: number }>((from, to) => supabaseAdmin
        .from('shopee_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0)
        .range(from, to)),
      fetchAllRows<{ unread_count: number }>((from, to) => supabaseAdmin
        .from('lazada_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0)
        .range(from, to)),
      fetchAllRows<{ unread_count: number }>((from, to) => supabaseAdmin
        .from('tiktok_contacts')
        .select('unread_count')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .gt('unread_count', 0)
        .range(from, to)),
    ]);

    let total = 0;
    lineResult.rows.forEach(c => { total += c.unread_count || 0; });
    fbResult.rows.forEach(c => { total += c.unread_count || 0; });
    shopeeResult.rows.forEach(c => { total += c.unread_count || 0; });
    lazadaResult.rows.forEach(c => { total += c.unread_count || 0; });
    tiktokResult.rows.forEach(c => { total += c.unread_count || 0; });

    return NextResponse.json({ unread: total });
  } catch (error) {
    console.error('Unread count error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
