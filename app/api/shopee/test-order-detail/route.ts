import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ShopeeAccountRow, ensureValidToken, shopeeApiRequest } from '@/lib/shopee/api';

/**
 * GET /api/shopee/test-order-detail?order_sn=260307G6PJU8M2
 * If order_sn is omitted, fetches the latest 3 orders from Shopee API.
 * Returns RAW Shopee response for debugging buyer info (name/phone/address masking).
 * Auth: x-test-key header = SHOPEE_PARTNER_KEY
 */
export async function GET(request: NextRequest) {
  const testKey = request.headers.get('x-test-key');
  if (testKey !== process.env.SHOPEE_PARTNER_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orderSn = request.nextUrl.searchParams.get('order_sn');

  // Get first active Shopee account
  const { data: account, error: accError } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .single();

  if (accError || !account) {
    return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
  }

  try {
    const creds = await ensureValidToken(account as ShopeeAccountRow);

    // If no order_sn, fetch latest orders from get_order_list first
    let orderSnList = orderSn || '';
    if (!orderSnList) {
      const now = Math.floor(Date.now() / 1000);
      const fourteenDaysAgo = now - 14 * 24 * 60 * 60;
      const statuses = ['READY_TO_SHIP', 'PROCESSED', 'SHIPPED', 'COMPLETED', 'UNPAID'];

      for (const status of statuses) {
        const { data: listData, error: listError } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_list', {
          time_range_field: 'create_time',
          time_from: fourteenDaysAgo,
          time_to: now,
          page_size: 3,
          cursor: '',
          order_status: status,
        });
        if (!listError) {
          const orders = (listData as { order_list?: { order_sn: string }[] })?.order_list || [];
          if (orders.length > 0) {
            orderSnList = orders.map(o => o.order_sn).join(',');
            break;
          }
        }
      }

      if (!orderSnList) {
        return NextResponse.json({ error: 'No orders found in last 14 days across all statuses' }, { status: 404 });
      }
    }

    const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
      order_sn_list: orderSnList,
      response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,item_list,pay_time,shipping_carrier,checkout_shipping_carrier,tracking_number,total_amount,payment_method,estimated_shipping_fee,actual_shipping_fee,actual_shipping_fee_confirmed,note,buyer_cancel_reason,cancel_by,cancel_reason,ship_by_date,days_to_ship,package_list,invoice_data',
    });

    if (error) {
      return NextResponse.json({ error, raw: data }, { status: 400 });
    }

    // Extract just buyer-related fields for easy reading
    const orderList = (data as { order_list?: Record<string, unknown>[] })?.order_list || [];
    const buyerSummary = orderList.map((o: Record<string, unknown>) => ({
      order_sn: o.order_sn,
      buyer_user_id: o.buyer_user_id,
      buyer_username: o.buyer_username,
      recipient_address: o.recipient_address,
    }));

    // Also try get_shipping_document_data_info for first order to get unmasked data as images
    let shippingDocData: unknown = null;
    const firstOrder = orderList[0];
    if (firstOrder) {
      const firstOrderSn = firstOrder.order_sn as string;
      // Get package number if available
      const pkgList = (firstOrder.package_list as { package_number: string }[] | undefined);
      const pkgNumber = pkgList?.[0]?.package_number;

      // Try 1: without recipient_address_info (just logistics info)
      const docParams1: Record<string, unknown> = { order_sn: firstOrderSn };
      if (pkgNumber) docParams1.package_number = pkgNumber;

      const { data: docData1, error: docError1 } = await shopeeApiRequest(
        creds, 'GET', '/api/v2/logistics/get_shipping_document_data_info', docParams1
      );

      // Try 2: with recipient_address_info
      const addrInfo = [
        { key: 'name', style: { font_size: 14 } },
        { key: 'phone', style: { font_size: 14 } },
        { key: 'full_address', style: { font_size: 12 } },
      ];
      const docParams2: Record<string, unknown> = {
        order_sn: firstOrderSn,
        recipient_address_info: JSON.stringify(addrInfo),
      };
      if (pkgNumber) docParams2.package_number = pkgNumber;

      const { data: docData2, error: docError2 } = await shopeeApiRequest(
        creds, 'GET', '/api/v2/logistics/get_shipping_document_data_info', docParams2
      );

      shippingDocData = {
        without_addr_info: docError1 ? { error: docError1 } : docData1,
        with_addr_info: docError2 ? { error: docError2 } : docData2,
        params_used: { order_sn: firstOrderSn, package_number: pkgNumber },
      };
    }

    return NextResponse.json({
      buyer_summary: buyerSummary,
      shipping_document_data_info: shippingDocData,
      raw_response: data,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'API call failed',
    }, { status: 500 });
  }
}
