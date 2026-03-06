import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'tax' | 'receipt' | 'abbreviated'
    const month = searchParams.get('month'); // YYYYMM e.g. '202603'
    const search = searchParams.get('search') || '';
    const voided = searchParams.get('voided'); // 'true' | 'false' | null (all)
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        tax_invoice_number,
        tax_invoice_doc_type,
        tax_invoice_date,
        tax_invoice_name,
        tax_invoice_tax_id,
        tax_invoice_branch,
        tax_invoice_address,
        tax_invoice_voided_at,
        tax_invoice_voided_reason,
        tax_invoice_replaced_abbrev_number,
        vat_registered_at_issue,
        is_retroactive,
        total_amount,
        vat_amount,
        payment_status,
        created_at,
        customer_id,
        customer:customers(id, name, contact_person)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId)
      .not('tax_invoice_number', 'is', null);

    // Filter by doc_type
    if (type) {
      if (type === 'tax') {
        // รวมทั้ง 'tax' และ INV-* เก่า (ที่ยังไม่มี doc_type)
        query = query.or(`tax_invoice_doc_type.eq.tax,tax_invoice_number.like.INV-%`);
      } else {
        query = query.eq('tax_invoice_doc_type', type);
      }
    }

    // Filter by month (YYYYMM)
    if (month && month.length === 6) {
      const year = month.slice(0, 4);
      const mon = month.slice(4, 6);
      const dateFrom = `${year}-${mon}-01`;
      const nextMon = parseInt(mon) === 12 ? `${parseInt(year) + 1}-01-01` : `${year}-${String(parseInt(mon) + 1).padStart(2, '0')}-01`;
      query = query.gte('tax_invoice_date', dateFrom).lt('tax_invoice_date', nextMon);
    }

    // Filter voided
    if (voided === 'true') {
      query = query.not('tax_invoice_voided_at', 'is', null);
    } else if (voided === 'false') {
      query = query.is('tax_invoice_voided_at', null);
    }

    // Search
    if (search) {
      query = query.or(
        `tax_invoice_number.ilike.%${search}%,order_number.ilike.%${search}%,tax_invoice_name.ilike.%${search}%,tax_invoice_tax_id.ilike.%${search}%`
      );
    }

    query = query
      .order('tax_invoice_date', { ascending: false })
      .order('tax_invoice_number', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('GET invoices error:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      invoices: data || [],
      total: count || 0,
    });
  } catch (error) {
    console.error('GET invoices error:', error);
    return NextResponse.json({ error: 'Failed to fetch invoices' }, { status: 500 });
  }
}
