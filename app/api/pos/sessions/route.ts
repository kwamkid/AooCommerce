// Path: app/api/pos/sessions/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — Find open session for current user or list sessions
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('pos_sessions')
      .select('*, warehouse:warehouses(id, name, code), terminal:pos_terminals(id, name, code)')
      .eq('company_id', auth.companyId)
      .order('opened_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    // If looking for open session, filter by current user
    if (status === 'open') {
      query = query.eq('cashier_user_id', auth.userId!);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ sessions: data });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Open a new shift
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { terminal_id, warehouse_id: direct_warehouse_id, opening_float = 0 } = body;

    // Check if user already has an open session
    const { data: existingOpen } = await supabaseAdmin
      .from('pos_sessions')
      .select('id')
      .eq('cashier_user_id', auth.userId!)
      .eq('company_id', auth.companyId)
      .eq('status', 'open')
      .limit(1);

    if (existingOpen && existingOpen.length > 0) {
      return NextResponse.json(
        { error: 'คุณมีกะที่เปิดอยู่แล้ว กรุณาปิดกะเดิมก่อน' },
        { status: 400 }
      );
    }

    let effectiveWarehouseId: string | null = null;

    if (terminal_id) {
      // New path: validate terminal → derive warehouse from terminal
      const { data: terminal } = await supabaseAdmin
        .from('pos_terminals')
        .select('id, warehouse_id')
        .eq('id', terminal_id)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .single();

      if (!terminal) {
        return NextResponse.json({ error: 'จุดขายไม่พบหรือปิดใช้งาน' }, { status: 404 });
      }

      // Validate terminal access via company_members.terminal_ids
      const { data: membership } = await supabaseAdmin
        .from('company_members')
        .select('terminal_ids')
        .eq('user_id', auth.userId!)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .single();

      if (membership?.terminal_ids && membership.terminal_ids.length > 0) {
        if (!membership.terminal_ids.includes(terminal_id)) {
          return NextResponse.json(
            { error: 'คุณไม่มีสิทธิ์เข้าถึงจุดขายนี้' },
            { status: 403 }
          );
        }
      }

      effectiveWarehouseId = terminal.warehouse_id || null;
    } else if (direct_warehouse_id) {
      // Backward compat: direct warehouse_id without terminal
      const { data: membership } = await supabaseAdmin
        .from('company_members')
        .select('warehouse_ids')
        .eq('user_id', auth.userId!)
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .single();

      if (Array.isArray(membership?.warehouse_ids)) {
        if (!membership.warehouse_ids.includes(direct_warehouse_id)) {
          return NextResponse.json(
            { error: 'คุณไม่มีสิทธิ์เข้าถึงคลังสินค้านี้' },
            { status: 403 }
          );
        }
      }
      effectiveWarehouseId = direct_warehouse_id;
    }

    // Get cashier name from user profile
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('name')
      .eq('id', auth.userId!)
      .single();

    const cashierName = profile?.name || 'Unknown';

    // Create session
    const insertData: Record<string, unknown> = {
      company_id: auth.companyId,
      cashier_user_id: auth.userId,
      cashier_name: cashierName,
      opening_float: opening_float || 0,
      status: 'open',
      opened_at: new Date().toISOString(),
    };
    if (terminal_id) {
      insertData.terminal_id = terminal_id;
    }
    if (effectiveWarehouseId) {
      insertData.warehouse_id = effectiveWarehouseId;
    }

    const { data: session, error } = await supabaseAdmin
      .from('pos_sessions')
      .insert(insertData)
      .select('*, warehouse:warehouses(id, name, code), terminal:pos_terminals(id, name, code)')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ session });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — Close a shift
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, closing_cash, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Session id is required' }, { status: 400 });
    }

    // Get session
    const { data: session, error: fetchError } = await supabaseAdmin
      .from('pos_sessions')
      .select('*')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .eq('status', 'open')
      .single();

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found or already closed' }, { status: 404 });
    }

    // Calculate payment summary from orders in this session
    const { data: sessionOrders } = await supabaseAdmin
      .from('orders')
      .select('id, total_amount, payment_method, order_status')
      .eq('pos_session_id', id)
      .eq('company_id', auth.companyId);

    const completedOrders = (sessionOrders || []).filter(o => o.order_status === 'completed');

    // Get all payment records for completed orders
    const orderIds = completedOrders.map(o => o.id);
    const { data: allPayments } = orderIds.length > 0
      ? await supabaseAdmin
          .from('payment_records')
          .select('amount, payment_method, payment_channel_id')
          .in('order_id', orderIds)
      : { data: [] };

    // Build payment summary
    const paymentSummary: Record<string, number> = {};
    let totalCashReceived = 0;
    for (const p of (allPayments || [])) {
      const method = p.payment_method || 'other';
      paymentSummary[method] = (paymentSummary[method] || 0) + Number(p.amount || 0);
      if (method === 'cash') {
        totalCashReceived += Number(p.amount || 0);
      }
    }

    const expectedCash = Number(session.opening_float || 0) + totalCashReceived;
    const actualCash = Number(closing_cash || 0);
    const cashDifference = actualCash - expectedCash;

    // Update session
    const { data: updatedSession, error: updateError } = await supabaseAdmin
      .from('pos_sessions')
      .update({
        status: 'closed',
        closing_cash: actualCash,
        expected_cash: expectedCash,
        cash_difference: cashDifference,
        payment_summary: paymentSummary,
        notes: notes || null,
        closed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, warehouse:warehouses(id, name, code), terminal:pos_terminals(id, name, code)')
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ session: updatedSession });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
