// Shared server-side helpers used by both the per-step onboarding endpoints
// (legacy, kept for direct edits) and the new /api/onboarding/finalize endpoint
// that applies the whole wizard payload atomically after creating the company.

import { supabaseAdmin } from '@/lib/supabase-admin';
import { DEFAULT_FEATURES, type FeatureFlags } from '@/lib/features';
import { getStockConfig } from '@/lib/stock-utils';

export const VALID_CHANNELS = ['retail', 'wholesale', 'consignment', 'marketplace', 'pos'] as const;
export type Channel = (typeof VALID_CHANNELS)[number];

// Map a wizard channel checkbox → feature flags it turns on. Mirrors the rules
// in the Features เสริม UI (consignment auto-enables supplier, etc.).
export function deriveFeatureFlagsFromChannels(channels: Channel[], current: FeatureFlags): FeatureFlags {
  const next: FeatureFlags = { ...current, delivery_date: { ...current.delivery_date } };
  for (const channel of channels) {
    switch (channel) {
      case 'marketplace': next.marketplace_sync = true; break;
      case 'pos':         next.pos = true; break;
      case 'consignment': next.consignment = true; next.supplier = true; break;
      case 'wholesale':   next.billing_cycle = true; break;
      case 'retail':      /* base case */ break;
    }
  }
  return next;
}

// Apply channels + derived features to a company's settings. Idempotent —
// merges with existing settings/features so unrelated fields are preserved.
export async function applyChannels(companyId: string, requested: string[]) {
  const filtered = requested.filter((c): c is Channel => VALID_CHANNELS.includes(c as Channel));
  const channels = (filtered.length === 0 ? ['retail'] : Array.from(new Set(filtered))) as Channel[];

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();

  const currentSettings = (company?.settings as Record<string, unknown> | null) || {};
  const currentFeatures = (currentSettings.features as FeatureFlags | undefined) || DEFAULT_FEATURES;
  const features = deriveFeatureFlagsFromChannels(channels, currentFeatures);
  const newSettings = { ...currentSettings, features };

  const { error } = await supabaseAdmin
    .from('companies')
    .update({ business_channels: channels, settings: newSettings })
    .eq('id', companyId);

  if (error) throw new Error(error.message);
  return { channels, features };
}

export interface WarehouseBody {
  use_warehouse?: boolean;
  name?: string;
  address?: string | null;
  district?: string | null;
  amphoe?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
}

// Apply warehouse choice. Package-gates the toggle — Free always lands as
// use_warehouse=false even if the client sent true. Also mirrors the choice
// into settings.features.stock so Features เสริม + Sidebar stay in sync.
export async function applyWarehouse(companyId: string, userId: string, body: WarehouseBody | null) {
  const stockConfig = await getStockConfig(companyId);
  const useWarehouse = stockConfig.stockEnabled && body?.use_warehouse !== false;

  const { data: company, error: getErr } = await supabaseAdmin
    .from('companies')
    .select('settings')
    .eq('id', companyId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const currentSettings = (company?.settings as Record<string, unknown> | null) || {};
  const currentFeatures = (currentSettings.features as Record<string, unknown> | undefined) || {};
  const newSettings = {
    ...currentSettings,
    use_warehouse: useWarehouse,
    features: { ...currentFeatures, stock: useWarehouse },
  };

  await supabaseAdmin.from('companies').update({ settings: newSettings }).eq('id', companyId);

  if (useWarehouse) {
    // Only create if none exists yet — idempotent for retries.
    const { count } = await supabaseAdmin
      .from('warehouses')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);

    if ((count ?? 0) === 0) {
      const name = (body?.name || '').trim() || 'คลังหลัก';
      const addressParts = [body?.address, body?.district, body?.amphoe, body?.province, body?.postal_code]
        .map(s => s?.toString().trim())
        .filter(Boolean);
      const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

      const { error: insErr } = await supabaseAdmin.from('warehouses').insert({
        company_id: companyId,
        name,
        address: fullAddress,
        is_active: true,
        is_default: true,
        warehouse_type: 'internal',
        created_by: userId,
      });
      if (insErr) throw new Error(insErr.message);
    }
  }

  return { use_warehouse: useWarehouse };
}

