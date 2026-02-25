// Path: app/api/shopee/orders/bulk-shipping-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  type ShopeeCredentials,
  ensureValidToken,
  getTrackingNumber,
  getShippingParameter,
  shipOrder,
  getShippingDocumentParameter,
  createShippingDocument,
  getShippingDocumentResult,
  downloadShippingDocument,
} from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';
import { PDFDocument } from 'pdf-lib';

/**
 * POST - Bulk generate and download Shopee shipping label PDFs.
 * Uses correct Shopee API flow:
 *   auto-ship (if needed) → get_tracking_number (parallel) →
 *   get_shipping_document_parameter → create_shipping_document → poll → download
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  let companyId = '';

  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId || !isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    companyId = auth.companyId;

    const body = await request.json();
    const { order_ids } = body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'Missing order_ids array' }, { status: 400 });
    }

    if (order_ids.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 orders per batch' }, { status: 400 });
    }

    // Fetch all orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, source, external_order_sn, external_status, marketplace_account_id')
      .eq('company_id', companyId)
      .in('id', order_ids);

    if (ordersError || !orders || orders.length === 0) {
      return NextResponse.json({ error: 'Orders not found' }, { status: 404 });
    }

    // Validate: all must be Shopee orders with order_sn
    const invalidOrders = orders.filter(o => o.source !== 'shopee' || !o.external_order_sn || !o.marketplace_account_id);
    if (invalidOrders.length > 0) {
      return NextResponse.json({
        error: `${invalidOrders.length} orders are not valid Shopee orders`,
      }, { status: 400 });
    }

    // Fetch all referenced marketplace accounts and group by shop_id
    // (orders may reference different account rows for the same shop due to reconnects)
    const accountIds = [...new Set(orders.map(o => o.marketplace_account_id!))];
    const { data: accounts, error: accFetchError } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('company_id', companyId)
      .in('id', accountIds);

    if (accFetchError || !accounts || accounts.length === 0) {
      return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
    }

    // Map account_id → shop_id, then group orders by shop_id
    const accIdToShopId = new Map<string, number>();
    const shopIdToAccount = new Map<number, typeof accounts[0]>();
    for (const acc of accounts) {
      accIdToShopId.set(acc.id, acc.shop_id);
      // Prefer active account; if multiple, latest one wins
      const existing = shopIdToAccount.get(acc.shop_id);
      if (!existing || acc.is_active) shopIdToAccount.set(acc.shop_id, acc);
    }

    const byShop = new Map<number, typeof orders>();
    for (const order of orders) {
      const shopId = accIdToShopId.get(order.marketplace_account_id!) || 0;
      if (!byShop.has(shopId)) byShop.set(shopId, []);
      byShop.get(shopId)!.push(order);
    }

    console.log(`[Shopee Bulk Doc] ${orders.length} orders grouped into ${byShop.size} shop(s):`,
      [...byShop.entries()].map(([shopId, ords]) => `shop=${shopId} (${ords.length} orders)`));

    // Process each shop group — in practice usually just one
    const allPdfBuffers: Buffer[] = [];

    for (const [shopId, shopOrders] of byShop) {
      const account = shopIdToAccount.get(shopId);
      if (!account) {
        return NextResponse.json({ error: `Shopee account for shop ${shopId} not found` }, { status: 404 });
      }

      const creds = await ensureValidToken(account as ShopeeAccountRow);
      const orderSns = shopOrders.map(o => o.external_order_sn!);

      // Step 0: Auto-ship orders that are still READY_TO_SHIP
      const readyOrders = shopOrders.filter(o => o.external_status === 'READY_TO_SHIP');
      if (readyOrders.length > 0) {
        await parallelLimit(readyOrders, async (order) => {
          const shipErr = await autoShipOrder(creds, order.external_order_sn!);
          if (!shipErr) {
            await supabaseAdmin.from('orders').update({
              external_status: 'PROCESSED',
              order_status: 'processing',
              updated_at: new Date().toISOString(),
            }).eq('id', order.id).eq('company_id', companyId);
          }
        }, 3);
        // Wait for Shopee to process
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Step 1: Get tracking numbers — PARALLEL (5 concurrent)
      const trackingMap = new Map<string, string>();
      await parallelLimit(orderSns, async (sn) => {
        const { tracking_number } = await getTrackingNumber(creds, sn);
        if (tracking_number) trackingMap.set(sn, tracking_number);
      }, 5);

      // Step 2: Get shipping document parameters (already batch)
      const docParamResult = await getShippingDocumentParameter(creds, orderSns);
      const docTypeMap = new Map<string, string>();
      const failedSns: string[] = [];

      for (const item of docParamResult.resultList || []) {
        if (item.fail_error) {
          console.error(`[Shopee Bulk Doc] Doc param error for ${item.order_sn}:`, item.fail_error, item.fail_message);
          failedSns.push(item.order_sn);
          continue;
        }
        if (item.suggest_shipping_document_type) {
          docTypeMap.set(item.order_sn, item.suggest_shipping_document_type);
        }
      }

      // Filter out failed orders (e.g. JIT orders)
      const validSns = orderSns.filter(sn => !failedSns.includes(sn));
      if (validSns.length === 0) {
        return NextResponse.json({
          error: 'ทุกออเดอร์ไม่สามารถสร้างใบปะหน้าได้ กรุณาตรวจสอบสถานะใน Shopee Seller Center',
        }, { status: 400 });
      }

      // Use the first valid order's suggested type for download
      const downloadDocType = docTypeMap.values().next().value || 'NORMAL_AIR_WAYBILL';

      // Step 3: Create shipping document task (already batch)
      const orderList = validSns.map(sn => ({
        order_sn: sn,
        tracking_number: trackingMap.get(sn) || undefined,
        shipping_document_type: docTypeMap.get(sn) || 'NORMAL_AIR_WAYBILL',
      }));

      const { error: createError } = await createShippingDocument(creds, orderList);
      let skipPolling = false;

      if (createError) {
        if (createError.includes('package_can_not_print') || createError.includes('has been shipped')) {
          skipPolling = true;
        } else {
          logBulkDoc(companyId, account.id, account.shop_name, 'error', `สร้างใบปะหน้าไม่สำเร็จ: ${createError}`, validSns, startTime);
          return NextResponse.json({
            error: `สร้างใบปะหน้าไม่สำเร็จ: ${createError}`,
          }, { status: 500 });
        }
      }

      // Step 4: Poll for readiness
      if (!skipPolling) {
        const MAX_POLLS = 15;
        let documentReady = false;

        const pollOrderList = validSns.map(sn => ({
          order_sn: sn,
          shipping_document_type: docTypeMap.get(sn) || 'NORMAL_AIR_WAYBILL',
        }));

        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const { data: resultData, error: resultError } = await getShippingDocumentResult(creds, pollOrderList);
          if (resultError) continue;

          const result = resultData as {
            result_list?: Array<{ order_sn: string; status: string }>;
          };

          const allReady = result.result_list?.every(r => r.status === 'READY');
          const anyFailed = result.result_list?.some(r => r.status === 'FAILED');

          if (allReady) {
            documentReady = true;
            break;
          }

          if (anyFailed) {
            logBulkDoc(companyId, account.id, account.shop_name, 'error', 'บางใบปะหน้าสร้างไม่สำเร็จ', validSns, startTime);
            return NextResponse.json({
              error: 'บางใบปะหน้าสร้างไม่สำเร็จ กรุณาตรวจสอบสถานะใน Shopee Seller Center',
            }, { status: 500 });
          }
        }

        if (!documentReady) {
          return NextResponse.json({
            error: 'ใบปะหน้ายังไม่พร้อม กรุณาลองใหม่อีกครั้ง',
          }, { status: 408 });
        }
      }

      // Step 5: Download PDF
      const { pdfBuffer, error: downloadError } = await downloadShippingDocument(creds, validSns, downloadDocType);

      if (downloadError || !pdfBuffer) {
        logBulkDoc(companyId, account.id, account.shop_name, 'error', `ดาวน์โหลดไม่สำเร็จ: ${downloadError}`, validSns, startTime);
        return NextResponse.json({
          error: `ดาวน์โหลดใบปะหน้าไม่สำเร็จ: ${downloadError || 'Unknown error'}`,
        }, { status: 500 });
      }

      allPdfBuffers.push(pdfBuffer);
      logBulkDoc(companyId, account.id, account.shop_name, 'success', undefined, validSns, startTime);
    }

    // Merge PDF buffers (handles multiple accounts)
    if (allPdfBuffers.length === 0) {
      return NextResponse.json({ error: 'No PDF generated' }, { status: 500 });
    }

    let finalBuffer: Uint8Array;
    if (allPdfBuffers.length === 1) {
      finalBuffer = new Uint8Array(allPdfBuffers[0]);
    } else {
      const mergedPdf = await PDFDocument.create();
      for (const buf of allPdfBuffers) {
        const srcPdf = await PDFDocument.load(buf);
        const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
        for (const page of pages) mergedPdf.addPage(page);
      }
      finalBuffer = await mergedPdf.save();
    }

    console.log(`[Shopee Bulk Doc] ${orders.length} labels downloaded (${Date.now() - startTime}ms)`);

    return new NextResponse(finalBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="shopee-labels-batch.pdf"`,
        'Content-Length': String(finalBuffer.length),
      },
    });
  } catch (error) {
    console.error('[Shopee Bulk Doc] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to generate shipping documents',
    }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────

/** Auto-ship an order that's still READY_TO_SHIP. Returns error string or null on success. */
async function autoShipOrder(creds: ShopeeCredentials, orderSn: string): Promise<string | null> {
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

  let shipResult: { data: unknown; error?: string };

  if (params.info_needed?.dropoff && params.info_needed.dropoff.length > 0) {
    const dropoffParams: Record<string, unknown> = {};
    if (params.dropoff?.branch_list?.[0]) {
      dropoffParams.branch_id = params.dropoff.branch_list[0].branch_id;
    }
    shipResult = await shipOrder(creds, orderSn, undefined, dropoffParams);
  } else {
    const pickupAddress = params.pickup?.address_list?.[0];
    if (!pickupAddress) return 'ไม่พบที่อยู่รับพัสดุ';

    const timeSlots = pickupAddress.time_slot_list || [];
    const recommendedSlot = timeSlots.find(s => s.flags?.includes('recommended'));
    const pickupTimeSlot = recommendedSlot || timeSlots[0];

    shipResult = await shipOrder(creds, orderSn, {
      address_id: pickupAddress.address_id,
      pickup_time_id: pickupTimeSlot?.pickup_time_id || '',
    });
  }

  if (shipResult.error) {
    const errText = String(shipResult.error);
    if (errText.includes('already shipped') || errText.includes('order_status_error')) {
      return null; // OK — already shipped
    }
    return `รับออเดอร์ไม่สำเร็จ: ${shipResult.error}`;
  }

  return null;
}

/** Helper to log bulk shipping document actions */
function logBulkDoc(
  companyId: string, accountId: string, accountName: string | null,
  status: 'success' | 'error', errorMessage?: string,
  orderSns?: string[], startTime?: number,
) {
  logIntegration({
    company_id: companyId,
    integration: 'shopee',
    account_id: accountId,
    account_name: accountName,
    direction: 'outgoing',
    action: 'bulk_shipping_document',
    method: 'POST',
    api_path: '/api/v2/logistics/download_shipping_document',
    status,
    error_message: errorMessage,
    request_body: { order_sns: orderSns, count: orderSns?.length },
    duration_ms: startTime ? Date.now() - startTime : undefined,
  });
}
