// Path: app/api/settings/features/route.ts
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { parseFeatures, DEFAULT_PRESET, DEFAULT_FEATURES, type FeatureFlags } from '@/lib/features';
import { gatesFromPackageFeatures, applyPackageGates, PERMISSIVE_GATES } from '@/lib/package-features';

// GET - read feature flags from companies.settings + active package gates
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }

    const [companyRes, subRes] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single(),
      supabaseAdmin
        .from('user_subscriptions')
        .select('package:packages(features)')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .single(),
    ]);

    if (companyRes.error) {
      return NextResponse.json({ preset: DEFAULT_PRESET, features: DEFAULT_FEATURES, gates: PERMISSIVE_GATES });
    }

    const settings = (companyRes.data?.settings as Record<string, unknown>) || {};
    const result = parseFeatures(settings);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkgFeatures = (subRes.data?.package as any)?.features || null;
    const gates = subRes.data ? gatesFromPackageFeatures(pkgFeatures) : PERMISSIVE_GATES;
    // Clamp saved feature flags to what the package actually allows. Stops a
    // downgraded subscription from continuing to expose locked features.
    const features = applyPackageGates(result.features, gates);

    return NextResponse.json({
      preset: result.preset,
      features,
      gates,
      bill_expiry_days: settings.bill_expiry_days ?? null,
      consignment_settings: settings.consignment ?? null,
      brand_gp_overrides: settings.brand_gp_overrides ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - save feature flags to companies.settings (admin only)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);

    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!companyId) {
      return NextResponse.json({ error: 'No company context' }, { status: 403 });
    }
    if (!can(companyRoles, 'settings.access')) {
      return NextResponse.json({ error: 'Only admin can update settings' }, { status: 403 });
    }

    const body = await request.json();
    const { features, consignment_settings, brand_gp_overrides } = body as {
      features: FeatureFlags;
      consignment_settings?: Record<string, unknown> | null;
      brand_gp_overrides?: unknown[] | null;
    };

    if (!features) {
      return NextResponse.json({ error: 'features is required' }, { status: 400 });
    }

    // Read current settings + package gates in parallel
    const [companyRes, subRes] = await Promise.all([
      supabaseAdmin
        .from('companies')
        .select('settings')
        .eq('id', companyId)
        .single(),
      supabaseAdmin
        .from('user_subscriptions')
        .select('package:packages(features)')
        .eq('company_id', companyId)
        .eq('status', 'active')
        .single(),
    ]);

    const currentSettings = (companyRes.data?.settings as Record<string, unknown>) || {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pkgFeatures = (subRes.data?.package as any)?.features || null;
    const gates = subRes.data ? gatesFromPackageFeatures(pkgFeatures) : PERMISSIVE_GATES;
    // Enforce package gates server-side — silently clamp instead of erroring so
    // legacy clients that haven't been updated yet still get a sensible save.
    const clampedFeatures = applyPackageGates(features, gates);
    // ช่วงเวลาส่งเป็นตัวเลือกย่อยของวันส่ง — ปิด parent แล้วต้องปิดตาม (UI ล็อก
    // อยู่แล้ว แต่กัน client เก่า/ยิง API ตรง). จุดส่ง/โซนค่าส่งเป็นอิสระ — ร้าน
    // e-commerce ที่เปิดบิลเองก็ใช้คิดค่าส่งตามพื้นที่ได้โดยไม่ต้องมีวันส่ง
    if (!clampedFeatures.delivery_date.enabled) clampedFeatures.delivery_slot = false;

    const newSettings: Record<string, unknown> = {
      ...currentSettings,
      features: clampedFeatures,
    };
    if (consignment_settings !== undefined) {
      newSettings.consignment = consignment_settings;
    }
    if (brand_gp_overrides !== undefined) {
      newSettings.brand_gp_overrides = brand_gp_overrides;
    }
    const { error: updateError } = await supabaseAdmin
      .from('companies')
      .update({ settings: newSettings })
      .eq('id', companyId);

    if (updateError) {
      console.error('Error updating features:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
