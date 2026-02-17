// Path: app/api/settings/delete-all-data/route.ts
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// Helper to delete all rows of a table scoped to company
async function deleteTable(table: string, companyId: string) {
  console.log(`Deleting ${table}...`);
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('company_id', companyId)
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error(`Error deleting ${table}:`, error.message);
    // Don't throw — some tables might not exist or have no data
  }
}

// DELETE - Delete all data except users/settings (scoped to current company)
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized. Login required.' },
        { status: 401 }
      );
    }
    if (!companyId) {
      return NextResponse.json(
        { error: 'No company context' },
        { status: 403 }
      );
    }
    if (!isAdminRole(companyRole)) {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      );
    }

    console.log(`[Clear All Data] Starting for company ${companyId}...`);

    // Delete in order to respect foreign key constraints
    // Child tables first, then parent tables

    // --- Inventory ---
    await deleteTable('inventory_transfer_items', companyId);
    await deleteTable('inventory_transfers', companyId);
    await deleteTable('inventory_receive_items', companyId);
    await deleteTable('inventory_receives', companyId);
    await deleteTable('inventory_issue_items', companyId);
    await deleteTable('inventory_issues', companyId);
    await deleteTable('inventory_transactions', companyId);
    await deleteTable('inventory', companyId);

    // --- Orders ---
    await deleteTable('order_shipments', companyId);
    await deleteTable('payment_records', companyId);
    await deleteTable('order_items', companyId);
    await deleteTable('orders', companyId);

    // --- Chat ---
    await deleteTable('line_messages', companyId);
    await deleteTable('line_message_logs', companyId);
    await deleteTable('line_contacts', companyId);
    await deleteTable('fb_messages', companyId);
    await deleteTable('fb_contacts', companyId);

    // --- Customers ---
    await deleteTable('customer_activities', companyId);
    await deleteTable('shipping_addresses', companyId);
    await deleteTable('customers', companyId);

    // --- Products ---
    await deleteTable('product_images', companyId);
    await deleteTable('product_variations', companyId);
    await deleteTable('products', companyId);

    // --- Other ---
    await deleteTable('price_lists', companyId);

    // --- Shopee sync logs (keep accounts, clear logs) ---
    console.log('Deleting shopee_sync_log...');
    const { error: syncLogError } = await supabaseAdmin
      .from('shopee_sync_log')
      .delete()
      .eq('company_id', companyId)
      .neq('id', '00000000-0000-0000-0000-000000000000');
    if (syncLogError) {
      console.error('Error deleting shopee_sync_log:', syncLogError.message);
    }

    console.log(`[Clear All Data] Completed for company ${companyId}`);

    return NextResponse.json({
      success: true,
      message: 'ลบข้อมูลทั้งหมดสำเร็จ (เก็บการตั้งค่าและ Shopee integration ไว้)'
    });
  } catch (error) {
    console.error('Error deleting all data:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
