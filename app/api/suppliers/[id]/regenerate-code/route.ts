import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { newAccessCode } from '@/lib/portal-access';
import { guardFeature } from '@/lib/package-gates-server';


// POST - Generate/regenerate supplier portal access code
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'supplier');
    if (blocked) return blocked;
    // Regenerating a supplier's portal access code is a supplier-management action
    if (!can(auth, 'masterdata.suppliers')) {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 });
    }

    const { id } = await params;

    // Verify supplier belongs to company
    const { data: supplier, error: fetchError } = await supabaseAdmin
      .from('suppliers')
      .select('id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (fetchError || !supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    // Generate unique code (retry on collision)
    let accessCode = newAccessCode();
    let retries = 5;
    while (retries > 0) {
      const { data, error } = await supabaseAdmin
        .from('suppliers')
        .update({ access_code: accessCode, portal_enabled: true, portal_enabled_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .select('id, access_code, portal_enabled, portal_enabled_at')
        .single();

      if (!error && data) {
        return NextResponse.json({ data });
      }

      if (error?.code === '23505') {
        // Unique constraint violation — regenerate
        accessCode = newAccessCode();
        retries--;
        continue;
      }

      throw error;
    }

    return NextResponse.json({ error: 'Failed to generate unique code' }, { status: 500 });
  } catch (error) {
    console.error('POST regenerate-code error:', error);
    return NextResponse.json({ error: 'Failed to regenerate code' }, { status: 500 });
  }
}
