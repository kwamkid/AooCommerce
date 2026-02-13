import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string; isAdmin?: boolean }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return { isAuth: false };
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return { isAuth: false };

    // Check admin role
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    return { isAuth: true, userId: user.id, isAdmin: profile?.role === 'admin' };
  } catch {
    return { isAuth: false };
  }
}

// GET - Fetch payment channels
export async function GET(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const group = searchParams.get('group') || 'bill_online';

    const { data, error } = await supabaseAdmin
      .from('payment_channels')
      .select('*')
      .eq('channel_group', group)
      .order('sort_order', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to fetch payment channels' }, { status: 500 });
  }
}

// POST - Create payment channel (bank_transfer or payment_gateway)
export async function POST(request: NextRequest) {
  try {
    const { isAuth, isAdmin } = await checkAuth(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { type, name, config, channel_group = 'bill_online' } = body;

    if (!type || !name) {
      return NextResponse.json({ error: 'type and name are required' }, { status: 400 });
    }

    // Validate based on type
    if (type === 'bank_transfer') {
      if (!config?.bank_code || !config?.account_number || !config?.account_name) {
        return NextResponse.json({ error: 'bank_code, account_number, account_name are required' }, { status: 400 });
      }
    } else if (type === 'payment_gateway') {
      // Check singleton
      const { data: existing } = await supabaseAdmin
        .from('payment_channels')
        .select('id')
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
      .eq('channel_group', channel_group)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();
    const sortOrder = (maxData?.sort_order || 0) + 1;

    const { data, error } = await supabaseAdmin
      .from('payment_channels')
      .insert({
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
    const { isAuth, isAdmin } = await checkAuth(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

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
    const { isAuth, isAdmin } = await checkAuth(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

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
        .eq('id', item.id);
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
    const { isAuth, isAdmin } = await checkAuth(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!isAdmin) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

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
      .single();

    if (!channel) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 });
    }

    if (channel.type !== 'bank_transfer') {
      return NextResponse.json({ error: 'Only bank accounts can be deleted. Use toggle for other types.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('payment_channels')
      .delete()
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE payment-channels error:', error);
    return NextResponse.json({ error: 'Failed to delete payment channel' }, { status: 500 });
  }
}
