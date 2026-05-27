// Path: app/api/companies/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuth } from '@/lib/supabase-admin';

// Delete one company_id-scoped table. Errors are logged (some tables may not
// exist on every project) but never thrown so a single missing table doesn't
// abort the whole delete.
async function purge(table: string, companyId: string) {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('company_id', companyId)
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) console.error(`[Delete Company] ${table}:`, error.message);
}

// DELETE - Hard-delete a company and every row that belongs to it.
// Caller must be the owner. The company row + company_members + user_subscriptions
// for this company are removed last so the foreign keys clear cleanly.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: companyId } = await params;
    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    const auth = await checkAuth(request);
    if (!auth.isAuth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Owner-only — admins on the company can't delete the whole thing.
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('roles')
      .eq('company_id', companyId)
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single();

    const roles = (membership?.roles as string[] | undefined) || [];
    if (!roles.includes('owner')) {
      return NextResponse.json(
        { error: 'เฉพาะเจ้าของบริษัทเท่านั้นที่ลบได้' },
        { status: 403 },
      );
    }

    console.log(`[Delete Company] Starting delete for company ${companyId}...`);

    // --- Logs & webhook history (lots of rows, drop first to speed FKs) ---
    await purge('integration_logs', companyId);
    await purge('marketplace_sync_log', companyId);
    await purge('marketplace_webhook_log', companyId);

    // --- Document items first, then document headers ---
    await purge('credit_note_items', companyId);
    await purge('credit_notes', companyId);
    await purge('statement_payments', companyId);
    await purge('statement_items', companyId);
    await purge('statements', companyId);
    await purge('consignment_report_items', companyId);
    await purge('consignment_reports', companyId);
    await purge('department_store_report_items', companyId);
    await purge('department_store_reports', companyId);
    await purge('department_order_items', companyId);
    await purge('department_orders', companyId);
    await purge('replenishment_items', companyId);
    await purge('replenishments', companyId);
    await purge('return_note_items', companyId);
    await purge('return_notes', companyId);
    await purge('abbreviated_invoices', companyId);
    await purge('tax_invoices', companyId);
    await purge('receipts', companyId);
    await purge('delivery_notes', companyId);
    await purge('invoices', companyId);

    // --- Orders chain ---
    await purge('order_parcel_items', companyId);
    await purge('order_parcels', companyId);
    await purge('order_shipments', companyId);
    await purge('payment_records', companyId);
    await purge('payments', companyId);
    await purge('order_items', companyId);
    await purge('orders', companyId);

    // --- Sales orders (separate module) ---
    await purge('sales_order_items', companyId);
    await purge('sales_orders', companyId);

    // --- POS ---
    await purge('pos_sessions', companyId);
    await purge('pos_terminals', companyId);

    // --- Marketplace links + accounts ---
    await purge('marketplace_deals', companyId);
    await purge('marketplace_product_links', companyId);
    await purge('marketplace_category_cache', companyId);
    await purge('marketplace_accounts', companyId);

    // --- Promotions ---
    await purge('promotion_platforms', companyId);
    await purge('promotion_tiers', companyId);
    await purge('promotion_items', companyId);
    await purge('promotions', companyId);

    // --- Inventory ---
    await purge('inventory_transfer_items', companyId);
    await purge('inventory_transfers', companyId);
    await purge('inventory_receive_items', companyId);
    await purge('inventory_receives', companyId);
    await purge('inventory_issue_items', companyId);
    await purge('inventory_issues', companyId);
    await purge('inventory_transactions', companyId);
    await purge('inventory_batches', companyId);
    await purge('stock_lot_usages', companyId);
    await purge('stock_lots', companyId);
    await purge('finished_goods', companyId);
    await purge('quality_tests', companyId);
    await purge('inventory', companyId);

    // --- Purchase / supplier ---
    await purge('purchase_order_items', companyId);
    await purge('purchase_orders', companyId);
    await purge('supplier_snapshot_receives', companyId);
    await purge('supplier_snapshot_sales', companyId);
    await purge('supplier_snapshot_stock', companyId);
    await purge('supplier_snapshots', companyId);
    await purge('supplier_materials', companyId);
    await purge('suppliers', companyId);

    // --- Chat ---
    await purge('line_message_logs', companyId);
    await purge('line_message_templates', companyId);
    await purge('line_messages', companyId);
    await purge('line_groups', companyId);
    await purge('line_users', companyId);
    await purge('line_contacts', companyId);
    await purge('fb_messages', companyId);
    await purge('fb_contacts', companyId);
    await purge('chat_accounts', companyId);

    // --- Customers ---
    await purge('contact_tag_links', companyId);
    await purge('customer_tag_links', companyId);
    await purge('customer_tags', companyId);
    await purge('customer_activities', companyId);
    await purge('customer_brand_commissions', companyId);
    await purge('shipping_addresses', companyId);
    await purge('customers', companyId);

    // --- Products ---
    await purge('product_images', companyId);
    await purge('product_variations', companyId);
    await purge('products', companyId);
    await purge('product_categories', companyId);
    await purge('product_brands', companyId);
    await purge('variation_types', companyId);
    await purge('price_lists', companyId);

    // --- Wizard-seeded resources ---
    await purge('warehouses', companyId);
    await purge('payment_channels', companyId);
    await purge('carriers', companyId);
    await purge('crm_settings', companyId);

    // --- Invitations & subscriptions ---
    await purge('company_invitations', companyId);
    await purge('user_subscriptions', companyId);

    // --- Membership (last child) ---
    const { error: memErr } = await supabaseAdmin
      .from('company_members')
      .delete()
      .eq('company_id', companyId);
    if (memErr) console.error('[Delete Company] company_members:', memErr.message);

    // --- The company row itself ---
    const { error: companyErr } = await supabaseAdmin
      .from('companies')
      .delete()
      .eq('id', companyId);
    if (companyErr) {
      console.error('[Delete Company] companies:', companyErr.message);
      return NextResponse.json(
        { error: `ลบบริษัทไม่สำเร็จ: ${companyErr.message}` },
        { status: 500 },
      );
    }

    console.log(`[Delete Company] Completed for company ${companyId}`);
    return NextResponse.json({ success: true, message: 'ลบบริษัทเรียบร้อย' });
  } catch (error) {
    console.error('[Delete Company] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 },
    );
  }
}
