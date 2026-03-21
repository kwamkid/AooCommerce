/**
 * POST /api/invoices/backfill
 *
 * Backfill ABB/REC for orders that were accepted before auto-issue was implemented.
 * Finds orders with flow_type=a_cash, status >= processing, and no tax_invoice_number.
 * Issues ABB (VAT) or REC (no VAT) for each.
 *
 * This is a one-time operation — safe to call multiple times (idempotent).
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Only allow admin
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    // Find orders that need backfill
    const { data: orders, error } = await supabaseAdmin
      .from('orders')
      .select('id, order_number, flow_type, order_status, tax_invoice_number')
      .eq('company_id', auth.companyId)
      .in('flow_type', ['r_retail', 'w_cash'])
      .is('tax_invoice_number', null)
      .in('order_status', ['processing', 'shipping', 'completed']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!orders || orders.length === 0) {
      return NextResponse.json({ success: true, message: 'ไม่มี orders ที่ต้อง backfill', count: 0 });
    }

    const { issueAbbreviatedInvoice } = await import('@/lib/invoice-service');

    const results: { id: string; order_number: string; invoiceNumber?: string; error?: string }[] = [];

    for (const order of orders) {
      try {
        const result = await issueAbbreviatedInvoice(order.id, auth.companyId!);
        results.push({
          id: order.id,
          order_number: order.order_number,
          invoiceNumber: result.invoiceNumber,
          error: result.error,
        });
      } catch (err) {
        results.push({
          id: order.id,
          order_number: order.order_number,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.invoiceNumber).length;
    const failCount = results.filter(r => r.error).length;

    return NextResponse.json({
      success: true,
      message: `Backfill เสร็จ: ${successCount} สำเร็จ, ${failCount} ล้มเหลว`,
      count: orders.length,
      successCount,
      failCount,
      results,
    });
  } catch (err) {
    console.error('[Backfill ABB] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
