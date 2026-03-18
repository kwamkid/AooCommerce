import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { addStock } from '@/lib/stock-service';

// GET /api/return-notes — list
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const customerId = searchParams.get('customer_id') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('return_notes')
      .select(`
        id, rn_number, rn_date, status, total_amount,
        reference_doc_type, reference_doc_number,
        reason, notes, credit_note_id,
        created_at,
        customer:customers(id, name, customer_code)
      `, { count: 'exact' })
      .eq('company_id', auth.companyId);

    if (customerId) query = query.eq('customer_id', customerId);
    if (search) query = query.or(`rn_number.ilike.%${search}%`);

    query = query
      .order('rn_date', { ascending: false })
      .order('rn_number', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ return_notes: data || [], total: count || 0 });
  } catch (err) {
    console.error('GET return-notes error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/return-notes — create
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      customer_id, warehouse_id, items, reason, notes,
      reference_doc_type, reference_doc_number, reference_doc_id,
    } = body;

    if (!customer_id || !items?.length) {
      return NextResponse.json({ error: 'กรุณาระบุลูกค้าและรายการสินค้า' }, { status: 400 });
    }

    // Generate RN number
    const { data: rnNumber } = await supabaseAdmin.rpc('generate_return_note_number', { p_company_id: auth.companyId });
    if (!rnNumber) {
      return NextResponse.json({ error: 'ไม่สามารถสร้างเลขที่ใบรับคืนได้' }, { status: 500 });
    }

    // Calculate total
    const totalAmount = items.reduce((sum: number, item: { quantity: number; unit_price: number }) =>
      sum + (item.quantity * item.unit_price), 0);

    // Insert return note
    const { data: rn, error: rnError } = await supabaseAdmin
      .from('return_notes')
      .insert({
        company_id: auth.companyId,
        rn_number: rnNumber,
        rn_date: new Date().toISOString().split('T')[0],
        customer_id,
        warehouse_id: warehouse_id || null,
        reference_doc_type: reference_doc_type || null,
        reference_doc_number: reference_doc_number || null,
        reference_doc_id: reference_doc_id || null,
        status: 'issued',
        total_amount: totalAmount,
        reason: reason || null,
        notes: notes || null,
        created_by: auth.userId,
      })
      .select('id, rn_number')
      .single();

    if (rnError || !rn) {
      console.error('Insert return note error:', rnError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบรับคืนได้' }, { status: 500 });
    }

    // Insert items
    const itemRows = items.map((item: {
      variation_id?: string; product_name: string; variation_label?: string;
      sku?: string; quantity: number; unit_price: number;
    }, idx: number) => ({
      return_note_id: rn.id,
      variation_id: item.variation_id || null,
      product_name: item.product_name,
      variation_label: item.variation_label || null,
      sku: item.sku || null,
      quantity: item.quantity,
      unit_price: item.unit_price,
      amount: item.quantity * item.unit_price,
      sort_order: idx,
    }));

    await supabaseAdmin.from('return_note_items').insert(itemRows);

    // Return stock to warehouse (if warehouse specified)
    if (warehouse_id) {
      for (const item of items as { variation_id?: string; quantity: number }[]) {
        if (!item.variation_id || item.quantity <= 0) continue;
        await addStock({
          supabase: supabaseAdmin,
          companyId: auth.companyId!,
          warehouseId: warehouse_id,
          variationId: item.variation_id,
          qty: item.quantity,
          referenceType: 'return_note',
          referenceId: rn.id,
          notes: `รับคืนสินค้า: ${rnNumber}`,
          createdBy: auth.userId,
        });
      }
    }

    // Auto issue credit note
    let cnResult: { cnNumber?: string } | null = null;
    try {
      const { data: cnNumber } = await supabaseAdmin.rpc('generate_cn_number', { p_company_id: auth.companyId });
      if (cnNumber) {
        const { data: cn } = await supabaseAdmin
          .from('credit_notes')
          .insert({
            company_id: auth.companyId,
            cn_number: cnNumber,
            order_id: null,
            return_note_id: rn.id,
            type: 'refund',
            status: 'issued',
            reason: reason || 'คืนสินค้า',
            total_amount: totalAmount,
            subtotal: totalAmount,
            discount_amount: 0,
            vat_amount: 0,
            reference_doc_type: reference_doc_type || null,
            reference_doc_number: reference_doc_number || null,
            created_by: auth.userId,
          })
          .select('id, cn_number')
          .single();

        if (cn) {
          // Link CN to return note
          await supabaseAdmin
            .from('return_notes')
            .update({ credit_note_id: cn.id })
            .eq('id', rn.id);

          // Insert CN items
          const cnItems = items.map((item: {
            variation_id?: string; product_name: string; variation_label?: string;
            sku?: string; quantity: number; unit_price: number;
          }, idx: number) => ({
            credit_note_id: cn.id,
            variation_id: item.variation_id || null,
            product_name: item.product_name,
            variation_label: item.variation_label || null,
            sku: item.sku || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            amount: item.quantity * item.unit_price,
            sort_order: idx,
          }));
          await supabaseAdmin.from('credit_note_items').insert(cnItems);
          cnResult = { cnNumber: cn.cn_number };
        }
      }
    } catch (err) {
      console.error('Auto issue CN error:', err);
    }

    return NextResponse.json({
      success: true,
      return_note_id: rn.id,
      rn_number: rnNumber,
      cn_number: cnResult?.cnNumber || null,
    });
  } catch (err) {
    console.error('POST return-notes error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
