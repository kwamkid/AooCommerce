import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { canCreateWarehouse, getStockConfig } from '@/lib/stock-utils';

// GET - List warehouses
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Always return stock config (works even without warehouses table)
    const stockConfig = await getStockConfig(auth.userId!);

    // If stock not enabled, return early with empty warehouses
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({
        warehouses: [],
        stockConfig,
      });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';

    let query = supabaseAdmin
      .from('warehouses')
      .select('*')
      .eq('company_id', auth.companyId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true });

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
      // Table might not exist yet — return empty
      console.warn('GET warehouses query error (table may not exist):', error.message);
      return NextResponse.json({
        warehouses: [],
        stockConfig,
      });
    }

    return NextResponse.json({
      warehouses: data || [],
      stockConfig,
    });
  } catch (error) {
    console.error('GET warehouses error:', error);
    return NextResponse.json({ error: 'Failed to fetch warehouses' }, { status: 500 });
  }
}

// POST - Create warehouse
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRole)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    // Check tier limits
    const limitCheck = await canCreateWarehouse(auth.companyId, auth.userId!);
    if (!limitCheck.allowed) {
      if (limitCheck.max === 0) {
        return NextResponse.json({ error: 'แพ็กเกจของคุณไม่รองรับระบบคลังสินค้า กรุณาอัปเกรด' }, { status: 403 });
      }
      return NextResponse.json({ error: `แพ็กเกจนี้สร้างคลังได้สูงสุด ${limitCheck.max} คลัง (ใช้แล้ว ${limitCheck.current})` }, { status: 403 });
    }

    const body = await request.json();
    const { name, code, address } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'ชื่อคลังสินค้าจำเป็นต้องกรอก' }, { status: 400 });
    }

    // Check if this is the first warehouse → auto-set as default
    const { count: existingCount } = await supabaseAdmin
      .from('warehouses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', auth.companyId)
      .eq('is_active', true);

    const isFirst = (existingCount || 0) === 0;

    const { data, error } = await supabaseAdmin
      .from('warehouses')
      .insert({
        company_id: auth.companyId,
        name: name.trim(),
        code: code?.trim() || null,
        address: address?.trim() || null,
        is_default: isFirst,
        is_active: true,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อคลังซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true, warehouse: data });
  } catch (error) {
    console.error('POST warehouses error:', error);
    return NextResponse.json({ error: 'Failed to create warehouse' }, { status: 500 });
  }
}

// PUT - Update warehouse
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRole)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { id, name, code, address, is_default, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Warehouse ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (code !== undefined) updateData.code = code?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;
    if (is_active !== undefined) updateData.is_active = is_active;

    // If setting as default, unset other defaults first
    if (is_default === true) {
      await supabaseAdmin
        .from('warehouses')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('company_id', auth.companyId)
        .neq('id', id);
      updateData.is_default = true;
    }

    const { error } = await supabaseAdmin
      .from('warehouses')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อคลังซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT warehouses error:', error);
    return NextResponse.json({ error: 'Failed to update warehouse' }, { status: 500 });
  }
}

// DELETE - Soft delete warehouse
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!isAdminRole(auth.companyRole)) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Warehouse ID is required' }, { status: 400 });
    }

    // Check if warehouse has stock
    const { data: inventoryItems } = await supabaseAdmin
      .from('inventory')
      .select('id, quantity, reserved_quantity')
      .eq('warehouse_id', id)
      .gt('quantity', 0);

    if (inventoryItems && inventoryItems.length > 0) {
      return NextResponse.json({ error: 'ไม่สามารถลบคลังที่ยังมีสินค้าคงเหลือ กรุณาโอนย้ายสินค้าออกก่อน' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('warehouses')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE warehouses error:', error);
    return NextResponse.json({ error: 'Failed to delete warehouse' }, { status: 500 });
  }
}
