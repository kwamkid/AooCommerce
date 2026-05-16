import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

const VALID_CHANNELS = ['retail', 'wholesale', 'consignment', 'marketplace', 'pos'] as const;
type Channel = (typeof VALID_CHANNELS)[number];

// POST — save selected business channels (Step 1 of wizard)
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
  const channels = filtered.length === 0 ? ['retail'] : Array.from(new Set(filtered));

  const { error } = await supabaseAdmin
    .from('companies')
    .update({ business_channels: channels })
    .eq('id', auth.companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, channels });
}
