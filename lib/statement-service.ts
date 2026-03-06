/**
 * Statement service — shared helper for auto-creating statements from consignment reports.
 * Used by: confirm action (received → invoiced) and admin-keyed report creation.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';

interface CreateStatementResult {
  statementId?: string;
  statementNumber?: string;
  error?: string;
}

/**
 * Auto-create a statement (ใบวางบิล) for a single confirmed consignment report.
 *
 * Steps:
 * 1. Get customer payment terms → calculate due date
 * 2. Generate statement_number via RPC
 * 3. Insert statement (status='sent')
 * 4. Update report: link statement_id + status='billed'
 */
export async function createStatementForReport(
  reportId: string,
  customerId: string,
  companyId: string,
  userId: string | null,
  ourAmount: number,
  periodYear: number,
  periodMonth: number,
): Promise<CreateStatementResult> {
  try {
    // 1. Get customer payment terms
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('consignment_payment_terms')
      .eq('id', customerId)
      .single();

    const paymentTerms = customer?.consignment_payment_terms ?? 30;
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
      .from('consignment_reports')
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
