import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - List all brand commissions for a customer
// ?customer_id=xxx
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_brand_commissions')
      .select('*, brand:product_brands(id, name)')
      .eq('company_id', auth.companyId)
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (error) {
    console.error('GET customer-brand-commissions error:', error);
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 });
  }
}

// POST - Create or update commission (upsert)
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { customer_id, brand_id, gp_rate } = body;

    if (!customer_id || !brand_id) {
      return NextResponse.json({ error: 'customer_id and brand_id are required' }, { status: 400 });
    }

    if (gp_rate === null || gp_rate === undefined || gp_rate === '') {
      return NextResponse.json({ error: 'gp_rate is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('customer_brand_commissions')
      .upsert({
        company_id: auth.companyId,
        customer_id,
        brand_id,
        gp_rate: Number(gp_rate),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'customer_id,brand_id',
      })
      .select('*, brand:product_brands(id, name)')
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    console.error('POST customer-brand-commissions error:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}

// DELETE - Remove commission by id
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('customer_brand_commissions')
      .delete()
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE customer-brand-commissions error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}
