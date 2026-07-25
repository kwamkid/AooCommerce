// Admin API for department store report detail — requires authentication
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { addStock, deductStock } from '@/lib/stock-service';
import { getCustomerConsignmentWarehouse } from '@/lib/consignment-warehouse';
import { createStatementForReport } from '@/lib/statement-service';

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
    const { action } = body as { action: string };

    if (!action) {
      return NextResponse.json({ error: 'กรุณาระบุ action' }, { status: 400 });
    }

    // Fetch report to validate state
    const { data: report, error: fetchError } = await supabaseAdmin
      .from('department_store_reports')
      .select('id, status, company_id, customer_id, our_amount, period_year, period_month, report_number, statement_id')
      .eq('id', reportId)
      .eq('company_id', companyId)
      .single();

    if (fetchError || !report) {
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    // === ACTION: CONFIRM (draft → billed + deduct stock + auto INV + ST) ===
    if (action === 'confirm') {
      if (report.status !== 'draft') {
        return NextResponse.json({ error: `ไม่สามารถยืนยันรายงานที่มีสถานะ "${report.status}" ได้` }, { status: 400 });
      }

      // 1. Find customer's consignment warehouse
      const warehouse = await getCustomerConsignmentWarehouse(
        supabaseAdmin, companyId, report.customer_id
      );

      // 2. Deduct stock from consignment warehouse
      if (warehouse) {
        const { data: reportItems } = await supabaseAdmin
          .from('department_store_report_items')
          .select('id, variation_id, qty_sold')
          .eq('report_id', reportId);

        for (const item of reportItems || []) {
          if (!item.variation_id || item.qty_sold <= 0) continue;
          await deductStock({
            supabase: supabaseAdmin,
            companyId,
            warehouseId: warehouse.id,
            variationId: item.variation_id,
            qty: item.qty_sold,
            referenceType: 'department_store_report',
            referenceId: reportId,
            notes: `ตัดสต๊อกจากยอดขายห้าง ${report.report_number}`,
            createdBy: userId ?? null,
          });
        }
      }

      // 3. Auto create statement (ใบวางบิล)
      let stResult: { statementId?: string; statementNumber?: string } | null = null;
      try {
        stResult = await createStatementForReport(
          reportId, report.customer_id, companyId, userId ?? null,
          report.our_amount, report.period_year, report.period_month,
          'department_store_reports'
        );
      } catch (err) {
        console.error('Auto create statement error:', err);
      }

      // 4. Issue INV (ใบแจ้งหนี้ — ห้าง always INV, TAX ออกตอนส่งของแล้ว)
      let docResult: { documentNumber?: string } | null = null;
      try {
        const { issueReportDocument } = await import('@/lib/invoice-service');
        const result = await issueReportDocument(
          reportId, companyId, report.customer_id, report.our_amount, 'department_store_report'
        );
        if (result.success) docResult = { documentNumber: result.documentNumber };
      } catch (err) {
        console.error('Auto issue INV error:', err);
      }

      // 5. Update report → billed
      const now = new Date().toISOString();
      await supabaseAdmin
        .from('department_store_reports')
        .update({
          status: 'billed',
          statement_id: stResult?.statementId || null,
          confirmed_at: now,
          confirmed_by: userId ?? null,
          updated_at: now,
        })
        .eq('id', reportId);

      return NextResponse.json({
        success: true,
        status: 'billed',
        statement_number: stResult?.statementNumber || null,
        document_number: docResult?.documentNumber || null,
      });
    }

    // === ACTION: PAYMENT (billed/overdue → paid + auto REC) ===
    if (action === 'payment') {
      if (!['billed', 'overdue'].includes(report.status)) {
        return NextResponse.json({ error: `ไม่สามารถบันทึกชำระในสถานะ "${report.status}" ได้` }, { status: 400 });
      }

      const now = new Date().toISOString();

      // Auto issue REC (ใบเสร็จรับเงิน)
      let recNumber: string | null = null;
      if (report.statement_id) {
        try {
          const { insertReceipt } = await import('@/lib/invoice-service');
          const { data: recNum } = await supabaseAdmin.rpc('generate_receipt_number', { p_company_id: companyId });
          if (recNum) {
            await insertReceipt({
              company_id: companyId,
              receipt_number: recNum,
              receipt_date: now.split('T')[0],
              source_type: 'statement',
              source_id: report.statement_id,
              customer_id: report.customer_id,
              total_amount: report.our_amount,
            });
            recNumber = recNum;
          }
        } catch (err) {
          console.error('Auto issue REC error:', err);
        }

        // Update statement → paid
        await supabaseAdmin
          .from('statements')
          .update({ status: 'paid', paid_at: now, updated_at: now })
          .eq('id', report.statement_id);
      }

      // Update report → paid
      await supabaseAdmin
        .from('department_store_reports')
        .update({ status: 'paid', updated_at: now })
        .eq('id', reportId);

      return NextResponse.json({ success: true, status: 'paid', receipt_number: recNumber });
    }

    // === ACTION: REVERSE_PAYMENT (paid → billed, void REC) ===
    if (action === 'reverse_payment') {
      if (report.status !== 'paid') {
        return NextResponse.json({ error: 'สามารถยกเลิกการชำระได้เฉพาะสถานะ "ชำระแล้ว"' }, { status: 400 });
      }

      const now = new Date().toISOString();

      // Void receipts linked to statement
      if (report.statement_id) {
        await supabaseAdmin.from('receipts')
          .update({ voided_at: now, voided_reason: 'ยกเลิกการชำระยอดขายห้าง' })
          .eq('source_type', 'statement').eq('source_id', report.statement_id)
          .is('voided_at', null);

        // Revert statement → billed
        await supabaseAdmin.from('statements')
          .update({ status: 'billed', paid_at: null, updated_at: now })
          .eq('id', report.statement_id);
      }

      // Revert report → billed
      await supabaseAdmin.from('department_store_reports')
        .update({ status: 'billed', updated_at: now })
        .eq('id', reportId);

      return NextResponse.json({ success: true, status: 'billed' });
    }

    // === ACTION: VOID (billed → draft, void INV + ST + return stock) ===
    if (action === 'void') {
      if (!['billed', 'invoiced'].includes(report.status)) {
        return NextResponse.json({ error: `สถานะ "${report.status}" ไม่สามารถ void ได้` }, { status: 400 });
      }

      const now = new Date().toISOString();
      const voidReason = 'ยกเลิกยอดขายห้าง';

      // 1. Return stock to consignment warehouse
      const warehouse = await getCustomerConsignmentWarehouse(
        supabaseAdmin, companyId, report.customer_id
      );

      if (warehouse) {
        const { data: reportItems } = await supabaseAdmin
          .from('department_store_report_items')
          .select('id, variation_id, qty_sold')
          .eq('report_id', reportId);

        for (const item of reportItems || []) {
          if (!item.variation_id || item.qty_sold <= 0) continue;
          await addStock({
            supabase: supabaseAdmin,
            companyId,
            warehouseId: warehouse.id,
            variationId: item.variation_id,
            qty: item.qty_sold,
            referenceType: 'department_store_report_void',
            referenceId: reportId,
            notes: `คืนสต๊อกจาก void ยอดขายห้าง ${report.report_number}`,
            createdBy: userId ?? null,
          });
        }
      }

      // 2. Void INV invoices
      await supabaseAdmin.from('invoices')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'department_store_report').eq('source_id', reportId)
        .is('voided_at', null);

      // 3. Void linked statement
      if (report.statement_id) {
        await supabaseAdmin.from('statements')
          .update({ status: 'cancelled', updated_at: now })
          .eq('id', report.statement_id);
      }

      // 4. Reset report → draft
      await supabaseAdmin.from('department_store_reports')
        .update({
          status: 'draft',
          statement_id: null,
          confirmed_at: null,
          confirmed_by: null,
          updated_at: now,
        })
        .eq('id', reportId);

      return NextResponse.json({ success: true, status: 'draft' });
    }

    // === ACTION: CANCEL (draft → cancelled) ===
    if (action === 'cancel') {
      if (report.status !== 'draft') {
        return NextResponse.json(
          { error: `ไม่สามารถยกเลิกรายงานที่มีสถานะ "${report.status}" ได้` },
          { status: 400 }
        );
      }

      await supabaseAdmin.from('department_store_reports')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', reportId);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // === ACTION: UPDATE_ITEMS (draft only) ===
    if (action === 'update_items') {
      if (report.status !== 'draft') {
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

      await supabaseAdmin
        .from('department_store_reports')
        .update(updateFields)
        .eq('id', reportId);

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (error) {
    console.error('PUT department store report error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
