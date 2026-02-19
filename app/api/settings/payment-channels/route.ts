import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// GET - Fetch payment channels
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const group = searchParams.get('group') || 'bill_online';

    let { data, error } = await supabaseAdmin
      .from('payment_channels')
      .select('*')
      .eq('company_id', companyId)
      .eq('channel_group', group)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    // Auto-seed default channels if none exist for this company+group
    if (!data || data.length === 0) {
      let seedRows: Array<Record<string, unknown>> = [];

      if (group === 'bill_online') {
        seedRows = [
          {
            company_id: companyId,
            channel_group: 'bill_online',
            type: 'cash',
            name: 'เงินสด',
            is_active: true,
            sort_order: 0,
            config: { description: 'รับเงินสดจากลูกค้า / จ่ายหน้าร้าน' },
          },
          {
            company_id: companyId,
            channel_group: 'bill_online',
            type: 'payment_gateway',
            name: 'ชำระออนไลน์',
            is_active: false,
            sort_order: 99,
            config: {},
          },
        ];
      } else if (group === 'pos') {
        seedRows = [
          {
            company_id: companyId,
            channel_group: 'pos',
            type: 'cash',
            name: 'เงินสด',
            is_active: true,
            sort_order: 0,
            config: {},
          },
          {
            company_id: companyId,
            channel_group: 'pos',
            type: 'bank_transfer',
            name: 'โอนเงิน',
            is_active: true,
            sort_order: 1,
            config: {},
          },
        ];
      }

      if (seedRows.length > 0) {
        const { error: seedError } = await supabaseAdmin
          .from('payment_channels')
          .insert(seedRows);

        if (seedError) {
          console.error('Auto-seed payment channels error:', seedError);
        } else {
          // Re-fetch after seeding
          const refetch = await supabaseAdmin
            .from('payment_channels')
            .select('*')
            .eq('company_id', companyId)
            .eq('channel_group', group)
            .order('sort_order', { ascending: true });
          data = refetch.data;
        }
      }
    }

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to fetch payment channels' }, { status: 500 });
  }
}

// POST - Create payment channel (bank_transfer or payment_gateway)
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { type, name, config, channel_group = 'bill_online' } = body;

    if (!type || !name) {
      return NextResponse.json({ error: 'type and name are required' }, { status: 400 });
    }

    // Validate based on type
    if (type === 'bank_transfer') {
      // POS group doesn't require bank details
      if (channel_group !== 'pos' && (!config?.bank_code || !config?.account_number || !config?.account_name)) {
        return NextResponse.json({ error: 'bank_code, account_number, account_name are required' }, { status: 400 });
      }
    } else if (type === 'card_terminal' || type === 'other') {
      // POS-specific types — just need a name
    } else if (type === 'payment_gateway') {
      // Check singleton
      const { data: existing } = await supabaseAdmin
        .from('payment_channels')
        .select('id')
        .eq('company_id', companyId)
        .eq('channel_group', channel_group)
        .eq('type', 'payment_gateway')
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Payment gateway already exists. Use PUT to update.' }, { status: 400 });
      }
    } else if (type === 'cash') {
      return NextResponse.json({ error: 'Cash channel is auto-created. Use PUT to toggle.' }, { status: 400 });
    }

    // Get next sort_order (across all types in this group)
    const { data: maxData } = await supabaseAdmin
      .from('payment_channels')
      .select('sort_order')
      .eq('company_id', companyId)
      .eq('channel_group', channel_group)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();
    const sortOrder = (maxData?.sort_order || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('payment_channels')
      .insert({
        company_id: companyId,
        channel_group,
        type,
        name: name.trim(),
        config: config || {},
        sort_order: sortOrder,
        is_active: true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('POST payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to create payment channel' }, { status: 500 });
  }
}

// PUT - Update payment channel
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { id, name, is_active, config, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (is_active !== undefined) updateData.is_active = is_active;
    if (config !== undefined) updateData.config = config;
    if (sort_order !== undefined) updateData.sort_order = sort_order;

    const { data, error } = await supabaseAdmin
      .from('payment_channels')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('PUT payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to update payment channel' }, { status: 500 });
  }
}

// PATCH - Batch reorder payment channels
export async function PATCH(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { orders } = body as { orders: { id: string; sort_order: number }[] };

    if (!orders || !Array.isArray(orders)) {
      return NextResponse.json({ error: 'orders array is required' }, { status: 400 });
    }

    // Update each channel's sort_order
    for (const item of orders) {
      await supabaseAdmin
        .from('payment_channels')
        .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('company_id', companyId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to reorder payment channels' }, { status: 500 });
  }
}

// DELETE - Delete bank account (bank_transfer only)
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    // Only allow deleting bank_transfer rows
    const { data: channel } = await supabaseAdmin
      .from('payment_channels')
      .select('type')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    if (channel.type === 'cash' || channel.type === 'payment_gateway') {
      return NextResponse.json({ error: 'ช่องทางนี้ไม่สามารถลบได้ ให้ใช้ toggle เปิด/ปิดแทน' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('payment_channels')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to delete payment channel' }, { status: 500 });
  }
}
