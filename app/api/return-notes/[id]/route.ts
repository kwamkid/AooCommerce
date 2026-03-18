import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET /api/return-notes/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('return_notes')
      .select(`
        *,
        customer:customers(id, name, customer_code, phone, tax_company_name, tax_id, tax_branch,
          billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code),
        items:return_note_items(
          id, variation_id, product_name, variation_label, sku,
          quantity, unit_price, amount, sort_order
        )
      `)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .order('sort_order', { referencedTable: 'return_note_items', ascending: true })
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'ไม่พบใบรับคืนสินค้า' }, { status: 404 });
    }

    // Fetch linked credit note if exists
    let creditNote = null;
    if (data.credit_note_id) {
      const { data: cn } = await supabaseAdmin
        .from('credit_notes')
        .select('id, cn_number, status, total_amount')
        .eq('id', data.credit_note_id)
        .single();
      creditNote = cn;
    }

    return NextResponse.json({ return_note: { ...data, credit_note: creditNote } });
  } catch (err) {
    console.error('GET return-note detail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/return-notes/[id] — cancel
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'cancel') {
      const { data: existing } = await supabaseAdmin
        .from('return_notes')
        .select('id, status, credit_note_id')
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .single();

      if (!existing) return NextResponse.json({ error: 'ไม่พบใบรับคืน' }, { status: 404 });
      if (existing.status === 'cancelled') return NextResponse.json({ error: 'ใบรับคืนถูกยกเลิกแล้ว' }, { status: 400 });

      await supabaseAdmin
        .from('return_notes')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      // Cancel linked credit note too
      if (existing.credit_note_id) {
        await supabaseAdmin
          .from('credit_notes')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', existing.credit_note_id);
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (err) {
    console.error('PUT return-note error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
