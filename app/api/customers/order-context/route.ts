import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET /api/customers/order-context?customer_id=xxx
// Returns customer detail + shipping addresses + brand commissions + global brands + consignment settings
// in a single RPC call (replaces 4-5 separate API calls)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const customerId = new URL(request.url).searchParams.get('customer_id');
    if (!customerId) {
      return NextResponse.json({ error: 'customer_id required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('get_customer_order_context', {
      p_company_id: auth.companyId,
      p_customer_id: customerId,
    });

    if (error) {
      console.error('get_customer_order_context error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // RPC ยังไม่คืน is_recipient — เติมจากตารางตรง ๆ (ฟอร์มต้องแยก
    // "ที่อยู่ของลูกค้าเอง" กับ "ที่อยู่ผู้รับของขวัญ" ออกจากกัน)
    const addresses = (data as { shipping_addresses?: { id: string }[] } | null)?.shipping_addresses;
    if (Array.isArray(addresses) && addresses.length > 0) {
      const { data: flags, error: flagsError } = await supabaseAdmin
        .from('shipping_addresses')
        .select('id, is_recipient')
        .eq('company_id', auth.companyId)
        .eq('customer_id', customerId)
        .eq('is_active', true);
      if (flagsError) {
        console.error('shipping address recipient flags error:', flagsError);
      } else {
        const recipientIds = new Set(
          (flags || []).filter((f: { is_recipient: boolean | null }) => f.is_recipient).map((f: { id: string }) => f.id),
        );
        for (const addr of addresses) {
          (addr as { is_recipient?: boolean }).is_recipient = recipientIds.has(addr.id);
        }
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Customer order context error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
