// Path: app/api/onboarding/package-info/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// GET — returns the active subscription's gating flags for the wizard so the
// onboarding UI can hide steps/features the current package doesn't support
// (e.g. Free package has stock_enabled=false → no warehouse step).
export async function GET(request: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const config = await getStockConfig(companyId);
  return NextResponse.json({
    stockEnabled: config.stockEnabled,
    maxWarehouses: config.maxWarehouses,
  });
}
