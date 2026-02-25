// Path: app/api/shopee/orders/bulk-shipping-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  type ShopeeCredentials,
  ensureValidToken,
  massGetTrackingNumber,
  getShippingParameter,
  shipOrder,
  getShippingDocumentParameter,
  createShippingDocument,
  getShippingDocumentResult,
  downloadShippingDocument,
  getAllPackageNumbersBatch,
} from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';
import { PDFDocument } from 'pdf-lib';

// 6 steps per shop for progress tracking
const STEPS_PER_SHOP = 6;
const STEP_LABELS = {
  DETECT_SPLIT: { step: 1, label: 'ตรวจสอบพัสดุ' },
  AUTO_SHIP: { step: 2, label: 'รับออเดอร์' },
  TRACKING: { step: 3, label: 'ดึงเลขพัสดุ' },
  DOC_PARAM: { step: 4, label: 'เตรียมเอกสาร' },
  CREATE_DOC: { step: 5, label: 'สร้างใบปะหน้า' },
  DOWNLOAD: { step: 6, label: 'ดาวน์โหลด PDF' },
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

        const shopCount = byShop.size;
        const totalSteps = STEPS_PER_SHOP * shopCount;
        let shopIndex = 0;

        // Progress is calculated globally: (shopIndex * STEPS_PER_SHOP + step) / totalSteps
        const sendProgress = (step: typeof STEP_LABELS[keyof typeof STEP_LABELS], detail?: string) => {
          const globalStep = shopIndex * STEPS_PER_SHOP + step.step;
          const progress = Math.round((globalStep / totalSteps) * 100);
          const shopLabel = shopCount > 1 ? `[${shopIndex + 1}/${shopCount}] ` : '';
          send({ type: 'progress', step: globalStep, total: totalSteps, label: `${shopLabel}${step.label}`, progress, detail });
        };

        console.log(`[Shopee Bulk Doc] ${orders.length} orders grouped into ${shopCount} shop(s):`,
          [...byShop.entries()].map(([shopId, ords]) => `shop=${shopId} (${ords.length} orders)`));

        const allPdfBuffers: Buffer[] = [];
        const allFailedSns: string[] = []; // Track failed order SNs across all shops

        for (const [shopId, shopOrders] of byShop) {
          const account = shopIdToAccount.get(shopId);
          if (!account) {
            send({ type: 'error', message: `Shopee account for shop ${shopId} not found` });
            controller.close();
            return;
          }

          const creds = await ensureValidToken(account as ShopeeAccountRow);
          const orderSns = shopOrders.map(o => o.external_order_sn!);

          // Step 1: Detect split orders + get package_number for ALL orders (needed by mass APIs)
          sendProgress(STEP_LABELS.DETECT_SPLIT, `${orders.length} รายการ`);

          // packageNumberMap: order_sn → package_number[] (every order, including non-split with 1 pkg)
          const packageNumberMap = new Map<string, string[]>();

          // First, load known split order parcels from DB
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

          // Fetch package_numbers for ALL remaining orders (including non-split) via batch API
          const remainingSns = orderSns.filter(sn => !packageNumberMap.has(sn));
          if (remainingSns.length > 0) {
            const { packageMap } = await getAllPackageNumbersBatch(creds, remainingSns);
            for (const [sn, packageInfos] of packageMap) {
              const packageNumbers = packageInfos.map(p => p.package_number);
              packageNumberMap.set(sn, packageNumbers);
              // Auto-create parcel records for newly detected split orders
              if (packageNumbers.length > 1) {
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
          }

          const splitCount = [...packageNumberMap.values()].filter(pns => pns.length > 1).length;
          console.log(`[Shopee Bulk Doc] Package numbers: ${packageNumberMap.size} orders, ${splitCount} split (${[...packageNumberMap.entries()].map(([sn, pns]) => `${sn}:${pns.length}pkg`).join(', ')})`);

          // Step 2: Auto-ship orders still in READY_TO_SHIP
          const readyOrders = shopOrders.filter(o => o.external_status === 'READY_TO_SHIP');
          if (readyOrders.length > 0) {
            sendProgress(STEP_LABELS.AUTO_SHIP, `${readyOrders.length} ออเดอร์`);
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
            sendProgress(STEP_LABELS.AUTO_SHIP, 'ข้าม (รับแล้ว)');
          }

          // Step 3: Get tracking numbers via mass API (1 call per 50 packages)
          const trackingMap = new Map<string, string>(); // key: "sn:pn" or "sn" → tracking_number
          const allPackageNumbers: { pn: string; sn: string }[] = [];
          for (const sn of orderSns) {
            const pkgNums = packageNumberMap.get(sn);
            if (pkgNums && pkgNums.length > 0) {
              for (const pn of pkgNums) allPackageNumbers.push({ pn, sn });
            }
          }

          sendProgress(STEP_LABELS.TRACKING, `${allPackageNumbers.length} เลขพัสดุ`);

          // Build pn→sn lookup for mapping results back
          const pnToSn = new Map(allPackageNumbers.map(({ pn, sn }) => [pn, sn]));

          // Mass get tracking (max 50 per call)
          for (let i = 0; i < allPackageNumbers.length; i += 50) {
            const batch = allPackageNumbers.slice(i, i + 50);
            const { successList, failList } = await massGetTrackingNumber(
              creds,
              batch.map(item => item.pn)
            );
            for (const item of successList) {
              if (item.tracking_number) {
                const sn = pnToSn.get(item.package_number) || '';
                trackingMap.set(`${sn}:${item.package_number}`, item.tracking_number);
              }
            }
            if (failList.length > 0) {
              console.warn(`[Shopee Bulk Doc] Mass tracking failed for ${failList.length} packages:`, failList.map(f => `${f.package_number}:${f.fail_reason}`).join(', '));
            }
          }

          console.log(`[Shopee Bulk Doc] Got ${trackingMap.size}/${allPackageNumbers.length} tracking numbers via mass API`);

          // Step 4: Get shipping document parameters (always pass package_number)
          sendProgress(STEP_LABELS.DOC_PARAM);
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
          const docTypeMap = new Map<string, string>(); // key: "sn:pn"
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
          sendProgress(STEP_LABELS.CREATE_DOC, `${validSns.length} ออเดอร์`);

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
              // Fallback: order without known package_number
              orderList.push({
                order_sn: sn,
                tracking_number: undefined,
                shipping_document_type: docTypeMap.get(sn) || 'NORMAL_AIR_WAYBILL',
              });
            }
          }

          // Create shipping documents — check per-item results for partial failures
          const { error: createError, resultList: createResultList } = await createShippingDocument(creds, orderList);

          // Categorize per-item results
          const createFailedSns: string[] = [];
          const createdSns: string[] = []; // successfully created in this batch
          const retryItems: typeof orderList = []; // package_can_not_print → retry separately

          if (createResultList) {
            for (const item of createResultList) {
              if (item.fail_error) {
                if (item.fail_error === 'logistics.package_can_not_print') {
                  // Retry these separately — they may need their own create+poll+download cycle
                  const retryOrderItems = orderList.filter(oi => oi.order_sn === item.order_sn);
                  for (const ri of retryOrderItems) {
                    if (!retryItems.find(r => r.order_sn === ri.order_sn && r.package_number === ri.package_number)) {
                      retryItems.push(ri);
                    }
                  }
                  console.log(`[Shopee Bulk Doc] Will retry create separately: ${item.order_sn}`);
                } else {
                  if (!createFailedSns.includes(item.order_sn)) createFailedSns.push(item.order_sn);
                  console.error(`[Shopee Bulk Doc] Create failed for ${item.order_sn}: ${item.fail_error} - ${item.fail_message}`);
                }
              } else {
                if (!createdSns.includes(item.order_sn)) createdSns.push(item.order_sn);
              }
            }
          } else if (!createError) {
            for (const item of orderList) {
              if (!createdSns.includes(item.order_sn)) createdSns.push(item.order_sn);
            }
          }

          if (createError && createResultList === undefined) {
            logBulkDoc(companyId, account.id, account.shop_name, 'error', `สร้างใบปะหน้าไม่สำเร็จ: ${createError}`, validSns, startTime);
            send({ type: 'error', message: `สร้างใบปะหน้าไม่สำเร็จ: ${createError}` });
            controller.close();
            return;
          }

          // Helper: poll items until READY, return failed SNs
          const pollUntilReady = async (items: typeof orderList): Promise<void> => {
            const MAX_POLLS = 15;
            const pollOrderList = items.map(item => ({
              order_sn: item.order_sn,
              package_number: item.package_number,
              shipping_document_type: item.shipping_document_type,
            }));

            for (let i = 0; i < MAX_POLLS; i++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              sendProgress(STEP_LABELS.CREATE_DOC, `รอเอกสารพร้อม... (${i + 1}/${MAX_POLLS})`);

              const { data: resultData, error: resultError } = await getShippingDocumentResult(creds, pollOrderList);
              if (resultError) continue;

              const result = resultData as {
                result_list?: Array<{ order_sn: string; package_number?: string; status: string; fail_error?: string; fail_message?: string }>;
              };
              if (!result.result_list) continue;

              const failedItems = result.result_list.filter(r => r.status === 'FAILED');
              const processingItems = result.result_list.filter(r => r.status !== 'READY' && r.status !== 'FAILED');

              if (failedItems.length > 0) {
                for (const fi of failedItems) {
                  console.error(`[Shopee Bulk Doc] Poll FAILED for ${fi.order_sn}${fi.package_number ? `:${fi.package_number}` : ''}: ${fi.fail_error} - ${fi.fail_message}`);
                  if (!createFailedSns.includes(fi.order_sn)) createFailedSns.push(fi.order_sn);
                }
                const failedSnSet = new Set(failedItems.map(fi => fi.order_sn));
                const remaining = pollOrderList.filter(p => !failedSnSet.has(p.order_sn));
                pollOrderList.length = 0;
                pollOrderList.push(...remaining);
              }

              if (processingItems.length === 0) break;
            }
          };

          // Helper: download a group of items, with individual fallback
          const downloadGroup = async (items: typeof orderList): Promise<void> => {
            const docTypeGroups = new Map<string, { order_sn: string; package_number?: string }[]>();
            for (const item of items) {
              const dt = item.shipping_document_type;
              if (!docTypeGroups.has(dt)) docTypeGroups.set(dt, []);
              docTypeGroups.get(dt)!.push({ order_sn: item.order_sn, package_number: item.package_number });
            }

            for (const [docType, groupItems] of docTypeGroups) {
              const sns = [...new Set(groupItems.map(i => i.order_sn))];
              const { pdfBuffer, error: downloadError } = await downloadShippingDocument(creds, sns, docType, groupItems);
              if (downloadError || !pdfBuffer) {
                console.log(`[Shopee Bulk Doc] Group download failed (${downloadError}), falling back to individual`);
                for (const item of groupItems) {
                  const { pdfBuffer: singlePdf, error: singleErr } = await downloadShippingDocument(
                    creds, [item.order_sn], docType,
                    [{ order_sn: item.order_sn, package_number: item.package_number }]
                  );
                  if (singleErr || !singlePdf) {
                    console.error(`[Shopee Bulk Doc] Individual download failed for ${item.order_sn}:`, singleErr);
                    if (!createFailedSns.includes(item.order_sn)) createFailedSns.push(item.order_sn);
                    continue;
                  }
                  allPdfBuffers.push(singlePdf);
                }
              } else {
                allPdfBuffers.push(pdfBuffer);
              }
            }
          };

          // ── Batch A: Newly created items → poll → group download ──
          const batchAItems = orderList.filter(item => createdSns.includes(item.order_sn));
          if (batchAItems.length > 0) {
            await pollUntilReady(batchAItems);
            const readyAItems = batchAItems.filter(item => !createFailedSns.includes(item.order_sn));
            if (readyAItems.length > 0) {
              sendProgress(STEP_LABELS.DOWNLOAD, `${readyAItems.length} ใบ (batch A)`);
              await downloadGroup(readyAItems);
            }
          }

          // ── Batch B: Retry items (package_can_not_print) → create again → poll → download ──
          if (retryItems.length > 0) {
            console.log(`[Shopee Bulk Doc] Retrying create for ${retryItems.length} items: ${[...new Set(retryItems.map(r => r.order_sn))].join(', ')}`);
            sendProgress(STEP_LABELS.CREATE_DOC, `สร้างใบปะหน้าซ้ำ ${retryItems.length} ใบ`);

            const { resultList: retryResultList } = await createShippingDocument(creds, retryItems);
            const retryCreatedSns: string[] = [];

            if (retryResultList) {
              for (const item of retryResultList) {
                if (item.fail_error) {
                  if (!createFailedSns.includes(item.order_sn)) createFailedSns.push(item.order_sn);
                  console.error(`[Shopee Bulk Doc] Retry create still failed for ${item.order_sn}: ${item.fail_error}`);
                } else {
                  if (!retryCreatedSns.includes(item.order_sn)) retryCreatedSns.push(item.order_sn);
                }
              }
            }

            const retryCreatedItems = retryItems.filter(item => retryCreatedSns.includes(item.order_sn));
            if (retryCreatedItems.length > 0) {
              await pollUntilReady(retryCreatedItems);
              const readyBItems = retryCreatedItems.filter(item => !createFailedSns.includes(item.order_sn));
              if (readyBItems.length > 0) {
                sendProgress(STEP_LABELS.DOWNLOAD, `${readyBItems.length} ใบ (batch B)`);
                await downloadGroup(readyBItems);
              }
            }
          }

          // Step 6 complete
          const totalDownloaded = orderList.length - createFailedSns.length;
          if (totalDownloaded === 0 && createFailedSns.length > 0) {
            const failMsg = `ทุกออเดอร์สร้างใบปะหน้าไม่ได้: ${createFailedSns.join(', ')}`;
            logBulkDoc(companyId, account.id, account.shop_name, 'error', failMsg, validSns, startTime);
            send({ type: 'error', message: failMsg });
            controller.close();
            return;
          }

          // Track failed SNs at top level for final response
          allFailedSns.push(...createFailedSns);

          // Log with partial failure info
          if (createFailedSns.length > 0) {
            logBulkDoc(companyId, account.id, account.shop_name, 'success',
              `บางออเดอร์ไม่สามารถสร้างใบปะหน้าได้: ${createFailedSns.join(', ')}`, validSns, startTime);
          } else {
            logBulkDoc(companyId, account.id, account.shop_name, 'success', undefined, validSns, startTime);
          }

          shopIndex++;
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

        const successCount = orders.length - allFailedSns.length;
        console.log(`[Shopee Bulk Doc] ${successCount}/${orders.length} labels downloaded (${Date.now() - startTime}ms)${allFailedSns.length > 0 ? ` | Failed: ${allFailedSns.join(', ')}` : ''}`);

        // Send PDF as base64 in final event (include warning for partial failures)
        const base64Pdf = Buffer.from(finalBytes).toString('base64');
        const doneEvent: Record<string, unknown> = {
          type: 'done', pdf: base64Pdf, count: successCount, duration: Date.now() - startTime,
        };
        if (allFailedSns.length > 0) {
          doneEvent.warning = `${allFailedSns.length} ออเดอร์สร้างใบปะหน้าไม่ได้: ${allFailedSns.join(', ')} — กรุณาตรวจสอบสถานะใน Shopee Seller Center`;
          doneEvent.failed_sns = allFailedSns;
        }
        send(doneEvent);
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
