// Admin API for consignment report detail — requires authentication
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — Fetch single report detail with items, customer, batch info
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId } = auth;
    const { id: reportId } = await context.params;

    const { data: report, error } = await supabaseAdmin
      .from('consignment_reports')
      .select(`
        id, report_number, period_year, period_month, status,
        total_qty_sold, our_amount, due_date, report_token,
        created_at, updated_at, confirmed_at, received_at, notes,
        customer:customers(
          id, name, customer_code, phone, consignment_mode, portal_token
        ),
        created_by_profile:user_profiles!consignment_reports_created_by_fkey(id, full_name),
        items:consignment_report_items(
          id, variation_id, qty_sold, qty_returned, unit_price, gp_rate, our_amount,
          batch_item_id,
          variation:product_variations(id, sku, label, product_id, products(name))
        )
      `)
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (error || !report) {
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error('GET consignment report detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Perform actions on a report
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyId, userId } = auth;
    const { id: reportId } = await context.params;

    const body = await request.json();
    const { action } = body as { action: 'confirm' | 'cancel' };

    if (!action) {
      return NextResponse.json({ error: 'กรุณาระบุ action' }, { status: 400 });
    }

    // Fetch report to validate state
    const { data: report, error: fetchError } = await supabaseAdmin
      .from('consignment_reports')
      .select('id, status, company_id, customer_id')
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    if (action === 'confirm') {
      // Confirm: received → invoiced
      if (report.status !== 'received') {
        return NextResponse.json(
          { error: `ไม่สามารถยืนยันรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('consignment_reports')
        .update({
          status: 'invoiced',
          confirmed_at: new Date().toISOString(),
          confirmed_by: userId ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (updateError) {
        console.error('Confirm report error:', updateError);
        return NextResponse.json({ error: 'ไม่สามารถยืนยันรายงานได้' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'invoiced' });
    }

    if (action === 'cancel') {
      // Cancel: draft → cancelled, reverse batch_items
      if (report.status !== 'draft') {
        return NextResponse.json(
          { error: `ไม่สามารถยกเลิกรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      // Fetch report items to reverse batch_items
      const { data: reportItems } = await supabaseAdmin
        .from('consignment_report_items')
        .select('batch_item_id, qty_sold, qty_returned')
        .eq('consignment_report_id', reportId);

      // Reverse batch item quantities
      for (const item of reportItems || []) {
        if (item.batch_item_id) {
          const { data: batchItem } = await supabaseAdmin
            .from('consignment_batch_items')
            .select('qty_sold, qty_returned')
            .eq('id', item.batch_item_id)
            .single();

          if (batchItem) {
            await supabaseAdmin
              .from('consignment_batch_items')
              .update({
                qty_sold: Math.max(0, (batchItem.qty_sold ?? 0) - (item.qty_sold ?? 0)),
                qty_returned: Math.max(0, (batchItem.qty_returned ?? 0) - (item.qty_returned ?? 0)),
                updated_at: new Date().toISOString(),
              })
              .eq('id', item.batch_item_id);
          }
        }
      }

      // Update report status
      const { error: updateError } = await supabaseAdmin
        .from('consignment_reports')
        .update({
          status: 'cancelled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', reportId);

      if (updateError) {
        console.error('Cancel report error:', updateError);
        return NextResponse.json({ error: 'ไม่สามารถยกเลิกรายงานได้' }, { status: 500 });
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (error) {
    console.error('PUT consignment report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
