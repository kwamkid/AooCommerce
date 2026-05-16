import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';

// Master list of system carriers — kept in sync with the carriers seed migration.
// Each entry is what we'd insert when the user ticks the checkbox in Step 3.
const SYSTEM_CARRIERS: Array<{
  code: string;
  name: string;
  tracking_url_template: string | null;
  shippop_courier_code: string | null;
  sort_order: number;
}> = [
  { code: 'thai_post', name: 'ไปรษณีย์ไทย',  tracking_url_template: 'https://track.thailandpost.co.th/?trackNumber={tracking}', shippop_courier_code: 'EMST', sort_order: 1 },
  { code: 'kerry',     name: 'Kerry Express', tracking_url_template: 'https://th.kerryexpress.com/th/track/?track={tracking}',   shippop_courier_code: 'KEX',  sort_order: 2 },
  { code: 'flash',     name: 'Flash Express', tracking_url_template: 'https://www.flashexpress.co.th/tracking/?se={tracking}',   shippop_courier_code: 'FLE',  sort_order: 3 },
  { code: 'j&t',       name: 'J&T Express',   tracking_url_template: 'https://www.jtexpress.co.th/index/query/gzquery.html?bills={tracking}', shippop_courier_code: 'JNT', sort_order: 4 },
  { code: 'scg',       name: 'SCG Express',   tracking_url_template: 'https://www.scgexpress.co.th/tracking?tracking_no={tracking}', shippop_courier_code: 'SCG', sort_order: 5 },
  { code: 'ninja',     name: 'Ninja Van',     tracking_url_template: 'https://www.ninjavan.co/th-th/tracking?id={tracking}',     shippop_courier_code: 'NJV',  sort_order: 6 },
  { code: 'best',      name: 'BEST Express',  tracking_url_template: 'https://www.best-inc.co.th/track?bills={tracking}',        shippop_courier_code: 'BEST', sort_order: 7 },
  { code: 'dhl',       name: 'DHL',           tracking_url_template: 'https://www.dhl.com/th-en/home/tracking.html?tracking-id={tracking}', shippop_courier_code: 'DHL', sort_order: 8 },
  { code: 'grab',      name: 'Grab Express',  tracking_url_template: null, shippop_courier_code: null, sort_order: 9 },
  { code: 'lalamove',  name: 'Lalamove',      tracking_url_template: null, shippop_courier_code: 'LLM', sort_order: 10 },
  { code: 'self',      name: 'จัดส่งเอง',     tracking_url_template: null, shippop_courier_code: null, sort_order: 11 },
  { code: 'other',     name: 'อื่นๆ',         tracking_url_template: null, shippop_courier_code: null, sort_order: 99 },
];

const VALID_CODES = new Set(SYSTEM_CARRIERS.map(c => c.code));

// POST — Step 3 of wizard. Seed only the carriers the user ticked.
// Idempotent: existing rows are left alone (matched by company_id + code).
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { codes?: string[] } | null;
  const requested = (Array.isArray(body?.codes) ? body!.codes : [])
    .map(c => c.toString().trim().toLowerCase())
    .filter(c => VALID_CODES.has(c));

  // Always include 'self' + 'other' so users can record manual / unknown carriers.
  const codes = Array.from(new Set([...requested, 'self', 'other']));

  const rows = SYSTEM_CARRIERS
    .filter(c => codes.includes(c.code))
    .map(c => ({
      company_id: auth.companyId!,
      code: c.code,
      name: c.name,
      tracking_url_template: c.tracking_url_template,
      shippop_courier_code: c.shippop_courier_code,
      is_system: true,
      is_active: true,
      sort_order: c.sort_order,
    }));

  // Use upsert so re-running this endpoint (back/forward in wizard) is safe.
  const { error } = await supabaseAdmin
    .from('carriers')
    .upsert(rows, { onConflict: 'company_id,code', ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, seeded: rows.map(r => r.code) });
}
