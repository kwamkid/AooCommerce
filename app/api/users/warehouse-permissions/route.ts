// Path: app/api/users/warehouse-permissions/route.ts
// Manage user-warehouse permissions (which warehouses a user can access)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

// GET - Get warehouse permissions for a user
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    if (userId) {
      // Get specific user's warehouse permissions
      const { data: member } = await supabaseAdmin
        .from('company_members')
        .select('warehouse_ids, terminal_ids')
        .eq('company_id', auth.companyId)
        .eq('user_id', userId)
        .single();

      // null = all access, [] = no access, ['id',...] = specific access
      return NextResponse.json({
        warehouse_ids: member?.warehouse_ids ?? null,
        terminal_ids: member?.terminal_ids ?? null,
      });
    }

    // Get all members with their warehouse permissions
    const { data: members, error } = await supabaseAdmin
      .from('company_members')
      .select('user_id, roles, warehouse_ids, terminal_ids')
      .eq('company_id', auth.companyId)
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ members: members || [] });
  } catch (error) {
    console.error('GET warehouse-permissions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update warehouse permissions for a user
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { user_id, warehouse_ids, terminal_ids } = await request.json();
    if (!user_id) {
      return NextResponse.json({ error: 'user_id is required' }, { status: 400 });
    }

    // Verify user is a member of this company
    const { data: member } = await supabaseAdmin
      .from('company_members')
      .select('id')
      .eq('company_id', auth.companyId)
      .eq('user_id', user_id)
      .single();

    if (!member) {
      return NextResponse.json({ error: 'User is not a member of this company' }, { status: 404 });
    }

    // Validate warehouse_ids belong to this company
    if (warehouse_ids && warehouse_ids.length > 0) {
      const { data: warehouses } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', auth.companyId)
        .in('id', warehouse_ids);

      if (!warehouses || warehouses.length !== warehouse_ids.length) {
        return NextResponse.json({ error: 'Invalid warehouse IDs' }, { status: 400 });
      }
    }

    // Update warehouse_ids and terminal_ids
    // null = access all, [] = no access, ['id',...] = specific access
    const { error } = await supabaseAdmin
      .from('company_members')
      .update({
        warehouse_ids: warehouse_ids === null || warehouse_ids === undefined ? null : warehouse_ids,
        terminal_ids: terminal_ids === null || terminal_ids === undefined ? null : terminal_ids,
        updated_at: new Date().toISOString(),
      })
      .eq('company_id', auth.companyId)
      .eq('user_id', user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT warehouse-permissions error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
