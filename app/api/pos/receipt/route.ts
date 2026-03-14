// Path: app/api/pos/receipt/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — Get receipt data for a POS order
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('order_id');

    if (!orderId) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // Get order with items and payments
    const { data: order, error } = await supabaseAdmin
      .from('orders')
      .select(`
        id, order_number, receipt_number, customer_id,
        subtotal, vat_amount, discount_amount, total_amount,
        payment_method, order_status, source, pos_session_id,
        warehouse_id, notes, created_by, created_at,
        customer:customers(name, customer_code),
        items:order_items(
          product_name, variation_label, quantity, unit_price,
          discount_amount, total,
          variation:product_variations(sku, barcode)
        ),
        session:pos_sessions(cashier_name, terminal:pos_terminals(name), warehouse:warehouses(name))
      `)
      .eq('id', orderId)
      .eq('company_id', auth.companyId)
      .single();

    if (error || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 });
    }

    // Get payment records
    const { data: payments } = await supabaseAdmin
      .from('payment_records')
      .select('payment_method, amount, notes, payment_channel_id, payment_channel:payment_channels(name)')
      .eq('order_id', orderId)
      .eq('company_id', auth.companyId);

    // Get company info for receipt header
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name, address, phone, tax_id, tax_company_name, tax_branch, logo_url, vat_registered')
      .eq('id', auth.companyId)
      .single();

    // Get ABB/REC document number if auto-issued
    let taxInvoiceNumber: string | null = null;
    const vatRegistered = company?.vat_registered || false;
    if (vatRegistered) {
      const { data: abb } = await supabaseAdmin
        .from('abbreviated_invoices')
        .select('invoice_number')
        .eq('order_id', orderId)
        .eq('company_id', auth.companyId)
        .is('voided_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      taxInvoiceNumber = abb?.invoice_number || null;
    } else {
      const { data: rec } = await supabaseAdmin
        .from('receipts')
        .select('receipt_number')
        .eq('source_type', 'order')
        .eq('source_id', orderId)
        .eq('company_id', auth.companyId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      taxInvoiceNumber = rec?.receipt_number || null;
    }

    return NextResponse.json({
      receipt: {
        company: {
          name: company?.name || '',
          address: company?.address || '',
          phone: company?.phone || '',
          tax_id: company?.tax_id || '',
          tax_company_name: company?.tax_company_name || '',
          tax_branch: company?.tax_branch || '',
          logo_url: company?.logo_url || '',
          vat_registered: vatRegistered,
        },
        order: {
          receipt_number: order.receipt_number,
          order_number: order.order_number,
          subtotal: order.subtotal,
          vat_amount: order.vat_amount,
          discount_amount: order.discount_amount,
          total_amount: order.total_amount,
          payment_method: order.payment_method,
          order_status: order.order_status,
          created_at: order.created_at,
          customer_name: (order.customer as any)?.name || 'ลูกค้าทั่วไป',
          tax_invoice_number: taxInvoiceNumber,
        },
        cashier_name: (order.session as any)?.cashier_name || '',
        branch_name: (order.session as any)?.terminal?.name || (order.session as any)?.warehouse?.name || '',
        items: (order.items || []).map((item: any) => ({
          product_name: item.product_name,
          variation_label: item.variation_label,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
          total: item.total,
          sku: item.variation?.sku || null,
          barcode: item.variation?.barcode || null,
        })),
        payments: (payments || []).map(p => ({
          method: p.payment_method,
          amount: p.amount,
          channel_name: (p.payment_channel as any)?.name || p.payment_method,
          reference: p.notes,
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
