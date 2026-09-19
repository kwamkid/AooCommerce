/**
 * Statement service — shared helper for auto-creating statements from reports.
 * Used by: consignment reports + department store reports.
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';
import { billingTermsFor, billingPeriodFor, openBillingPeriodFor } from '@/lib/statements/billing-cycle';

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
    /**
     * วันที่บนใบวางบิล + วันครบกำหนด มาจาก **รอบวางบิลของลูกค้ารายนั้น** ไม่ใช่
     * "วันที่กดยืนยัน + จำนวนวัน" แบบเดิม — กดช้าไปวันเดียววันครบกำหนดเคยเลื่อนตาม
     * ทั้งที่ห้างกำหนดไว้ตายตัวว่าวางบิลวันที่เท่าไร
     */
    const terms = await billingTermsFor(companyId, customerId, reportTable === 'consignment_reports');
    const period = billingPeriodFor(terms.statementDay, terms.creditDays);

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
        statement_date: period.end,
        due_date: period.dueDate,
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
/**
 * ใบวางบิลที่ "ยังเปิดอยู่" = ยังจ่ายไม่ครบ จึงเอายอดใหม่ไปรวมได้
 * ⚠️ เดิมเขียน ['sent','billed'] — 'billed' ไม่เคยอยู่ใน CHECK ของ statements เลย
 *    (มันเป็นสถานะของ consignment_reports) เงื่อนไขนั้นจึงตายมาตลอด
 * partially_paid / overdue ยังไม่มีโค้ดตั้งค่า แต่ใส่ไว้ให้ถูกตั้งแต่ตอนนี้ พอเปิดใช้จะได้ไม่ลืม
 */
const OPEN_STATEMENT_STATUSES = ['sent', 'partially_paid', 'overdue'];

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
      .in('status', OPEN_STATEMENT_STATUSES)
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
 * ออเดอร์ขายขาดเครดิตพร้อมวางบิล → **รวบเข้าใบวางบิลของรอบ** ไม่ใช่ออกใบใหม่ทุกใบ
 *
 * เดิมเป็น 1 ออเดอร์ = 1 ใบวางบิล ผูกกันด้วยการยัดข้อความ `order:<uuid>` ไว้ในช่อง
 * notes — ตัวแทนสั่ง 20 ครั้งจึงได้ใบวางบิล 20 ใบ ทั้งที่ควรได้ใบเดียวต่อรอบ
 * ตอนนี้ผูกผ่าน `orders.statement_id` แล้ว จึงรวบได้จริง
 *
 * ใบที่สร้างเป็น **ฉบับร่าง** — ยอดยังวิ่งได้จนกว่ารอบจะปิด คนกดยืนยันเองเมื่อพร้อม
 * วางบิล (ไม่ออกเอกสารการเงินให้อัตโนมัติโดยไม่มีใครดู)
 */
export async function attachOrderToCycleStatement(
  orderId: string,
  customerId: string,
  companyId: string,
  userId: string | null,
): Promise<CreateStatementResult> {
  try {
    // ผูกไปแล้วไม่ต้องทำซ้ำ (autoIssueDocument ถูกเรียกได้หลายรอบต่อใบ)
    const { data: order } = await supabaseAdmin
      .from('orders').select('statement_id').eq('id', orderId).single();
    if (order?.statement_id) {
      const { data: st } = await supabaseAdmin
        .from('statements').select('id, statement_number').eq('id', order.statement_id).single();
      return { statementId: st?.id, statementNumber: st?.statement_number };
    }

    const terms = await billingTermsFor(companyId, customerId);
    const period = openBillingPeriodFor(terms.statementDay, terms.creditDays);

    // ใบของรอบนี้ที่ยังรวบยอดเพิ่มได้ = ฉบับร่าง หรือใบที่ส่งไปแล้วแต่ยังจ่ายไม่ครบ
    const { data: existing } = await supabaseAdmin
      .from('statements')
      .select('id, statement_number')
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('period_year', period.periodYear)
      .eq('period_month', period.periodMonth)
      .in('status', ['draft', ...OPEN_STATEMENT_STATUSES])
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    let statementId = existing?.id;
    let statementNumber = existing?.statement_number;

    if (!statementId) {
      const { data: generated, error: rpcErr } = await supabaseAdmin
        .rpc('generate_statement_number', { p_company_id: companyId });
      if (rpcErr || !generated) {
        console.error('[attachOrderToCycleStatement] RPC error:', rpcErr);
        return { error: 'ไม่สามารถสร้างเลขที่ใบวางบิลได้' };
      }

      const { data: created, error: insertErr } = await supabaseAdmin
        .from('statements')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          statement_number: generated,
          status: 'draft',
          statement_date: period.end,
          due_date: period.dueDate,
          period_year: period.periodYear,
          period_month: period.periodMonth,
          total_amount: 0,
          paid_amount: 0,
          created_by: userId ?? null,
        })
        .select('id, statement_number')
        .single();

      if (insertErr || !created) {
        console.error('[attachOrderToCycleStatement] Insert error:', insertErr);
        return { error: 'ไม่สามารถสร้างใบวางบิลได้' };
      }
      statementId = created.id;
      statementNumber = created.statement_number;
    }

    await supabaseAdmin.from('orders')
      .update({ statement_id: statementId })
      .eq('id', orderId)
      .eq('company_id', companyId);

    await recalcStatementTotal(statementId!);

    return { statementId, statementNumber };
  } catch (err) {
    console.error('[attachOrderToCycleStatement] Error:', err);
    return { error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * คิดยอดรวมของใบวางบิลใหม่จากออเดอร์ที่ผูกอยู่จริง
 *
 * บวกสะสมทีละใบไม่ได้ เพราะออเดอร์ถูกถอดออก/ยกเลิก/แก้ยอดทีหลังได้ — ยอดบนใบวางบิล
 * ต้องสะท้อนสิ่งที่ผูกอยู่ ณ ตอนนี้เสมอ
 */
export async function recalcStatementTotal(statementId: string): Promise<number> {
  // ⚠️ ใบวางบิลรวบออเดอร์ทั้งรอบของลูกค้ารายนั้น — ร้านที่ส่งของทุกวันมีเกินพันใบต่อรอบได้
  //    ยอดที่ขาดไปคือยอดที่เรียกเก็บลูกค้าน้อยกว่าที่ขายจริง
  const { rows: orders } = await fetchAllRows<{ total_amount: number | null }>((from, to) => supabaseAdmin
    .from('orders')
    .select('total_amount')
    .eq('statement_id', statementId)
    .neq('order_status', 'cancelled')
    .range(from, to));

  const total = orders.reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

  await supabaseAdmin.from('statements')
    .update({ total_amount: total, updated_at: new Date().toISOString() })
    .eq('id', statementId);

  return total;
}
