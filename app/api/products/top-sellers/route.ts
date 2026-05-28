// Path: app/api/products/top-sellers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const customerId = sp.get('customer_id');
    const days = Math.max(1, Math.min(365, Number(sp.get('days') ?? 30) || 30));
    const limit = Math.max(1, Math.min(50, Number(sp.get('limit') ?? 5) || 5));

    const { data, error } = await supabaseAdmin.rpc('get_top_seller_variations', {
      p_company_id: auth.companyId,
      p_customer_id: customerId || null,
      p_days: days,
      p_limit: limit,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] }, {
      headers: { 'Cache-Control': 'private, max-age=300' },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
