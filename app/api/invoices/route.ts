import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

/**
 * GET /api/invoices?type=tax|receipt|abbreviated|dn|invoice
 *
 * Queries the appropriate document table and returns a normalized shape.
 * Each row includes source_type + source_id so pages can link to order/statement/replenishment.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'tax';
    const month = searchParams.get('month') || '';
    const search = searchParams.get('search') || '';
    const voided = searchParams.get('voided'); // 'true' | 'false' | null
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    // Build date range filter
    let dateFrom: string | null = null;
    let dateTo: string | null = null;
    if (month && month.length === 6) {
      const year = month.slice(0, 4);
      const mon = month.slice(4, 6);
      dateFrom = `${year}-${mon}-01`;
      dateTo = parseInt(mon) === 12
        ? `${parseInt(year) + 1}-01-01`
        : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;
    }

    let result: { invoices: unknown[]; total: number };

    switch (type) {
      case 'tax':
        result = await queryTaxInvoices(auth.companyId, { search, dateFrom, dateTo, voided, offset, limit });
        break;
      case 'receipt':
        result = await queryReceipts(auth.companyId, { search, dateFrom, dateTo, voided, offset, limit });
        break;
      case 'abbreviated':
        result = await queryAbbreviated(auth.companyId, { search, dateFrom, dateTo, voided, offset, limit });
        break;
      case 'dn':
        result = await queryDeliveryNotes(auth.companyId, { search, dateFrom, dateTo, voided, offset, limit });
        break;
      case 'invoice':
        result = await queryInvoices(auth.companyId, { search, dateFrom, dateTo, voided, offset, limit });
        break;
      default:
        return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('GET invoices error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}

// ─── Shared filter params ────────────────────────────────
interface FilterParams {
  search: string;
  dateFrom: string | null;
  dateTo: string | null;
  voided: string | null;
  offset: number;
  limit: number;
}

// ─── Helper: enrich with source reference numbers ────────
// Batch-fetches order_number / statement_number / replenishment ref for each row
async function enrichSourceNumbers(rows: Record<string, unknown>[]) {
  if (!rows.length) return rows;

  // Collect IDs by source type
  const orderIds = rows.filter(r => r.source_type === 'order').map(r => r.source_id as string);
  const statementIds = rows.filter(r => r.source_type === 'statement').map(r => r.source_id as string);
  const repIds = rows.filter(r => r.source_type === 'replenishment').map(r => r.source_id as string);

  const refMap = new Map<string, string>();

  if (orderIds.length) {
    const { data } = await supabaseAdmin.from('orders').select('id, order_number').in('id', orderIds);
    data?.forEach(o => refMap.set(o.id, o.order_number));
  }
  if (statementIds.length) {
    const { data } = await supabaseAdmin.from('statements').select('id, statement_number').in('id', statementIds);
    data?.forEach(s => refMap.set(s.id, s.statement_number));
  }
  if (repIds.length) {
    const { data } = await supabaseAdmin.from('replenishments').select('id, replenishment_number').in('id', repIds);
    data?.forEach(r => refMap.set(r.id, r.replenishment_number));
  }

  return rows.map(row => ({
    ...row,
    source_number: refMap.get(row.source_id as string) || null,
  }));
}

// ─── 1. tax_invoices ─────────────────────────────────────
async function queryTaxInvoices(companyId: string, f: FilterParams) {
  let query = supabaseAdmin
    .from('tax_invoices')
    .select(`
      id, invoice_number, invoice_date,
      source_type, source_id,
      customer_id, customer_name, customer_tax_id, customer_branch, customer_address,
      total_amount, vat_amount, is_receipt,
      voided_at, voided_reason,
      replaces_abbreviated_id,
      created_at,
      customer:customers(id, name)
    `, { count: 'exact' })
    .eq('company_id', companyId);

  if (f.dateFrom) query = query.gte('invoice_date', f.dateFrom);
  if (f.dateTo) query = query.lt('invoice_date', f.dateTo);
  if (f.voided === 'true') query = query.not('voided_at', 'is', null);
  else if (f.voided === 'false') query = query.is('voided_at', null);
  if (f.search) {
    query = query.or(
      `invoice_number.ilike.%${f.search}%,customer_name.ilike.%${f.search}%,customer_tax_id.ilike.%${f.search}%`
    );
  }

  query = query
    .order('invoice_date', { ascending: false })
    .order('invoice_number', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // Fetch the replaced ABB number if replaces_abbreviated_id is set
  const rows = data || [];
  const abbIds = rows.filter(r => r.replaces_abbreviated_id).map(r => r.replaces_abbreviated_id);
  const abbMap = new Map<string, string>();
  if (abbIds.length) {
    const { data: abbs } = await supabaseAdmin.from('abbreviated_invoices').select('id, invoice_number').in('id', abbIds);
    abbs?.forEach(a => abbMap.set(a.id, a.invoice_number));
  }

  const enriched = await enrichSourceNumbers(rows as Record<string, unknown>[]);

  // Map to legacy-compatible field names for the page
  const invoices = enriched.map((r: Record<string, unknown>) => ({
    id: r.source_id, // for backward compat: pages use inv.id to link to /orders/{id}
    doc_id: r.id,
    source_type: r.source_type,
    source_id: r.source_id,
    source_number: r.source_number,
    order_number: r.source_number, // legacy alias
    tax_invoice_number: r.invoice_number,
    tax_invoice_date: r.invoice_date,
    tax_invoice_name: r.customer_name,
    tax_invoice_tax_id: r.customer_tax_id,
    tax_invoice_branch: r.customer_branch,
    tax_invoice_address: r.customer_address,
    tax_invoice_replaced_abbrev_number: r.replaces_abbreviated_id
      ? abbMap.get(r.replaces_abbreviated_id as string) || null
      : null,
    is_receipt: r.is_receipt,
    total_amount: r.total_amount,
    vat_amount: r.vat_amount,
    customer_id: r.customer_id,
    customer: r.customer,
    voided_at: r.voided_at,
    voided_reason: r.voided_reason,
    created_at: r.created_at,
  }));

  return { invoices, total: count || 0 };
}

// ─── 2. receipts ─────────────────────────────────────────
async function queryReceipts(companyId: string, f: FilterParams) {
  let query = supabaseAdmin
    .from('receipts')
    .select(`
      id, receipt_number, receipt_date,
      source_type, source_id,
      customer_id, customer_name, customer_address,
      total_amount,
      voided_at, voided_reason,
      created_at,
      customer:customers(id, name)
    `, { count: 'exact' })
    .eq('company_id', companyId);

  if (f.dateFrom) query = query.gte('receipt_date', f.dateFrom);
  if (f.dateTo) query = query.lt('receipt_date', f.dateTo);
  if (f.voided === 'true') query = query.not('voided_at', 'is', null);
  else if (f.voided === 'false') query = query.is('voided_at', null);
  if (f.search) {
    query = query.or(`receipt_number.ilike.%${f.search}%,customer_name.ilike.%${f.search}%`);
  }

  query = query
    .order('receipt_date', { ascending: false })
    .order('receipt_number', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = await enrichSourceNumbers((data || []) as Record<string, unknown>[]);

  const invoices = enriched.map((r: Record<string, unknown>) => ({
    id: r.source_id,
    doc_id: r.id,
    source_type: r.source_type,
    source_id: r.source_id,
    source_number: r.source_number,
    order_number: r.source_number,
    tax_invoice_number: r.receipt_number, // legacy alias
    tax_invoice_date: r.receipt_date,
    tax_invoice_name: r.customer_name,
    tax_invoice_address: r.customer_address,
    total_amount: r.total_amount,
    customer_id: r.customer_id,
    customer: r.customer,
    voided_at: r.voided_at,
    voided_reason: r.voided_reason,
    created_at: r.created_at,
  }));

  return { invoices, total: count || 0 };
}

// ─── 3. abbreviated_invoices ─────────────────────────────
async function queryAbbreviated(companyId: string, f: FilterParams) {
  let query = supabaseAdmin
    .from('abbreviated_invoices')
    .select(`
      id, invoice_number, invoice_date,
      order_id, customer_id,
      total_amount, vat_amount,
      voided_at, voided_reason,
      replaced_by_tax_id,
      created_at,
      customer:customers(id, name),
      order:orders(id, order_number)
    `, { count: 'exact' })
    .eq('company_id', companyId);

  if (f.dateFrom) query = query.gte('invoice_date', f.dateFrom);
  if (f.dateTo) query = query.lt('invoice_date', f.dateTo);
  if (f.voided === 'true') query = query.not('voided_at', 'is', null);
  else if (f.voided === 'false') query = query.is('voided_at', null);
  if (f.search) {
    query = query.or(`invoice_number.ilike.%${f.search}%`);
  }

  query = query
    .order('invoice_date', { ascending: false })
    .order('invoice_number', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // Fetch replaced_by TAX number
  const rows = data || [];
  const taxIds = rows.filter(r => r.replaced_by_tax_id).map(r => r.replaced_by_tax_id);
  const taxMap = new Map<string, string>();
  if (taxIds.length) {
    const { data: taxes } = await supabaseAdmin.from('tax_invoices').select('id, invoice_number').in('id', taxIds);
    taxes?.forEach(t => taxMap.set(t.id, t.invoice_number));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = rows.map((r: any) => ({
    id: r.order_id, // for backward compat: link to /orders/{id}
    doc_id: r.id,
    source_type: 'order',
    source_id: r.order_id,
    order_number: r.order?.order_number || null,
    tax_invoice_number: r.invoice_number, // legacy alias
    tax_invoice_date: r.invoice_date,
    tax_invoice_voided_at: r.voided_at,
    tax_invoice_voided_reason: r.voided_reason,
    tax_invoice_replaced_abbrev_number: r.replaced_by_tax_id
      ? taxMap.get(r.replaced_by_tax_id) || null
      : null,
    total_amount: r.total_amount,
    customer_id: r.customer_id,
    customer: r.customer,
    created_at: r.created_at,
  }));

  return { invoices, total: count || 0 };
}

// ─── 4. delivery_notes ───────────────────────────────────
async function queryDeliveryNotes(companyId: string, f: FilterParams) {
  let query = supabaseAdmin
    .from('delivery_notes')
    .select(`
      id, dn_number, dn_date,
      source_type, source_id,
      customer_id, customer_name,
      total_amount,
      voided_at, voided_reason,
      created_at,
      customer:customers(id, name)
    `, { count: 'exact' })
    .eq('company_id', companyId);

  if (f.dateFrom) query = query.gte('dn_date', f.dateFrom);
  if (f.dateTo) query = query.lt('dn_date', f.dateTo);
  if (f.voided === 'true') query = query.not('voided_at', 'is', null);
  else if (f.voided === 'false') query = query.is('voided_at', null);
  if (f.search) {
    query = query.or(`dn_number.ilike.%${f.search}%,customer_name.ilike.%${f.search}%`);
  }

  query = query
    .order('dn_date', { ascending: false })
    .order('dn_number', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  const enriched = await enrichSourceNumbers((data || []) as Record<string, unknown>[]);

  const invoices = enriched.map((r: Record<string, unknown>) => ({
    id: r.source_id,
    doc_id: r.id,
    source_type: r.source_type,
    source_id: r.source_id,
    source_number: r.source_number,
    dn_number: r.dn_number,
    dn_date: r.dn_date,
    total_amount: r.total_amount,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    customer: r.customer,
    voided_at: r.voided_at,
    voided_reason: r.voided_reason,
    created_at: r.created_at,
  }));

  return { invoices, total: count || 0 };
}

// ─── 5. invoices (ใบแจ้งหนี้) ────────────────────────────
async function queryInvoices(companyId: string, f: FilterParams) {
  let query = supabaseAdmin
    .from('invoices')
    .select(`
      id, invoice_number, invoice_date,
      order_id, customer_id, customer_name,
      total_amount, vat_amount,
      voided_at, voided_reason,
      created_at,
      customer:customers(id, name),
      order:orders(id, order_number)
    `, { count: 'exact' })
    .eq('company_id', companyId);

  if (f.dateFrom) query = query.gte('invoice_date', f.dateFrom);
  if (f.dateTo) query = query.lt('invoice_date', f.dateTo);
  if (f.voided === 'true') query = query.not('voided_at', 'is', null);
  else if (f.voided === 'false') query = query.is('voided_at', null);
  if (f.search) {
    query = query.or(`invoice_number.ilike.%${f.search}%,customer_name.ilike.%${f.search}%`);
  }

  query = query
    .order('invoice_date', { ascending: false })
    .order('invoice_number', { ascending: false })
    .range(f.offset, f.offset + f.limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoices = (data || []).map((r: any) => ({
    id: r.order_id,
    doc_id: r.id,
    source_type: 'order',
    source_id: r.order_id,
    order_number: r.order?.order_number || null,
    invoice_number: r.invoice_number,
    invoice_date: r.invoice_date,
    total_amount: r.total_amount,
    vat_amount: r.vat_amount,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    customer: r.customer,
    voided_at: r.voided_at,
    voided_reason: r.voided_reason,
    created_at: r.created_at,
  }));

  return { invoices, total: count || 0 };
}