// Master list of system carriers — kept in sync with the carriers seed migration.
const SYSTEM_CARRIERS = [
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
const VALID_CARRIER_CODES = new Set(SYSTEM_CARRIERS.map(c => c.code));

// Seed only the carriers the user ticked, plus self+other (always available).
export async function applyCarriers(companyId: string, requested: string[]) {
  const filtered = (Array.isArray(requested) ? requested : [])
    .map(c => c.toString().trim().toLowerCase())
    .filter(c => VALID_CARRIER_CODES.has(c));
  const codes = Array.from(new Set([...filtered, 'self', 'other']));

  const rows = SYSTEM_CARRIERS
    .filter(c => codes.includes(c.code))
    .map(c => ({
      company_id: companyId,
      code: c.code,
      name: c.name,
      tracking_url_template: c.tracking_url_template,
      shippop_courier_code: c.shippop_courier_code,
      is_system: true,
      is_active: true,
      sort_order: c.sort_order,
    }));

  const { error } = await supabaseAdmin
    .from('carriers')
    .upsert(rows, { onConflict: 'company_id,code', ignoreDuplicates: true });

  if (error) throw new Error(error.message);
  return { seeded: rows.map(r => r.code) };
}

export interface BankAccount {
  bank_code: string;
  account_number: string;
  account_name: string;
}

export interface PaymentBody {
  cash?: boolean;
  promptpay?: { id: string; name: string } | null;
  banks?: BankAccount[];
}

// Seed payment channels in the 'bill_online' group. Wipes wizard-seeded
// cash + bank_transfer rows first so retries don't duplicate.
export async function applyPayment(companyId: string, body: PaymentBody | null) {
  const wantCash = body?.cash !== false;
  const promptpay = body?.promptpay && body.promptpay.id ? body.promptpay : null;
  const banks: BankAccount[] = Array.isArray(body?.banks)
    ? body!.banks!.filter(b => b && b.bank_code && b.account_number)
    : [];

  await supabaseAdmin
    .from('payment_channels')
    .delete()
    .eq('company_id', companyId)
    .eq('channel_group', 'bill_online')
    .in('type', ['cash', 'bank_transfer']);

  const rows: Array<Record<string, unknown>> = [];
  let sort = 0;

  if (wantCash) {
    rows.push({
      company_id: companyId,
      channel_group: 'bill_online',
      type: 'cash',
      name: 'เงินสด',
      is_active: true,
      sort_order: sort++,
      config: { description: 'รับเงินสดจากลูกค้า / จ่ายหน้าร้าน' },
    });
  }

  if (promptpay) {
    rows.push({
      company_id: companyId,
      channel_group: 'bill_online',
      type: 'bank_transfer',
      name: 'พร้อมเพย์',
      is_active: true,
      sort_order: sort++,
      config: {
        promptpay_id: promptpay.id.trim(),
        account_name: promptpay.name?.trim() || '',
      },
    });
  }

  for (const b of banks) {
    rows.push({
      company_id: companyId,
      channel_group: 'bill_online',
      type: 'bank_transfer',
      name: `ธนาคาร ${b.bank_code}`,
      is_active: true,
      sort_order: sort++,
      config: {
        bank_code: b.bank_code,
        account_number: b.account_number.trim(),
        account_name: b.account_name?.trim() || '',
      },
    });
  }

  // Defensive — always keep at least one channel so payment UIs don't break.
  if (rows.length === 0) {
    rows.push({
      company_id: companyId,
      channel_group: 'bill_online',
      type: 'cash',
      name: 'เงินสด',
      is_active: true,
      sort_order: 0,
      config: {},
    });
  }

  const { error } = await supabaseAdmin.from('payment_channels').insert(rows);
  if (error) throw new Error(error.message);
  return { count: rows.length };
}
