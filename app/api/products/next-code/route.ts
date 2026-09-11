// Path: app/api/products/next-code/route.ts
//
// GET → { code } — the product code the server would assign right now if the form's
// รหัสสินค้า is left empty (shown as the placeholder). The real assignment happens in
// POST /api/products (RPC next_product_code), so a code previewed here can still be taken
// by someone else before saving — POST then picks the next free one.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .rpc('next_product_code', { p_company_id: auth.companyId });
    if (error) {
      console.error('[products/next-code] next_product_code failed:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ code: (data as string | null) ?? null });
  } catch (error) {
    console.error('[products/next-code] GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
