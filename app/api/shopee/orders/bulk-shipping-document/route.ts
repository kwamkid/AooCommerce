// Path: app/api/shopee/orders/bulk-shipping-document/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  ensureValidToken,
  createShippingDocument,
  getShippingDocumentResult,
  downloadShippingDocument,
} from '@/lib/shopee-api';

/**
 * POST - Bulk generate and download Shopee shipping label PDFs.
 * All orders must belong to the same Shopee account.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
      .select('id, source, external_order_sn, external_status, shopee_account_id')
      .eq('company_id', companyId)
      .in('id', order_ids);

    if (ordersError || !orders || orders.length === 0) {
      return NextResponse.json({ error: 'Orders not found' }, { status: 404 });
    }

    // Validate: all must be Shopee orders with order_sn
    const invalidOrders = orders.filter(o => o.source !== 'shopee' || !o.external_order_sn || !o.shopee_account_id);
    if (invalidOrders.length > 0) {
      return NextResponse.json({
        error: `${invalidOrders.length} orders are not valid Shopee orders`,
      }, { status: 400 });
    }

    // Group by Shopee account (all should be the same, but handle multiple)
    const byAccount = new Map<string, typeof orders>();
    for (const order of orders) {
      const accountId = order.shopee_account_id!;
      if (!byAccount.has(accountId)) byAccount.set(accountId, []);
      byAccount.get(accountId)!.push(order);
    }

    // Process each account group — in practice usually just one
    const allPdfBuffers: Buffer[] = [];

    for (const [accountId, accountOrders] of byAccount) {
      // Fetch Shopee account
      const { data: account, error: accError } = await supabaseAdmin
        .from('shopee_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('company_id', companyId)
        .eq('is_active', true)
        .single();

      if (accError || !account) {
        return NextResponse.json({ error: `Shopee account ${accountId} not found` }, { status: 404 });
      }

      const creds = await ensureValidToken(account as ShopeeAccountRow);
      const orderSns = accountOrders.map(o => o.external_order_sn!);

      // Create shipping document task
      const { error: createError } = await createShippingDocument(creds, orderSns);
      let skipPolling = false;

      if (createError) {
        // If "already shipped" type error, try direct download
        if (createError.includes('package_can_not_print') || createError.includes('has been shipped')) {
          skipPolling = true;
        } else {
          return NextResponse.json({
            error: `สร้างใบปะหน้าไม่สำเร็จ: ${createError}`,
          }, { status: 500 });
        }
      }

      // Poll for readiness
      if (!skipPolling) {
        const MAX_POLLS = 15;
        let documentReady = false;

        for (let i = 0; i < MAX_POLLS; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));

          const { data: resultData, error: resultError } = await getShippingDocumentResult(creds, orderSns);
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

      // Download PDF
      const { pdfBuffer, error: downloadError } = await downloadShippingDocument(creds, orderSns);

      if (downloadError || !pdfBuffer) {
        return NextResponse.json({
          error: `ดาวน์โหลดใบปะหน้าไม่สำเร็จ: ${downloadError || 'Unknown error'}`,
        }, { status: 500 });
      }

      allPdfBuffers.push(pdfBuffer);
    }

    // Return the PDF (if multiple accounts, we only support one buffer for now)
    const finalBuffer = allPdfBuffers[0];
    if (!finalBuffer) {
      return NextResponse.json({ error: 'No PDF generated' }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(finalBuffer), {
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
