import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';

// GET - read bill_expiry_days from companies.settings
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { data } = await supabaseAdmin
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    const settings = (data?.settings as Record<string, unknown>) || {};
    return NextResponse.json({ bill_expiry_days: settings.bill_expiry_days ?? null });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - save bill_expiry_days to companies.settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!isAdminRole(companyRoles)) return NextResponse.json({ error: 'Only admin can update settings' }, { status: 403 });

    const body = await request.json();
    const { bill_expiry_days } = body as { bill_expiry_days: number | null };

    // Validate: 0 = explicitly disabled, 1-90 = enabled, null = use default (7 days)
    if (bill_expiry_days !== null && bill_expiry_days !== 0) {
      if (typeof bill_expiry_days !== 'number' || bill_expiry_days < 1 || bill_expiry_days > 90) {
        return NextResponse.json({ error: 'bill_expiry_days must be 0 (disabled), 1-90, or null' }, { status: 400 });
      }
    }

    // Read current settings, merge, save
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    const currentSettings = (company?.settings as Record<string, unknown>) || {};
    const newSettings = { ...currentSettings, bill_expiry_days };

    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({ settings: newSettings })
      .eq('id', companyId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, bill_expiry_days });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
