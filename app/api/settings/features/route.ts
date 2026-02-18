// Path: app/api/settings/features/route.ts
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { parseFeatures, DEFAULT_PRESET, DEFAULT_FEATURES, type BusinessPreset, type FeatureFlags } from '@/lib/features';

// GET - read feature flags from companies.settings
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    if (error) {
      return NextResponse.json({ preset: DEFAULT_PRESET, features: DEFAULT_FEATURES });
    }

    const settings = (data?.settings as Record<string, unknown>) || {};
    const result = parseFeatures(settings);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - save feature flags to companies.settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRole } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }
    if (!isAdminRole(companyRole)) {
      return NextResponse.json({ error: 'Only admin can update settings' }, { status: 403 });
    }

    const body = await request.json();
    const { preset, features } = body as { preset: BusinessPreset; features: FeatureFlags };

    if (!preset || !features) {
      return NextResponse.json({ error: 'preset and features are required' }, { status: 400 });
    }

    // Read current settings, merge, and save
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('settings')
      .eq('id', companyId)
      .single();

    const currentSettings = (company?.settings as Record<string, unknown>) || {};
    const newSettings = {
      ...currentSettings,
      business_preset: preset,
      features,
    };
    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({ settings: newSettings })
      .eq('id', companyId);

    if (updateError) {
      console.error('Error updating features:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, preset, features });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
