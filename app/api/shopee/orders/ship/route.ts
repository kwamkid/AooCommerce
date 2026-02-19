// Path: app/api/shopee/orders/ship/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  ensureValidToken,
  getShippingParameter,
  shipOrder,
} from '@/lib/shopee-api';

/**
 * POST - Accept/ship a Shopee order.
 * Calls Shopee Logistics API: get_shipping_parameter → ship_order
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { order_id } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
    }

    // 1. Fetch order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, source, external_order_sn, external_status, shopee_account_id, order_status')
      .eq('id', order_id)
      .eq('company_id', companyId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.source !== 'shopee') {
      return NextResponse.json({ error: 'Not a Shopee order' }, { status: 400 });
    }

    if (order.external_status !== 'READY_TO_SHIP') {
      return NextResponse.json({
        error: `ไม่สามารถรับออเดอร์ได้ สถานะปัจจุบัน: ${order.external_status}`,
      }, { status: 400 });
    }

    if (!order.shopee_account_id || !order.external_order_sn) {
      return NextResponse.json({ error: 'Missing Shopee account or order SN' }, { status: 400 });
    }

    // 2. Fetch Shopee account
    const { data: account, error: accError } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', order.shopee_account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Shopee account not found or inactive' }, { status: 404 });
    }

    // 3. Ensure valid token
    const creds = await ensureValidToken(account as ShopeeAccountRow);

    // 4. Get shipping parameters
    const { data: shippingParams, error: paramError } = await getShippingParameter(
      creds,
      order.external_order_sn
    );

    if (paramError) {
      console.error('[Shopee Ship] getShippingParameter error:', paramError);
      return NextResponse.json({ error: `ไม่สามารถดึงข้อมูลขนส่งได้: ${paramError}` }, { status: 500 });
    }

    console.log('[Shopee Ship] Shipping params:', JSON.stringify(shippingParams).substring(0, 1000));

    // 5. Determine pickup vs dropoff and call ship_order
    const params = shippingParams as {
      info_needed?: {
        pickup?: string[];
        dropoff?: string[];
        non_integrated?: string[];
      };
      pickup?: {
        address_list?: Array<{ address_id: number; address_flag?: string[] }>;
        time_slot_list?: Array<{ pickup_time_id: string; date: number }>;
      };
      dropoff?: {
        branch_list?: Array<{ branch_id: number }>;
      };
    };

    let shipResult;

    if (params.info_needed?.dropoff && params.info_needed.dropoff.length > 0) {
      // Dropoff mode
      const dropoffParams: Record<string, unknown> = {};
      if (params.dropoff?.branch_list?.[0]) {
        dropoffParams.branch_id = params.dropoff.branch_list[0].branch_id;
      }
      shipResult = await shipOrder(creds, order.external_order_sn, undefined, dropoffParams);
    } else {
      // Pickup mode (default)
      const pickupAddress = params.pickup?.address_list?.[0];
      const pickupTimeSlot = params.pickup?.time_slot_list?.[0];

      if (!pickupAddress) {
        return NextResponse.json({ error: 'ไม่พบที่อยู่รับพัสดุ กรุณาตั้งค่าใน Shopee Seller Center' }, { status: 400 });
      }

      const pickupParams = {
        address_id: pickupAddress.address_id,
        pickup_time_id: pickupTimeSlot?.pickup_time_id || '',
      };

      shipResult = await shipOrder(creds, order.external_order_sn, pickupParams);
    }

    if (shipResult.error) {
      console.error('[Shopee Ship] ship_order error:', shipResult.error);
      return NextResponse.json({ error: `รับออเดอร์ไม่สำเร็จ: ${shipResult.error}` }, { status: 500 });
    }

    console.log('[Shopee Ship] ship_order success:', JSON.stringify(shipResult.data).substring(0, 500));

    // 6. Update order in DB
    await supabaseAdmin
      .from('orders')
      .update({
        external_status: 'PROCESSED',
        order_status: 'shipping',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id)
      .eq('company_id', companyId);

    return NextResponse.json({
      success: true,
      external_status: 'PROCESSED',
      order_status: 'shipping',
    });
  } catch (error) {
    console.error('[Shopee Ship] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to ship order',
    }, { status: 500 });
  }
}
