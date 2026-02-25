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
  getPackageNumberListBatch,
} from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';
import { PDFDocument } from 'pdf-lib';

// Total 6 steps for progress tracking
const STEPS = {
  DETECT_SPLIT: { step: 1, total: 6, label: 'ตรวจสอบพัสดุ' },
  AUTO_SHIP: { step: 2, total: 6, label: 'รับออเดอร์' },
  TRACKING: { step: 3, total: 6, label: 'ดึงเลขพัสดุ' },
  DOC_PARAM: { step: 4, total: 6, label: 'เตรียมเอกสาร' },
  CREATE_DOC: { step: 5, total: 6, label: 'สร้างใบปะหน้า' },
  DOWNLOAD: { step: 6, total: 6, label: 'ดาวน์โหลด PDF' },
};

/**
 * POST - Bulk generate and download Shopee shipping label PDFs.
 * Returns SSE stream with progress events, final event includes PDF as base64.
 */
export async function POST(request: NextRequest) {
  // Auth + validation (must happen before streaming)
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId || !isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const companyId = auth.companyId;

  const body = await request.json();
  const { order_ids } = body;

  if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
    return NextResponse.json({ error: 'Missing order_ids array' }, { status: 400 });
  }

  if (order_ids.length > 50) {
    return NextResponse.json({ error: 'Maximum 50 orders per batch' }, { status: 400 });
  }

  // Fetch orders before streaming
  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('id, source, external_order_sn, external_status, marketplace_account_id, is_split')
    .eq('company_id', companyId)
    .in('id', order_ids);

  if (ordersError || !orders || orders.length === 0) {
    return NextResponse.json({ error: 'Orders not found' }, { status: 404 });
  }

  const invalidOrders = orders.filter(o => o.source !== 'shopee' || !o.external_order_sn || !o.marketplace_account_id);
  if (invalidOrders.length > 0) {
    return NextResponse.json({
      error: `${invalidOrders.length} orders are not valid Shopee orders`,
    }, { status: 400 });
  }

  const accountIds = [...new Set(orders.map(o => o.marketplace_account_id!))];
  const { data: accounts, error: accFetchError } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('company_id', companyId)
    .in('id', accountIds);

  if (accFetchError || !accounts || accounts.length === 0) {
    return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
  }

  // SSE streaming response
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
        }
      };

      const sendProgress = (step: typeof STEPS[keyof typeof STEPS], detail?: string) => {
        const progress = Math.round((step.step / step.total) * 100);
        send({ type: 'progress', step: step.step, total: step.total, label: step.label, progress, detail });
      };

      const startTime = Date.now();

      try {
        // Map account_id → shop_id, group orders by shop
        const accIdToShopId = new Map<string, number>();
        const shopIdToAccount = new Map<number, typeof accounts[0]>();
        for (const acc of accounts) {
          accIdToShopId.set(acc.id, acc.shop_id);
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

        const allPdfBuffers: Buffer[] = [];

        for (const [shopId, shopOrders] of byShop) {
          const account = shopIdToAccount.get(shopId);
          if (!account) {
            send({ type: 'error', message: `Shopee account for shop ${shopId} not found` });
            controller.close();
            return;
          }

          const creds = await ensureValidToken(account as ShopeeAccountRow);
          const orderSns = shopOrders.map(o => o.external_order_sn!);

          // Step 1: Detect split orders
          sendProgress(STEPS.DETECT_SPLIT, `${orders.length} รายการ`);

          const packageNumberMap = new Map<string, string[]>();

          const splitOrdersFromDb = shopOrders.filter(o => o.is_split);
          if (splitOrdersFromDb.length > 0) {
            const { data: parcels } = await supabaseAdmin
              .from('order_parcels')
              .select('order_id, package_number')
              .in('order_id', splitOrdersFromDb.map(o => o.id))
              .order('parcel_number');
            for (const p of parcels || []) {
              if (!p.package_number) continue;
              const order = splitOrdersFromDb.find(o => o.id === p.order_id);
              if (!order?.external_order_sn) continue;
              const sn = order.external_order_sn;
              if (!packageNumberMap.has(sn)) packageNumberMap.set(sn, []);
              packageNumberMap.get(sn)!.push(p.package_number);
            }
          }

          const nonSplitSns = orderSns.filter(sn => !packageNumberMap.has(sn));
          if (nonSplitSns.length > 0) {
            const { packageMap } = await getPackageNumberListBatch(creds, nonSplitSns);
            for (const [sn, packageNumbers] of packageMap) {
              packageNumberMap.set(sn, packageNumbers);
              const order = shopOrders.find(o => o.external_order_sn === sn);
              if (order) {
                await supabaseAdmin.from('orders').update({ is_split: true }).eq('id', order.id);
                const { count } = await supabaseAdmin
                  .from('order_parcels')
                  .select('id', { count: 'exact', head: true })
                  .eq('order_id', order.id);
                if ((count || 0) === 0) {
                  await supabaseAdmin.from('order_parcels').insert(
                    packageNumbers.map((pn, idx) => ({
                      order_id: order.id,
                      parcel_number: idx + 1,
                      package_number: pn,
                      status: 'pending',
                    }))
                  );
                  console.log(`[Shopee Bulk Doc] Auto-created ${packageNumbers.length} parcels for split order ${sn}`);
                }
              }
            }
          }

          console.log(`[Shopee Bulk Doc] Split orders detected: ${packageNumberMap.size} (${[...packageNumberMap.entries()].map(([sn, pns]) => `${sn}:${pns.length}pkg`).join(', ')})`);

          // Step 2: Auto-ship orders still in READY_TO_SHIP
          const readyOrders = shopOrders.filter(o => o.external_status === 'READY_TO_SHIP');
          if (readyOrders.length > 0) {
            sendProgress(STEPS.AUTO_SHIP, `${readyOrders.length} ออเดอร์`);
            await parallelLimit(readyOrders, async (order) => {
              const sn = order.external_order_sn!;
              const pkgNums = packageNumberMap.get(sn);
              if (pkgNums && pkgNums.length > 0) {
                for (const pn of pkgNums) {
                  const err = await autoShipOrder(creds, sn, pn);
                  if (err) console.error(`[Shopee Bulk Doc] Auto-ship failed for ${sn} pkg ${pn}:`, err);
                }
              } else {
                const shipErr = await autoShipOrder(creds, sn);
                if (shipErr) { console.error(`[Shopee Bulk Doc] Auto-ship failed for ${sn}:`, shipErr); return; }
              }
              await supabaseAdmin.from('orders').update({
                external_status: 'PROCESSED',
                order_status: 'processing',
                updated_at: new Date().toISOString(),
              }).eq('id', order.id).eq('company_id', companyId);
            }, 3);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            sendProgress(STEPS.AUTO_SHIP, 'ข้าม (รับแล้ว)');
          }

          // Step 3: Get tracking numbers
          const trackingMap = new Map<string, string>();
          const trackingRequests: { sn: string; pn?: string }[] = [];
          for (const sn of orderSns) {
            const pkgNums = packageNumberMap.get(sn);
            if (pkgNums && pkgNums.length > 0) {
              for (const pn of pkgNums) trackingRequests.push({ sn, pn });
            } else {
              trackingRequests.push({ sn });
            }
          }
          sendProgress(STEPS.TRACKING, `${trackingRequests.length} เลขพัสดุ`);
          await parallelLimit(trackingRequests, async ({ sn, pn }) => {
            const { tracking_number } = await getTrackingNumber(creds, sn, pn);
            if (tracking_number) {
              trackingMap.set(pn ? `${sn}:${pn}` : sn, tracking_number);
            }
          }, 5);

          // Step 4: Get shipping document parameters
          sendProgress(STEPS.DOC_PARAM);
          const docParamItems: { order_sn: string; package_number?: string }[] = [];
          for (const sn of orderSns) {
            const pkgNums = packageNumberMap.get(sn);
            if (pkgNums && pkgNums.length > 0) {
              for (const pn of pkgNums) {
                docParamItems.push({ order_sn: sn, package_number: pn });
              }
            } else {
              docParamItems.push({ order_sn: sn });
            }
          }

          const docParamResult = await getShippingDocumentParameter(creds, orderSns, docParamItems);
          const docTypeMap = new Map<string, string>();
          const failedSns: string[] = [];

          for (const item of docParamResult.resultList || []) {
            if (item.fail_error) {
              console.error(`[Shopee Bulk Doc] Doc param error for ${item.order_sn}:`, item.fail_error, item.fail_message);
              if (!failedSns.includes(item.order_sn)) failedSns.push(item.order_sn);
              continue;
            }
            const key = item.package_number ? `${item.order_sn}:${item.package_number}` : item.order_sn;
            if (item.suggest_shipping_document_type) {
              docTypeMap.set(key, item.suggest_shipping_document_type);
            }
          }

          const validSns = orderSns.filter(sn => !failedSns.includes(sn));
          if (validSns.length === 0) {
            send({ type: 'error', message: 'ทุกออเดอร์ไม่สามารถสร้างใบปะหน้าได้ กรุณาตรวจสอบสถานะใน Shopee Seller Center' });
            controller.close();
            return;
          }

          // Step 5: Create shipping documents + poll
          sendProgress(STEPS.CREATE_DOC, `${validSns.length} ออเดอร์`);

          type DocItem = { order_sn: string; package_number?: string; tracking_number?: string; shipping_document_type: string };
          const orderList: DocItem[] = [];
          for (const sn of validSns) {
            const pkgNums = packageNumberMap.get(sn);
            if (pkgNums && pkgNums.length > 0) {
              for (const pn of pkgNums) {
                const key = `${sn}:${pn}`;
                orderList.push({
                  order_sn: sn,
                  package_number: pn,
                  tracking_number: trackingMap.get(key) || undefined,
                  shipping_document_type: docTypeMap.get(key) || 'NORMAL_AIR_WAYBILL',
                });
              }
            } else {
              orderList.push({
                order_sn: sn,
                tracking_number: trackingMap.get(sn) || undefined,
                shipping_document_type: docTypeMap.get(sn) || 'NORMAL_AIR_WAYBILL',
              });
            }
          }

          const { error: createError } = await createShippingDocument(creds, orderList);
          let skipPolling = false;

          if (createError) {
            if (createError.includes('package_can_not_print') || createError.includes('has been shipped')) {
              skipPolling = true;
            } else {
              logBulkDoc(companyId, account.id, account.shop_name, 'error', `สร้างใบปะหน้าไม่สำเร็จ: ${createError}`, validSns, startTime);
              send({ type: 'error', message: `สร้างใบปะหน้าไม่สำเร็จ: ${createError}` });
              controller.close();
              return;
            }
          }

          if (!skipPolling) {
            const MAX_POLLS = 15;
            let documentReady = false;

            const pollOrderList = orderList.map(item => ({
              order_sn: item.order_sn,
              package_number: item.package_number,
              shipping_document_type: item.shipping_document_type,
            }));

            for (let i = 0; i < MAX_POLLS; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              sendProgress(STEPS.CREATE_DOC, `รอเอกสารพร้อม... (${i + 1}/${MAX_POLLS})`);

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
                send({ type: 'error', message: 'บางใบปะหน้าสร้างไม่สำเร็จ กรุณาตรวจสอบสถานะใน Shopee Seller Center' });
                controller.close();
                return;
              }
            }

            if (!documentReady) {
              send({ type: 'error', message: 'ใบปะหน้ายังไม่พร้อม กรุณาลองใหม่อีกครั้ง' });
              controller.close();
              return;
            }
          }

          // Step 6: Download PDFs
          sendProgress(STEPS.DOWNLOAD, `${orderList.length} ใบ`);

          const docTypeGroups = new Map<string, { order_sn: string; package_number?: string }[]>();
          for (const item of orderList) {
            const dt = item.shipping_document_type;
            if (!docTypeGroups.has(dt)) docTypeGroups.set(dt, []);
            docTypeGroups.get(dt)!.push({ order_sn: item.order_sn, package_number: item.package_number });
          }

          for (const [docType, groupItems] of docTypeGroups) {
            const groupSns = [...new Set(groupItems.map(i => i.order_sn))];
            const { pdfBuffer, error: downloadError } = await downloadShippingDocument(creds, groupSns, docType, groupItems);

            if (downloadError && downloadError.toLowerCase().includes('can not download together')) {
              console.log(`[Shopee Bulk Doc] Group download failed for ${docType}, falling back to individual download for ${groupItems.length} items`);
              for (const item of groupItems) {
                const { pdfBuffer: singlePdf, error: singleErr } = await downloadShippingDocument(
                  creds, [item.order_sn], docType,
                  [{ order_sn: item.order_sn, package_number: item.package_number }]
                );
                if (singleErr || !singlePdf) {
                  console.error(`[Shopee Bulk Doc] Individual download failed for ${item.order_sn}${item.package_number ? `:${item.package_number}` : ''}:`, singleErr);
                  continue;
                }
                allPdfBuffers.push(singlePdf);
              }
            } else if (downloadError || !pdfBuffer) {
              logBulkDoc(companyId, account.id, account.shop_name, 'error', `ดาวน์โหลดไม่สำเร็จ: ${downloadError}`, groupSns, startTime);
              send({ type: 'error', message: `ดาวน์โหลดใบปะหน้าไม่สำเร็จ: ${downloadError || 'Unknown error'}` });
              controller.close();
              return;
            } else {
              allPdfBuffers.push(pdfBuffer);
            }
          }

          logBulkDoc(companyId, account.id, account.shop_name, 'success', undefined, validSns, startTime);
        }

        // Merge PDF buffers
        if (allPdfBuffers.length === 0) {
          send({ type: 'error', message: 'No PDF generated' });
          controller.close();
          return;
        }

        let finalBytes: Uint8Array;
        if (allPdfBuffers.length === 1) {
          finalBytes = new Uint8Array(allPdfBuffers[0]);
        } else {
          const mergedPdf = await PDFDocument.create();
          for (const buf of allPdfBuffers) {
            const srcPdf = await PDFDocument.load(buf);
            const pages = await mergedPdf.copyPages(srcPdf, srcPdf.getPageIndices());
            for (const page of pages) mergedPdf.addPage(page);
          }
          finalBytes = new Uint8Array(await mergedPdf.save());
        }

        console.log(`[Shopee Bulk Doc] ${orders.length} labels downloaded (${Date.now() - startTime}ms)`);

        // Send PDF as base64 in final event
        const base64Pdf = Buffer.from(finalBytes).toString('base64');
        send({ type: 'done', pdf: base64Pdf, count: orders.length, duration: Date.now() - startTime });
      } catch (error) {
        console.error('[Shopee Bulk Doc] Error:', error);
        send({ type: 'error', message: error instanceof Error ? error.message : 'Failed to generate shipping documents' });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

// ─── Helpers ─────────────────────────────────────────

/** Auto-ship an order that's still READY_TO_SHIP. Returns error string or null on success. */
async function autoShipOrder(creds: ShopeeCredentials, orderSn: string, packageNumber?: string): Promise<string | null> {
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
    shipResult = await shipOrder(creds, orderSn, undefined, dropoffParams, packageNumber);
  } else {
    const pickupAddress = params.pickup?.address_list?.[0];
    if (!pickupAddress) return 'ไม่พบที่อยู่รับพัสดุ';

    const timeSlots = pickupAddress.time_slot_list || [];
    const recommendedSlot = timeSlots.find(s => s.flags?.includes('recommended'));
    const pickupTimeSlot = recommendedSlot || timeSlots[0];

    shipResult = await shipOrder(creds, orderSn, {
      address_id: pickupAddress.address_id,
      pickup_time_id: pickupTimeSlot?.pickup_time_id || '',
    }, undefined, packageNumber);
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
