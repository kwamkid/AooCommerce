// Path: app/api/pos/terminals/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

// GET — List POS terminals
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') === 'true';

    let query = supabaseAdmin
      .from('pos_terminals')
      .select('*, warehouse:warehouses(id, name, code)')
      .eq('company_id', auth.companyId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ terminals: [] });
    }

    return NextResponse.json({ terminals: data || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Create a POS terminal
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, warehouse_id } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'ชื่อจุดขายจำเป็นต้องกรอก' }, { status: 400 });
    }

    // Validate warehouse belongs to this company (if provided)
    if (warehouse_id) {
      const { data: wh } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('id', warehouse_id)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .single();

      if (!wh) {
        return NextResponse.json({ error: 'คลังสินค้าไม่ถูกต้อง' }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('pos_terminals')
      .insert({
        company_id: auth.companyId,
        name: name.trim(),
        code: code?.trim() || null,
        warehouse_id: warehouse_id || null,
        is_active: true,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*, warehouse:warehouses(id, name, code)')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true, terminal: data });
  } catch (error) {
    console.error('POST pos/terminals error:', error);
    return NextResponse.json({ error: 'Failed to create terminal' }, { status: 500 });
  }
}

// PUT — Update a POS terminal
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, code, warehouse_id, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Terminal ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;

    // Handle warehouse_id (can be set to null to remove warehouse link)
    if (warehouse_id !== undefined) {
      if (warehouse_id) {
        // Validate warehouse belongs to this company
        const { data: wh } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('id', warehouse_id)
          .eq('company_id', auth.companyId)
          .eq('is_active', true)
          .single();

        if (!wh) {
          return NextResponse.json({ error: 'คลังสินค้าไม่ถูกต้อง' }, { status: 400 });
        }
      }
      updateData.warehouse_id = warehouse_id || null;
    }

    const { error } = await supabaseAdmin
      .from('pos_terminals')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT pos/terminals error:', error);
    return NextResponse.json({ error: 'Failed to update terminal' }, { status: 500 });
  }
}

// PATCH — Batch reorder terminals
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { orders } = body as { orders: { id: string; sort_order: number }[] };

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: 'orders array is required' }, { status: 400 });
    }

    for (const item of orders) {
      await supabaseAdmin
        .from('pos_terminals')
        .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('company_id', auth.companyId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH pos/terminals error:', error);
    return NextResponse.json({ error: 'Failed to reorder terminals' }, { status: 500 });
  }
}

// DELETE — Delete a POS terminal
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRoles)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Terminal ID is required' }, { status: 400 });
    }

    // Block deletion if there are open sessions
    const { data: openSessions } = await supabaseAdmin
      .from('pos_sessions')
      .select('id')
      .eq('terminal_id', id)
      .eq('status', 'open')
      .limit(1);

    if (openSessions && openSessions.length > 0) {
      return NextResponse.json({ error: 'ไม่สามารถลบจุดขายที่มีกะเปิดอยู่ กรุณาปิดกะก่อน' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('pos_terminals')
      .delete()
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE pos/terminals error:', error);
    return NextResponse.json({ error: 'Failed to delete terminal' }, { status: 500 });
  }
}
