/**
 * Statement service — shared helper for auto-creating statements from reports.
 * Used by: consignment reports + department store reports.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

interface CreateStatementResult {
  statementId?: string;
  statementNumber?: string;
  error?: string;
}

/**
 * Auto-create a statement (ใบวางบิล) for a confirmed report.
 *
 * Steps:
 * 1. Get customer payment terms → calculate due date
 * 2. Generate statement_number via RPC
 * 3. Insert statement (status='sent')
 * 4. Update report: link statement_id + status='billed'
 *
 * @param reportTable — which report table to update (default: consignment_reports)
 */
export async function createStatementForReport(
  reportId: string,
  customerId: string,
  companyId: string,
  userId: string | null,
  ourAmount: number,
  periodYear: number,
  periodMonth: number,
  reportTable: 'consignment_reports' | 'department_store_reports' = 'consignment_reports',
): Promise<CreateStatementResult> {
  try {
    // 1. Get customer payment terms
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('consignment_payment_terms, credit_days')
      .eq('id', customerId)
      .single();

    // Use credit_days for department_store, consignment_payment_terms for consignment
    const paymentTerms = reportTable === 'department_store_reports'
      ? (customer?.credit_days ?? 30)
      : (customer?.consignment_payment_terms ?? 30);
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTerms);

    // 2. Generate statement number
    const { data: statementNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_statement_number', { p_company_id: companyId });

    if (rpcErr || !statementNumber) {
      console.error('[createStatementForReport] RPC error:', rpcErr);
      return { error: 'ไม่สามารถสร้างเลขที่ใบวางบิลได้' };
    }

    // 3. Insert statement
    const { data: statement, error: insertErr } = await supabaseAdmin
      .from('statements')
      .insert({
        company_id: companyId,
        customer_id: customerId,
        statement_number: statementNumber,
        status: 'sent',
        statement_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        period_year: periodYear,
        period_month: periodMonth,
        total_amount: ourAmount,
        paid_amount: 0,
        notes: null,
        created_by: userId ?? null,
      })
      .select('id, statement_number')
      .single();

    if (insertErr || !statement) {
      console.error('[createStatementForReport] Insert error:', insertErr);
      return { error: 'ไม่สามารถสร้างใบวางบิลได้' };
    }

    // 4. Link report to statement + update status to 'billed'
    await supabaseAdmin
      .from(reportTable)
      .update({
        statement_id: statement.id,
        status: 'billed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reportId);

    return {
      statementId: statement.id,
      statementNumber: statement.statement_number,
    };
  } catch (err) {
    console.error('[createStatementForReport] Error:', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Combined billing for department-store reports (DSR):
 * all branches' reports of the same customer+period share ONE statement.
 * Attaches to the open statement for that customer+period if it exists
 * (adding this report's amount), otherwise creates a new one.
 */
export async function createOrAttachStatementForDeptReport(
  reportId: string,
  customerId: string,
  companyId: string,
  userId: string | null,
  ourAmount: number,
  periodYear: number,
  periodMonth: number,
): Promise<CreateStatementResult> {
  try {
    // Open (unpaid) statement for the same customer + period. `notes` null filters
    // out order-statements ('order:<id>'); CSR statements can't collide because
    // consignment customers are a different customer_type.
    const { data: existing } = await supabaseAdmin
      .from('statements')
      .select('id, statement_number, total_amount, status')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('period_year', periodYear)
      .eq('period_month', periodMonth)
      .in('status', ['sent', 'billed'])
      .is('notes', null)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const now = new Date().toISOString();
      const { error: updErr } = await supabaseAdmin
        .from('statements')
        .update({
          total_amount: Number(existing.total_amount || 0) + ourAmount,
          updated_at: now,
        })
        .eq('id', existing.id);
      if (updErr) {
        console.error('[createOrAttachStatementForDeptReport] Update error:', updErr);
        return { error: 'ไม่สามารถรวมใบวางบิลได้' };
      }

      await supabaseAdmin
        .from('department_store_reports')
        .update({ statement_id: existing.id, status: 'billed', updated_at: now })
        .eq('id', reportId);

      return { statementId: existing.id, statementNumber: existing.statement_number };
    }

    return createStatementForReport(
      reportId, customerId, companyId, userId,
      ourAmount, periodYear, periodMonth,
      'department_store_reports',
    );
  } catch (err) {
    console.error('[createOrAttachStatementForDeptReport] Error:', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Auto-create a statement (ใบวางบิล) for a W-Credit order on shipping.
 * 1:1 — one order = one statement.
 */
export async function createStatementForOrder(
  orderId: string,
  customerId: string,
  companyId: string,
  userId: string | null,
  totalAmount: number,
): Promise<CreateStatementResult> {
  try {
    // Check if statement already exists for this order
    const { data: existing } = await supabaseAdmin
      .from('statements')
      .select('id, statement_number')
      .eq('company_id', companyId)
      .eq('notes', `order:${orderId}`)
      .maybeSingle();
    if (existing) return { statementId: existing.id, statementNumber: existing.statement_number };

    // Get customer credit_days
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('credit_days')
      .eq('id', customerId)
      .single();

    const creditDays = customer?.credit_days ?? 30;
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + creditDays);

    const now = new Date();
    const periodYear = now.getFullYear();
    const periodMonth = now.getMonth() + 1;

    // Generate statement number
    const { data: statementNumber, error: rpcErr } = await supabaseAdmin
      .rpc('generate_statement_number', { p_company_id: companyId });

    if (rpcErr || !statementNumber) {
      return { error: 'ไม่สามารถสร้างเลขที่ใบวางบิลได้' };
    }

    // Insert statement
    const { data: statement, error: insertErr } = await supabaseAdmin
      .from('statements')
      .insert({
        company_id: companyId,
        customer_id: customerId,
        statement_number: statementNumber,
        status: 'sent',
        statement_date: now.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        period_year: periodYear,
        period_month: periodMonth,
        total_amount: totalAmount,
        paid_amount: 0,
        notes: `order:${orderId}`,
        created_by: userId ?? null,
      })
      .select('id, statement_number')
      .single();

    if (insertErr || !statement) {
      return { error: 'ไม่สามารถสร้างใบวางบิลได้' };
    }

    return {
      statementId: statement.id,
      statementNumber: statement.statement_number,
    };
  } catch (err) {
    console.error('[createStatementForOrder] Error:', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
