import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';

// GET - Fetch all active suppliers
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .select('*')
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET suppliers error:', error);
    return NextResponse.json({ error: 'Failed to fetch suppliers' }, { status: 500 });
  }
}

// POST - Create supplier
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.suppliers')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { name, contact_name, phone, email, address, tax_id, supplier_type, payment_terms, bank_code, bank_name, bank_account, bank_account_name, branch, is_vat_registered, notes } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: 'กรุณากรอกชื่อซัพพลายเออร์' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .insert({
        company_id: auth.companyId,
        name: name.trim(),
        contact_name: contact_name?.trim() || null,
        phone: phone?.trim() || null,
        email: email?.trim() || null,
        address: address?.trim() || null,
        tax_id: tax_id?.trim() || null,
        supplier_type: supplier_type || 'cash',
        payment_terms: payment_terms || 0,
        bank_code: bank_code?.trim() || null,
        bank_name: bank_name?.trim() || null,
        bank_account: bank_account?.trim() || null,
        bank_account_name: bank_account_name?.trim() || null,
        branch: branch?.trim() || null,
        is_vat_registered: is_vat_registered ?? false,
        notes: notes?.trim() || null,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ซัพพลายเออร์นี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('POST suppliers error:', error);
    return NextResponse.json({ error: 'Failed to create supplier' }, { status: 500 });
  }
}

// PUT - Update supplier
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.suppliers')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await request.json();
    const { id, ...fields } = body;

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    const stringFields = ['name', 'contact_name', 'phone', 'email', 'address', 'tax_id', 'supplier_type', 'bank_code', 'bank_name', 'bank_account', 'bank_account_name', 'branch', 'notes'] as const;
    for (const key of stringFields) {
      if (fields[key] !== undefined) {
        updateData[key] = typeof fields[key] === 'string' ? fields[key].trim() || null : fields[key];
      }
    }
    if (fields.name !== undefined) updateData.name = fields.name.trim(); // name can't be null
    if (fields.payment_terms !== undefined) updateData.payment_terms = fields.payment_terms;
    if (fields.portal_enabled !== undefined) updateData.portal_enabled = fields.portal_enabled;
    if (fields.is_vat_registered !== undefined) updateData.is_vat_registered = fields.is_vat_registered;

    const { data, error } = await supabaseAdmin
      .from('suppliers')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ซัพพลายเออร์นี้มีอยู่แล้ว' }, { status: 400 });
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('PUT suppliers error:', error);
    return NextResponse.json({ error: 'Failed to update supplier' }, { status: 500 });
  }
}

// DELETE - Soft delete supplier
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'masterdata.suppliers')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('suppliers')
      .update({ is_active: false })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE suppliers error:', error);
    return NextResponse.json({ error: 'Failed to delete supplier' }, { status: 500 });
  }
}
