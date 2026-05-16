import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

interface Body {
  use_warehouse?: boolean;
  name?: string;
  address?: string | null;
  district?: string | null;
  amphoe?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
}

// POST — Step 2 of wizard. If use_warehouse=true, ensure a warehouse exists.
// If false, skip insert and remember the choice in companies.settings.
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const useWarehouse = body?.use_warehouse !== false; // default true

  // Persist the toggle in companies.settings.use_warehouse.
  // We re-read settings to merge — companies.settings is jsonb.
  const { data: company, error: getErr } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();
  if (getErr) return NextResponse.json({ error: getErr.message }, { status: 500 });

  const currentSettings = (company?.settings as Record<string, unknown> | null) || {};
  const newSettings = { ...currentSettings, use_warehouse: useWarehouse };

  await supabaseAdmin
    .from('companies')
    .update({ settings: newSettings })
    .eq('id', auth.companyId);

  if (useWarehouse) {
    // Create the first warehouse only if the company has none yet (idempotent for retries).
    const { count } = await supabaseAdmin
      .from('warehouses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', auth.companyId);

    if ((count ?? 0) === 0) {
      const name = (body?.name || '').trim() || 'คลังหลัก';
      // warehouses.address is a single text column; concat the address parts the
      // wizard collects via ThaiAddressInput so the data is captured even though
      // the schema doesn't keep them as separate fields.
      const addressParts = [
        body?.address,
        body?.district,
        body?.amphoe,
        body?.province,
        body?.postal_code,
      ].map(s => s?.toString().trim()).filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

      const { error: insErr } = await supabaseAdmin.from('warehouses').insert({
        company_id: auth.companyId,
        name,
        address: fullAddress,
        is_active: true,
        is_default: true,
        warehouse_type: 'internal',
        created_by: auth.userId,
      });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, use_warehouse: useWarehouse });
}
