import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { DEFAULT_FEATURES, type FeatureFlags } from '@/lib/features';

const VALID_CHANNELS = ['retail', 'wholesale', 'consignment', 'marketplace', 'pos'] as const;
type Channel = (typeof VALID_CHANNELS)[number];

// Map a wizard channel checkbox to the feature flags it should turn on in
// companies.settings.features. retail is the base case (no extra flags).
// wholesale → enables credit billing (วางบิล/เครดิต) which is the typical
// payment model for B2B. consignment auto-enables supplier (mirrors the
// auto-enable rule in the Features เสริม page).
function deriveFeatureFlagsFromChannels(channels: Channel[], current: FeatureFlags): FeatureFlags {
  const next: FeatureFlags = {
    ...current,
    delivery_date: { ...current.delivery_date },
  };
  for (const channel of channels) {
    switch (channel) {
      case 'marketplace':
        next.marketplace_sync = true;
        break;
      case 'pos':
        next.pos = true;
        break;
      case 'consignment':
        next.consignment = true;
        next.supplier = true;
        break;
      case 'wholesale':
        next.billing_cycle = true;
        break;
      case 'retail':
        // base case — no extra feature flags
        break;
    }
  }
  return next;
}

// POST — save selected business channels (Step 1 of wizard).
// Also derives feature flags in companies.settings.features so the toggles
// in Settings → Feature เสริม reflect what the user picked here.
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => null) as { channels?: string[] } | null;
  const requested = Array.isArray(body?.channels) ? body!.channels : [];
  const filtered = requested.filter((c): c is Channel => VALID_CHANNELS.includes(c as Channel));
  // Empty array → fallback to retail (defensive default).
  const channels = (filtered.length === 0 ? ['retail'] : Array.from(new Set(filtered))) as Channel[];

  // Read current settings so we can merge derived features in (preserves any
  // existing flags the wizard didn't touch, e.g. delivery_date defaults).
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', auth.companyId)
    .single();

  const currentSettings = (company?.settings as Record<string, unknown> | null) || {};
  const currentFeatures = (currentSettings.features as FeatureFlags | undefined) || DEFAULT_FEATURES;
  const derivedFeatures = deriveFeatureFlagsFromChannels(channels, currentFeatures);

  const newSettings = {
    ...currentSettings,
    features: derivedFeatures,
  };

  const { error } = await supabaseAdmin
    .from('companies')
    .update({ business_channels: channels, settings: newSettings })
    .eq('id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, channels, features: derivedFeatures });
}
