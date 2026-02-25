// Path: app/api/shopee/orders/shipping-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  type ShopeeCredentials,
  ensureValidToken,
  getShippingParameter,
  shipOrder,
  getTrackingNumber,
  getShippingDocumentParameter,
  createShippingDocument,
  getShippingDocumentResult,
  downloadShippingDocument,
} from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';

/**
 * POST - Generate and download Shopee shipping label PDF.
 * Correct flow per Shopee API docs:
 *   1. If order is READY_TO_SHIP → auto-ship first
 *   2. get_tracking_number → get tracking number
 *   3. get_shipping_document_parameter → get suggested document type
 *   4. create_shipping_document (with tracking_number + shipping_document_type)
 *   5. get_shipping_document_result → poll until READY
 *   6. download_shipping_document
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let companyId = '';
  let accountId = '';
  let accountName = '';

  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    companyId = auth.companyId;

    const body = await request.json();
    const { order_id } = body;

    if (!order_id) {
      return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
    }

    // 1. Fetch order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, source, external_order_sn, external_status, marketplace_account_id, order_status, is_split')
      .eq('id', order_id)
      .eq('company_id', companyId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.source !== 'shopee') {
      return NextResponse.json({ error: 'Not a Shopee order' }, { status: 400 });
    }

    if (!order.marketplace_account_id || !order.external_order_sn) {
      return NextResponse.json({ error: 'Missing Shopee account or order SN' }, { status: 400 });
    }

    accountId = order.marketplace_account_id;

    // 2. Fetch Shopee account
    const { data: account, error: accError } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', order.marketplace_account_id)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Shopee account not found or inactive' }, { status: 404 });
    }

    accountName = account.shop_name || '';
    const creds = await ensureValidToken(account as ShopeeAccountRow);
    const orderSn = order.external_order_sn;

    // For split orders, get parcel package_numbers
    let packageNumbers: string[] = [];
    if (order.is_split) {
      const { data: parcels } = await supabaseAdmin
        .from('order_parcels')
        .select('id, parcel_number, package_number')
        .eq('order_id', order_id)
        .order('parcel_number');

      packageNumbers = (parcels || [])
        .map(p => p.package_number)
        .filter((pn): pn is string => !!pn);
    }

    // 3. If order is still READY_TO_SHIP in our DB, auto-ship first
    if (order.external_status === 'READY_TO_SHIP') {
      const shipError = await autoShipOrder(creds, orderSn, order.is_split ? packageNumbers : undefined);
      if (shipError) {
        logDoc(companyId, accountId, accountName, 'error', shipError, order_id, orderSn, startTime, '/api/v2/logistics/ship_order');
        return NextResponse.json({ error: shipError }, { status: 500 });
      }

      // Update DB
      await supabaseAdmin.from('orders').update({
        external_status: 'PROCESSED',
        order_status: 'processing', // PROCESSED = processing (ที่ต้องจัดส่ง), NOT shipping!
        updated_at: new Date().toISOString(),
      }).eq('id', order_id).eq('company_id', companyId);

      // Wait for Shopee to process the shipment
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 4. Get tracking number
    const trackingResult = await getTrackingNumber(creds, orderSn);
    const trackingNumber = trackingResult.tracking_number || '';
    console.log(`[Shopee Doc] Tracking for ${orderSn}: ${trackingNumber || 'none'}`);

    // 5. Get shipping document parameter — tells us which document type to use
    // For split orders, include package_number in the request
    const docParamOrderList = order.is_split && packageNumbers.length > 0
      ? packageNumbers.map(pn => ({ order_sn: orderSn, package_number: pn }))
      : [{ order_sn: orderSn }];

    // Use raw API for split orders since getShippingDocumentParameter only takes order_sn list
    const docParamResult = await getShippingDocumentParameter(creds, [orderSn]);
    const docParam = docParamResult.resultList?.find(r => r.order_sn === orderSn);

    if (docParam?.fail_error) {
      const failError = docParam.fail_error;
      const failMessage = docParam.fail_message || failError;

      if (failError.includes('can_not_print_jit_order')) {
        const msg = 'ช่องทางขนส่งนี้พิมพ์ใบปะหน้าได้จาก Shopee Seller Center เท่านั้น';
        logDoc(companyId, accountId, accountName, 'error', msg, order_id, orderSn, startTime, '/api/v2/logistics/get_shipping_document_parameter', docParam);
        return NextResponse.json({ error: msg }, { status: 400 });
      }

      console.error(`[Shopee Doc] get_shipping_document_parameter error for ${orderSn}:`, failError, failMessage);
      logDoc(companyId, accountId, accountName, 'error', failMessage, order_id, orderSn, startTime, '/api/v2/logistics/get_shipping_document_parameter', docParam);
      return NextResponse.json({ error: `ดึงข้อมูลใบปะหน้าไม่สำเร็จ: ${failMessage}` }, { status: 500 });
    }

    const suggestedDocType = docParam?.suggest_shipping_document_type || 'NORMAL_AIR_WAYBILL';
    console.log(`[Shopee Doc] Suggested doc type for ${orderSn}: ${suggestedDocType}, selectable: ${JSON.stringify(docParam?.selectable_shipping_document_type)}`);

    // 6. Create shipping document with tracking_number and correct document type
    // For split orders, create document for each package
    const createOrderList = order.is_split && packageNumbers.length > 0
      ? packageNumbers.map(pn => ({
          order_sn: orderSn,
          package_number: pn,
          tracking_number: trackingNumber || undefined,
          shipping_document_type: suggestedDocType,
        }))
      : [{
          order_sn: orderSn,
          tracking_number: trackingNumber || undefined,
          shipping_document_type: suggestedDocType,
        }];

    const createResult = await createShippingDocument(creds, createOrderList);

    let skipPolling = false;

    if (createResult.error) {
      const resultItem = createResult.resultList?.find(r => r.order_sn === orderSn);
      const failError = resultItem?.fail_error || '';
      const failMessage = resultItem?.fail_message || createResult.error;

      if (failError.includes('package_can_not_print') || failMessage.includes('has been shipped')) {
        console.log(`[Shopee Doc] Document already exists for ${orderSn}, trying direct download`);
        skipPolling = true;
      } else if (failError.includes('can_not_print_jit_order')) {
        const msg = 'ช่องทางขนส่งนี้พิมพ์ใบปะหน้าได้จาก Shopee Seller Center เท่านั้น';
        logDoc(companyId, accountId, accountName, 'error', msg, order_id, orderSn, startTime, '/api/v2/logistics/create_shipping_document', resultItem);
        return NextResponse.json({ error: msg }, { status: 400 });
      } else {
        console.error(`[Shopee Doc] createShippingDocument error for ${orderSn}:`, failError, failMessage);
        logDoc(companyId, accountId, accountName, 'error', `สร้างใบปะหน้าไม่สำเร็จ: ${failMessage}`, order_id, orderSn, startTime, '/api/v2/logistics/create_shipping_document', resultItem);
        return NextResponse.json({ error: `สร้างใบปะหน้าไม่สำเร็จ: ${failMessage}` }, { status: 500 });
      }
    }

    // 7. Poll for document readiness
    if (!skipPolling) {
      const MAX_POLLS = 15;
      let documentReady = false;

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const pollOrderList = order.is_split && packageNumbers.length > 0
          ? packageNumbers.map(pn => ({
              order_sn: orderSn,
              package_number: pn,
              shipping_document_type: suggestedDocType,
            }))
          : [{
              order_sn: orderSn,
              shipping_document_type: suggestedDocType,
            }];

        const { data: resultData, error: resultError } = await getShippingDocumentResult(creds, pollOrderList);
        if (resultError) {
          console.error(`[Shopee Doc] poll ${i + 1} error:`, resultError);
          continue;
        }

        const result = resultData as {
          result_list?: Array<{ order_sn: string; status: string; fail_error?: string; fail_message?: string }>;
        };

        const orderResult = result.result_list?.find(r => r.order_sn === orderSn);
        console.log(`[Shopee Doc] Poll ${i + 1}/${MAX_POLLS}: status=${orderResult?.status}`);

        if (orderResult?.status === 'READY') {
          documentReady = true;
          break;
        }

        // For split orders, check if ALL packages are ready
        if (order.is_split && result.result_list) {
          const allReady = result.result_list.every(r => r.status === 'READY');
          if (allReady) {
            documentReady = true;
            break;
          }
        }

        if (orderResult?.status === 'FAILED') {
          const msg = orderResult.fail_message || 'สร้างใบปะหน้าไม่สำเร็จ';
          logDoc(companyId, accountId, accountName, 'error', msg, order_id, orderSn, startTime, '/api/v2/logistics/get_shipping_document_result', orderResult);
          return NextResponse.json({ error: msg }, { status: 500 });
        }
      }

      if (!documentReady) {
        return NextResponse.json({ error: 'ใบปะหน้ายังไม่พร้อม กรุณาลองใหม่อีกครั้ง' }, { status: 408 });
      }
    }

    // 8. Download the PDF
    // For split orders, Shopee returns all package labels in one download
    const { pdfBuffer, error: downloadError } = await downloadShippingDocument(creds, [orderSn], suggestedDocType);

    if (downloadError || !pdfBuffer) {
      console.error('[Shopee Doc] downloadShippingDocument error:', downloadError);

      const dlErr = String(downloadError || '');
      let userMessage: string;

      if (dlErr.includes('should_print_first') || dlErr.includes('should print first')) {
        userMessage = 'ใบปะหน้ายังไม่พร้อมในระบบ Shopee — กรุณาพิมพ์จาก Shopee Seller Center หรือรอสักครู่แล้วลองใหม่';
      } else {
        userMessage = `ดาวน์โหลดใบปะหน้าไม่สำเร็จ: ${downloadError}`;
      }

      logDoc(companyId, accountId, accountName, 'error', userMessage, order_id, orderSn, startTime, '/api/v2/logistics/download_shipping_document', { downloadError });
      return NextResponse.json({ error: userMessage }, { status: 500 });
    }

    // 9. Success — log and return PDF
    logDoc(companyId, accountId, accountName, 'success', undefined, order_id, orderSn, startTime);
    console.log(`[Shopee Doc] Label downloaded for ${orderSn} (${Date.now() - startTime}ms)`);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="shopee-label-${orderSn}.pdf"`,
        'Content-Length': String(pdfBuffer.length),
      },
    });
  } catch (error) {
    console.error('[Shopee Doc] Error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate shipping document';
    if (companyId && accountId) {
      logDoc(companyId, accountId, accountName, 'error', msg, '', '', startTime);
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────

/** Auto-ship an order that's still READY_TO_SHIP. Handles split orders by shipping each parcel. */
async function autoShipOrder(creds: ShopeeCredentials, orderSn: string, packageNumbers?: string[]): Promise<string | null> {
  console.log(`[Shopee Doc] Order ${orderSn} is READY_TO_SHIP — auto-shipping`);

  const { data: shippingParams, error: paramError } = await getShippingParameter(creds, orderSn);
  if (paramError) return `ดึงข้อมูลขนส่งไม่ได้: ${paramError}`;

  const params = shippingParams as {
    info_needed?: { pickup?: string[]; dropoff?: string[]; non_integrated?: string[] };
    pickup?: {
      address_list?: Array<{
        address_id: number;
        time_slot_list?: Array<{ pickup_time_id: string; date: number; flags?: string[] }>;
      }>;
    };
    dropoff?: { branch_list?: Array<{ branch_id: number }> };
  };

  // Ship each parcel (or single order if not split)
  const parcelsToShip = packageNumbers && packageNumbers.length > 0
    ? packageNumbers
    : [undefined];

  for (const pkgNum of parcelsToShip) {
    let shipResult: { data: unknown; error?: string };

    if (params.info_needed?.dropoff && params.info_needed.dropoff.length > 0) {
      const dropoffParams: Record<string, unknown> = {};
      if (params.dropoff?.branch_list?.[0]) {
        dropoffParams.branch_id = params.dropoff.branch_list[0].branch_id;
      }
      shipResult = await shipOrder(creds, orderSn, undefined, dropoffParams, pkgNum);
    } else {
      const pickupAddress = params.pickup?.address_list?.[0];
      if (!pickupAddress) return 'ไม่พบที่อยู่รับพัสดุ กรุณาตั้งค่าใน Shopee Seller Center';

      const timeSlots = pickupAddress.time_slot_list || [];
      const recommendedSlot = timeSlots.find(s => s.flags?.includes('recommended'));
      const pickupTimeSlot = recommendedSlot || timeSlots[0];

      shipResult = await shipOrder(creds, orderSn, {
        address_id: pickupAddress.address_id,
        pickup_time_id: pickupTimeSlot?.pickup_time_id || '',
      }, undefined, pkgNum);
    }

    if (shipResult.error) {
      const errText = String(shipResult.error);
      if (errText.includes('already shipped') || errText.includes('order_status_error')) {
        console.log(`[Shopee Doc] Order ${orderSn} parcel ${pkgNum || 'single'} already shipped on Shopee side`);
        continue; // OK — already shipped, try next parcel
      }
      return `รับออเดอร์ไม่สำเร็จ: ${shipResult.error}`;
    }

    console.log(`[Shopee Doc] Order ${orderSn} parcel ${pkgNum || 'single'} shipped successfully`);
  }

  return null;
}

/** Helper to log shipping document actions to integration_logs */
function logDoc(
  companyId: string, accountId: string, accountName: string,
  status: 'success' | 'error', errorMessage?: string,
  orderId?: string, orderSn?: string, startTime?: number,
  apiPath?: string, responseBody?: unknown,
) {
  logIntegration({
    company_id: companyId,
    integration: 'shopee',
    account_id: accountId,
    account_name: accountName,
    direction: 'outgoing',
    action: 'shipping_document',
    method: 'POST',
    api_path: apiPath || '/api/v2/logistics/download_shipping_document',
    status,
    error_message: errorMessage,
    response_body: responseBody,
    reference_type: orderId ? 'order' : undefined,
    reference_id: orderId || undefined,
    reference_label: orderSn || undefined,
    duration_ms: startTime ? Date.now() - startTime : undefined,
  });
}
