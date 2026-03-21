// Admin API for department store report detail — requires authentication
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { addStock } from '@/lib/stock-service';

// GET — Fetch single report detail with items, customer, branch
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
      .from('department_store_reports')
      .select(`
        id, report_number, period_year, period_month, status,
        total_qty_sold, our_amount, vat_amount, net_amount,
        due_date, statement_id,
        created_at, updated_at, confirmed_at, notes,
        customer:customers(
          id, name, customer_code, phone, email, contact_person,
          tax_company_name, tax_id, tax_branch,
          billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code
        ),
        items:department_store_report_items(
          id, variation_id, qty_sold, qty_returned, unit_price, gp_rate, our_amount,
          variation:product_variations(id, sku, variation_label, product_id, products(name, image))
        )
      `)
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (error || !report) {
      console.error('GET department store report query error:', error);
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    return NextResponse.json({ report });
  } catch (error) {
    console.error('GET department store report detail error:', error);
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
    const { action } = body as { action: 'cancel' | 'update_items' };

    if (!action) {
      return NextResponse.json({ error: 'กรุณาระบุ action' }, { status: 400 });
    }

    // Fetch report to validate state
    const { data: report, error: fetchError } = await supabaseAdmin
      .from('department_store_reports')
      .select('id, status, company_id, customer_id, our_amount, period_year, period_month, report_number')
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    if (action === 'cancel') {
      // Cancel: invoiced → cancelled (+ restore stock)
      if (report.status !== 'invoiced') {
        return NextResponse.json(
          { error: `ไม่สามารถยกเลิกรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      // Restore stock to customer's consignment warehouse (1:1 model)
      const { data: warehouse } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('customer_id', report.customer_id)
        .eq('warehouse_type', 'consignment')
        .single();

      if (warehouse) {
        const { data: reportItems } = await supabaseAdmin
          .from('department_store_report_items')
          .select('id, variation_id, qty_sold')
          .eq('report_id', reportId);

        await Promise.all(
          (reportItems || [])
            .filter(item => item.variation_id && item.qty_sold > 0)
            .map(item => addStock({
              supabase: supabaseAdmin,
              companyId,
              warehouseId: warehouse.id,
              variationId: item.variation_id,
              qty: item.qty_sold,
              referenceType: 'department_store_report_cancel',
              referenceId: reportId,
              notes: `คืนสต๊อกจากยกเลิกยอดขายห้าง ${report.report_number}`,
              createdBy: userId ?? null,
            }))
        );
      }

      const { error: updateError } = await supabaseAdmin
        .from('department_store_reports')
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

    if (action === 'update_items') {
      // Only allow editing before billed
      if (report.status !== 'invoiced') {
        return NextResponse.json(
          { error: `ไม่สามารถแก้ไขรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      const { items, notes, period_year, period_month } = body as {
        items: Array<{
          variation_id: string;
          qty_sold: number;
          qty_returned: number;
          unit_price: number;
          gp_rate: number;
        }>;
        notes?: string;
        period_year?: number;
        period_month?: number;
      };

      if (!items || items.length === 0) {
        return NextResponse.json({ error: 'กรุณาเพิ่มรายการสินค้า' }, { status: 400 });
      }

      // Delete existing items
      await supabaseAdmin
        .from('department_store_report_items')
        .delete()
        .eq('report_id', reportId);

      // Calculate totals and insert new items
      let totalQtySold = 0;
      let totalOurAmount = 0;

      const itemRows = items.map(item => {
        const ourAmount = item.qty_sold * item.unit_price;
        totalQtySold += item.qty_sold;
        totalOurAmount += ourAmount;
        return {
          report_id: reportId,
          variation_id: item.variation_id,
          qty_sold: item.qty_sold,
          qty_returned: item.qty_returned,
          unit_price: item.unit_price,
          gp_rate: item.gp_rate,
          our_amount: ourAmount,
        };
      });

      const { error: itemsError } = await supabaseAdmin
        .from('department_store_report_items')
        .insert(itemRows);

      if (itemsError) {
        console.error('Update report items error:', itemsError);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกรายการได้' }, { status: 500 });
      }

      // Update report totals + fields
      const updateFields: Record<string, unknown> = {
        total_qty_sold: totalQtySold,
        our_amount: totalOurAmount,
        updated_at: new Date().toISOString(),
      };
      if (notes !== undefined) updateFields.notes = notes ?? null;
      if (period_year) updateFields.period_year = period_year;
      if (period_month) updateFields.period_month = period_month;
      const { error: updateError } = await supabaseAdmin
        .from('department_store_reports')
        .update(updateFields)
        .eq('id', reportId);

      if (updateError) {
        console.error('Update report error:', updateError);
        return NextResponse.json({ error: 'ไม่สามารถบันทึกรายงานได้' }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (error) {
    console.error('PUT department store report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
