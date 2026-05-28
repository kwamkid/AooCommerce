import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { unsplitOrder, ensureValidToken } from '@/lib/shopee/api';

export async function POST(req: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId || !can(companyRoles, 'order.split')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { order_id } = await req.json();

    if (!order_id) {
      return NextResponse.json({ error: 'ต้องระบุ order_id' }, { status: 400 });
    }

    // 1. Fetch order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, source, external_order_sn, marketplace_account_id, is_split')
      .eq('id', order_id)
      .eq('company_id', companyId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
    }
    if (order.order_status !== 'ready_to_ship') {
      return NextResponse.json({ error: 'สามารถยกเลิกแบ่งกล่องได้เฉพาะสถานะ "รอกดรับ" เท่านั้น' }, { status: 400 });
    }
    if (!order.is_split) {
      return NextResponse.json({ error: 'คำสั่งซื้อนี้ยังไม่ได้แบ่งกล่อง' }, { status: 400 });
    }

    // 2. If Shopee → call unsplit_order API
    if (order.source === 'shopee' && order.external_order_sn && order.marketplace_account_id) {
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', order.marketplace_account_id)
        .single();

      if (!account) {
        return NextResponse.json({ error: 'ไม่พบบัญชี Shopee' }, { status: 404 });
      }

      const creds = await ensureValidToken(account);
      if (!creds) {
        return NextResponse.json({ error: 'Shopee token หมดอายุ' }, { status: 401 });
      }

      const result = await unsplitOrder(creds, order.external_order_sn);
      if (result.error) {
        return NextResponse.json({ error: `Shopee unsplit failed: ${result.error}` }, { status: 400 });
      }
    }

    // 3. Delete parcel items first (FK constraint), then parcels
    const { data: parcels } = await supabaseAdmin
      .from('order_parcels')
      .select('id')
      .eq('order_id', order_id);

    if (parcels && parcels.length > 0) {
      const parcelIds = parcels.map(p => p.id);
      await supabaseAdmin
        .from('order_parcel_items')
        .delete()
        .in('parcel_id', parcelIds);

      await supabaseAdmin
        .from('order_parcels')
        .delete()
        .eq('order_id', order_id);
    }

    // 4. Mark order as not split
    await supabaseAdmin
      .from('orders')
      .update({ is_split: false, updated_at: new Date().toISOString() })
      .eq('id', order_id);

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[API] orders/unsplit error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
