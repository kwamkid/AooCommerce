// Path: app/api/settings/delete-all-data/route.ts
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// DELETE - Delete all data except users (scoped to current company)
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

    console.log(`Starting to delete all data for company ${companyId}...`);

    // Delete in order to respect foreign key constraints
    // Start with child tables first, then parent tables

    // 1. Delete order shipments (child of order_items)
    console.log('Deleting order_shipments...');
    await supabaseAdmin.from('order_shipments').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 2. Delete order items (child of orders)
    console.log('Deleting order_items...');
    await supabaseAdmin.from('order_items').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 3. Delete orders
    console.log('Deleting orders...');
    await supabaseAdmin.from('orders').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 4. Delete product images
    console.log('Deleting product_images...');
    await supabaseAdmin.from('product_images').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 5. Delete product variations
    console.log('Deleting product_variations...');
    await supabaseAdmin.from('product_variations').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 6. Delete products
    console.log('Deleting products...');
    await supabaseAdmin.from('products').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 7. Delete shipping addresses
    console.log('Deleting shipping_addresses...');
    await supabaseAdmin.from('shipping_addresses').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    // 8. Delete customers
    console.log('Deleting customers...');
    await supabaseAdmin.from('customers').delete().eq('company_id', companyId).neq('id', '00000000-0000-0000-0000-000000000000');

    console.log(`All data deleted successfully for company ${companyId}!`);

    return NextResponse.json({
      success: true,
      message: 'ลบข้อมูลทั้งหมดสำเร็จ (ยกเว้นข้อมูลผู้ใช้)'
    });
  } catch (error) {
    console.error('Error deleting all data:', error);
    return NextResponse.json(
      { error: 'Internal server error: ' + (error instanceof Error ? error.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
