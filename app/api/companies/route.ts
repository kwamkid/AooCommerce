import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuth } from '@/lib/supabase-admin';

// GET - List user's companies
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.isAuth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: memberships, error } = await supabaseAdmin
      .from('company_members')
      .select(`
        company_id,
        role,
        company:companies (
          id, name, slug, logo_url, description, phone, email, address,
          tax_id, tax_company_name, tax_branch, website, is_active,
          created_by, created_at, updated_at
        )
      `)
      .eq('user_id', auth.userId)
      .eq('is_active', true);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ companies: memberships || [] });
  } catch (error) {
    console.error('Get companies error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create a new company
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.isAuth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, slug, description, phone, email, address, taxId, taxCompanyName, taxBranch } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อบริษัท' }, { status: 400 });
    }

    // Generate slug if not provided
    const companySlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check package limits
    const { data: subscription } = await supabaseAdmin
      .from('user_subscriptions')
      .select('package:packages(*)')
      .eq('user_id', auth.userId)
      .eq('status', 'active')
      .single();

    const pkg = subscription?.package as unknown as { max_companies: number | null } | null;
    const maxCompanies = pkg?.max_companies;

    if (maxCompanies !== null && maxCompanies !== undefined) {
      const { count } = await supabaseAdmin
        .from('company_members')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', auth.userId)
        .eq('role', 'owner')
        .eq('is_active', true);

      if (count !== null && count >= maxCompanies) {
        return NextResponse.json(
          { error: `แพ็กเกจของคุณสร้างบริษัทได้สูงสุด ${maxCompanies} บริษัท กรุณาอัพเกรดแพ็กเกจ` },
          { status: 403 }
        );
      }
    }

    // Check slug uniqueness
    const { data: existing } = await supabaseAdmin
      .from('companies')
      .select('id')
      .eq('slug', companySlug)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'ชื่อ URL นี้ถูกใช้แล้ว กรุณาเลือกชื่ออื่น' }, { status: 400 });
    }

    // Create company
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        slug: companySlug,
        description: description || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        tax_id: taxId || null,
        tax_company_name: taxCompanyName || null,
        tax_branch: taxBranch || null,
        created_by: auth.userId,
      })
      .select()
      .single();

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 });
    }

    // Add creator as owner
    await supabaseAdmin.from('company_members').insert({
      company_id: company.id,
      user_id: auth.userId,
      role: 'owner',
    });

    // Seed default CRM settings for the new company
    await supabaseAdmin.from('crm_settings').insert({
      company_id: company.id,
      setting_key: 'follow_up_day_ranges',
      setting_value: [
        { min: 0, max: 3, color: '#22C55E', label: 'ปกติ' },
        { min: 4, max: 7, color: '#EAB308', label: 'ควรติดตาม' },
        { min: 8, max: 14, color: '#F97316', label: 'เสี่ยง' },
        { min: 15, max: null, color: '#EF4444', label: 'วิกฤต' },
      ],
      description: 'ช่วงวันติดตามลูกค้า',
    });

    // Seed default variation types
    const variationTypes = [
      { name: 'ความจุ', sort_order: 1, company_id: company.id },
      { name: 'รูปทรง', sort_order: 2, company_id: company.id },
      { name: 'สี', sort_order: 3, company_id: company.id },
      { name: 'ไซซ์', sort_order: 4, company_id: company.id },
    ];
    await supabaseAdmin.from('variation_types').insert(variationTypes);

    return NextResponse.json({ success: true, company });
  } catch (error) {
    console.error('Create company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update company profile
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.isAuth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, name, description, phone, email, address, taxId, taxCompanyName, taxBranch, website } = await request.json();

    if (!id) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 });
    }

    // Check permission (owner or admin)
    const { data: membership } = await supabaseAdmin
      .from('company_members')
      .select('role')
      .eq('company_id', id)
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single();

    if (!membership || !['owner', 'admin'].includes(membership.role)) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์แก้ไขข้อมูลบริษัท' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('companies')
      .update({
        name,
        description: description || null,
        phone: phone || null,
        email: email || null,
        address: address || null,
        tax_id: taxId || null,
        tax_company_name: taxCompanyName || null,
        tax_branch: taxBranch || null,
        website: website || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, company: data });
  } catch (error) {
    console.error('Update company error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
