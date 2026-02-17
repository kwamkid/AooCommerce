// Path: app/api/shopee/orders/shipping-document/route.ts
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
 * POST - Generate and download Shopee shipping label PDF.
 * Flow: createShippingDocument → poll getShippingDocumentResult → downloadShippingDocument
 * Polling happens server-side; client gets back the PDF in a single request.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRole)) {
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
      .select('id, source, external_order_sn, external_status, shopee_account_id')
      .eq('id', order_id)
      .eq('company_id', companyId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    if (order.source !== 'shopee') {
      return NextResponse.json({ error: 'Not a Shopee order' }, { status: 400 });
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
    const orderSn = order.external_order_sn;

    // 4. Create shipping document task (may fail for already-shipped orders)
    const { error: createError, resultList } = await createShippingDocument(creds, [orderSn]);
    let skipPolling = false;

    if (createError) {
      // Check both top-level error and per-order result_list for "already shipped" signals
      const resultItem = resultList?.find(r => r.order_sn === orderSn);
      const failError = resultItem?.fail_error || '';
      const failMessage = resultItem?.fail_message || '';
      const allText = `${createError} ${failError} ${failMessage}`;

      const isAlreadyShipped = allText.includes('package_can_not_print') || allText.includes('has been shipped');
      if (isAlreadyShipped) {
        console.log(`[Shopee Doc] Order already shipped, trying direct download for ${orderSn}`);
        skipPolling = true;
      } else {
        console.error('[Shopee Doc] createShippingDocument error:', createError, 'result:', resultItem);
        return NextResponse.json({ error: 'สร้างใบปะหน้าไม่สำเร็จ กรุณาตรวจสอบสถานะออเดอร์ใน Shopee Seller Center' }, { status: 500 });
      }
    }

    // 5. Poll for document readiness (skip if already shipped)
    if (!skipPolling) {
      const MAX_POLLS = 10;
      let documentReady = false;

      for (let i = 0; i < MAX_POLLS; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));

        const { data: resultData, error: resultError } = await getShippingDocumentResult(creds, [orderSn]);
        if (resultError) {
          console.error(`[Shopee Doc] getShippingDocumentResult poll ${i + 1} error:`, resultError);
          continue;
        }

        const result = resultData as {
          result_list?: Array<{
            order_sn: string;
            status: string;
            fail_error?: string;
            fail_message?: string;
          }>;
        };

        const orderResult = result.result_list?.find(r => r.order_sn === orderSn);
        console.log(`[Shopee Doc] Poll ${i + 1}/${MAX_POLLS}: status=${orderResult?.status}`);

        if (orderResult?.status === 'READY') {
          documentReady = true;
          break;
        }

        if (orderResult?.status === 'FAILED') {
          return NextResponse.json({
            error: 'สร้างใบปะหน้าไม่สำเร็จ กรุณาตรวจสอบสถานะออเดอร์ใน Shopee Seller Center',
          }, { status: 500 });
        }
      }

      if (!documentReady) {
        return NextResponse.json({
          error: 'ใบปะหน้ายังไม่พร้อม กรุณาลองใหม่อีกครั้ง',
        }, { status: 408 });
      }
    }

    // 6. Download the PDF
    const { pdfBuffer, error: downloadError } = await downloadShippingDocument(creds, [orderSn]);

    if (downloadError || !pdfBuffer) {
      console.error('[Shopee Doc] downloadShippingDocument error:', downloadError);
      const userMessage = skipPolling
        ? 'ไม่พบใบปะหน้าสำหรับออเดอร์นี้ อาจเป็นเพราะพัสดุถูกส่งไปแล้วและใบปะหน้าหมดอายุ'
        : 'ดาวน์โหลดใบปะหน้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง';
      return NextResponse.json({ error: userMessage }, { status: 500 });
    }

    // 7. Return PDF
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
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to generate shipping document',
    }, { status: 500 });
  }
}
