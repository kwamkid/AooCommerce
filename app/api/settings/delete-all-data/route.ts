// Path: app/api/settings/delete-all-data/route.ts
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// Helper to delete all rows of a table scoped to company
async function deleteTable(table: string, companyId: string) {
  console.log(`[Clear All Data] Deleting ${table}...`);
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq('company_id', companyId)
    .neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error(`[Clear All Data] Error deleting ${table}:`, error.message);
    // Don't throw — some tables might not exist or have no data
  }
}

// DELETE - Delete all data except users/settings (scoped to current company)
// Preserves: companies, company_members, company_settings, warehouses,
//            payment_channels, chat_accounts, shopee_accounts, pos_terminals, crm_settings
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);

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
    if (!isAdminRole(companyRoles)) {
      return NextResponse.json(
        { error: 'Forbidden. Admin access required.' },
        { status: 403 }
      );
    }

    console.log(`[Clear All Data] Starting for company ${companyId}...`);

    // Delete in order to respect foreign key constraints
    // Child tables first, then parent tables

    // --- Marketplace / Shopee Links ---
    await deleteTable('marketplace_product_links', companyId);
    await deleteTable('shopee_category_cache', companyId);

    // --- Inventory ---
    // *_items tables have ON DELETE CASCADE from parent, no company_id column
    await deleteTable('inventory_transfers', companyId);
    await deleteTable('inventory_receives', companyId);
    await deleteTable('inventory_issues', companyId);
    await deleteTable('inventory_transactions', companyId);
    await deleteTable('inventory', companyId);

    // --- Orders (POS + regular) ---
    await deleteTable('order_shipments', companyId);
    await deleteTable('payment_records', companyId);
    await deleteTable('order_items', companyId);
    await deleteTable('orders', companyId);

    // --- POS Sessions (after orders since orders reference pos_sessions) ---
    await deleteTable('pos_sessions', companyId);

    // --- Chat ---
    await deleteTable('line_messages', companyId);
    await deleteTable('line_contacts', companyId);
    await deleteTable('fb_messages', companyId);
    await deleteTable('fb_contacts', companyId);

    // --- Customers ---
    await deleteTable('customer_activities', companyId);
    await deleteTable('shipping_addresses', companyId);
    await deleteTable('customers', companyId);

    // --- Products (images → variations → products) ---
    await deleteTable('product_images', companyId);
    await deleteTable('product_variations', companyId);
    await deleteTable('products', companyId);

    // --- Product taxonomy ---
    await deleteTable('product_categories', companyId);
    await deleteTable('product_brands', companyId);
    await deleteTable('variation_types', companyId);

    // --- Price Lists ---
    await deleteTable('price_lists', companyId);

    // --- Logs ---
    await deleteTable('integration_logs', companyId);
    await deleteTable('shopee_sync_log', companyId);

    // --- Reset Shopee account sync timestamps (keep accounts connected) ---
    const { error: resetError } = await supabaseAdmin
      .from('shopee_accounts')
      .update({
        last_sync_at: null,
        last_product_sync_at: null,
      })
      .eq('company_id', companyId);
    if (resetError) {
      console.error('[Clear All Data] Error resetting shopee_accounts:', resetError.message);
    }

    console.log(`[Clear All Data] Completed for company ${companyId}`);

    return NextResponse.json({
      success: true,
      message: 'ลบข้อมูลทั้งหมดสำเร็จ (เก็บการตั้งค่า, ผู้ใช้, คลังสินค้า, ช่องทางชำระเงิน, และการเชื่อมต่อ Shopee ไว้)'
    });
  } catch (error) {
    console.error('[Clear All Data] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
