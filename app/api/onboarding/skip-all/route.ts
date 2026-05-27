import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// Default carrier seed (top 4 + self + other) — same as Step 3's prefill checkboxes.
const DEFAULT_CARRIERS = [
  { code: 'thai_post', name: 'ไปรษณีย์ไทย',  url: 'https://track.thailandpost.co.th/?trackNumber={tracking}', shippop: 'EMST', sort: 1 },
  { code: 'kerry',     name: 'Kerry Express', url: 'https://th.kerryexpress.com/th/track/?track={tracking}',   shippop: 'KEX',  sort: 2 },
  { code: 'flash',     name: 'Flash Express', url: 'https://www.flashexpress.co.th/tracking/?se={tracking}',   shippop: 'FLE',  sort: 3 },
  { code: 'j&t',       name: 'J&T Express',   url: 'https://www.jtexpress.co.th/index/query/gzquery.html?bills={tracking}', shippop: 'JNT', sort: 4 },
  { code: 'self',      name: 'จัดส่งเอง',     url: null, shippop: null, sort: 11 },
  { code: 'other',     name: 'อื่นๆ',         url: null, shippop: null, sort: 99 },
];

// POST — "ข้ามทั้งหมด" button on the wizard header.
// Seeds every wizard-controlled default in one transaction-like sequence and
// marks the company as onboarded. Equivalent to clicking "ถัดไป" through every
// step without changing prefilled values.
export async function POST(request: NextRequest) {
  const auth = await checkAuthWithCompany(request);
  if (!auth.isAuth || !auth.companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdminRole(auth.companyRoles)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const companyId = auth.companyId;

  // 1) channels: prefill = retail only
  await supabaseAdmin
    .from('companies')
    .update({ business_channels: ['retail'] })
    .eq('id', companyId);

  // 2) warehouse: prefill = create "คลังหลัก" if package allows it.
  // Free package has stock_enabled=false → skip warehouse creation + force
  // features.stock=false so the rest of the app hides stock UI.
  const stockConfig = await getStockConfig(companyId);
  if (stockConfig.stockEnabled) {
    const { count: whCount } = await supabaseAdmin
      .from('warehouses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if ((whCount ?? 0) === 0) {
      await supabaseAdmin.from('warehouses').insert({
        company_id: companyId,
        name: 'คลังหลัก',
        is_active: true,
        is_default: true,
        warehouse_type: 'internal',
        created_by: auth.userId,
      });
    }
  }

  // Persist use_warehouse + features.stock in companies.settings
  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  const currentSettings = (company?.settings as Record<string, unknown> | null) || {};
  const currentFeatures = (currentSettings.features as Record<string, unknown> | undefined) || {};
  await supabaseAdmin
    .from('companies')
    .update({
      settings: {
        ...currentSettings,
        use_warehouse: stockConfig.stockEnabled,
        features: { ...currentFeatures, stock: stockConfig.stockEnabled },
      },
    })
    .eq('id', companyId);

  // 3) carriers: prefill = top 4 + self + other
  const carrierRows = DEFAULT_CARRIERS.map(c => ({
    company_id: companyId,
    code: c.code,
    name: c.name,
    tracking_url_template: c.url,
    shippop_courier_code: c.shippop,
    is_system: true,
    is_active: true,
    sort_order: c.sort,
  }));
  await supabaseAdmin
    .from('carriers')
    .upsert(carrierRows, { onConflict: 'company_id,code', ignoreDuplicates: true });

  // 4) payment: prefill = cash only (only seed if no payment_channels exist yet)
  const { count: pcCount } = await supabaseAdmin
    .from('payment_channels')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId);

  if ((pcCount ?? 0) === 0) {
    await supabaseAdmin.from('payment_channels').insert({
      company_id: companyId,
      channel_group: 'bill_online',
      type: 'cash',
      name: 'เงินสด',
      is_active: true,
      sort_order: 0,
      config: { description: 'รับเงินสดจากลูกค้า / จ่ายหน้าร้าน' },
    });
  }

  // 5) mark complete
  await supabaseAdmin
    .from('companies')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', companyId);

  return NextResponse.json({ ok: true });
}
