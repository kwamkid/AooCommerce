import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { invalidateShopeeAppCache, maskSecret } from '@/lib/shopee/app-credentials';
import { getAppPushConfig } from '@/lib/shopee/push-config';

// app แชท Shopee ของบริษัท (Seller In House)
//
// ทำไมต้องต่อบริษัท — Shopee ให้ Chat API เฉพาะ app ประเภทนี้ และ app ผูกกับบัญชี seller
// ที่จดมันขึ้นมา ⇒ app กลางของ AOO ใช้แทนกันไม่ได้ ทุกบริษัทต้องจดของตัวเอง
//
//   GET    รายการ app ของบริษัท (**key ถูกปิดบังเสมอ**)
//   POST   เพิ่ม/แก้ (upsert ที่ company_id+platform+app_role) — ตรวจ key กับ Shopee ก่อนบันทึก
//   PUT    เหมือน POST (เผื่อ client เรียกด้วย verb นี้)
//   DELETE ปิดใช้งาน (is_active=false) — ไม่ลบทิ้ง เพราะ push key ยังต้องใช้ตรวจ push ที่ค้างมา

const PLATFORM = 'shopee';
const APP_ROLE = 'seller';

interface AppRow {
  id: string;
  label: string | null;
  partner_id: number | string;
  partner_key: string;
  push_key: string | null;
  env: string;
  is_active: boolean;
  last_push_config_check: unknown;
  created_at: string;
  updated_at: string;
}

/** ทุก response ต้องผ่านตัวนี้ — key ห้ามออกจาก server เต็มใบเด็ดขาด */
function toPublic(row: AppRow) {
  return {
    id: row.id,
    label: row.label,
    partner_id: Number(row.partner_id),
    partner_key_masked: maskSecret(row.partner_key),
    push_key_masked: maskSecret(row.push_key),
    /** ไม่ได้ตั้ง push key แยก = ใช้ partner key ตรวจ push (Shopee ให้ตั้งแยกได้) */
    has_push_key: !!row.push_key,
    env: row.env === 'sandbox' ? 'sandbox' : 'production',
    is_active: row.is_active,
    last_push_config_check: row.last_push_config_check,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const SELECT = 'id, label, partner_id, partner_key, push_key, env, is_active, last_push_config_check, created_at, updated_at';

export async function GET(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .select(SELECT)
    .eq('company_id', companyId)
    .eq('platform', PLATFORM)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data as AppRow[] || []).map(toPublic));
}

async function upsert(request: NextRequest) {
  const { isAuth, companyId, companyRoles, userId } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const partnerId = Number(body.partner_id);
  const partnerKey = String(body.partner_key || '').trim();
  const pushKey = String(body.push_key || '').trim();
  const env = body.env === 'sandbox' ? 'sandbox' : 'production';
  const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim() : null;

  if (!Number.isFinite(partnerId) || partnerId <= 0) {
    return NextResponse.json({ error: 'Partner ID ไม่ถูกต้อง' }, { status: 400 });
  }

  // แก้ของเดิมโดยไม่กรอก key ใหม่ = เก็บใบเดิมไว้ (หน้าจอโชว์แค่ 4 ตัวท้าย พิมพ์ซ้ำไม่ได้)
  const { data: current } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .select('id, partner_key, push_key')
    .eq('company_id', companyId)
    .eq('platform', PLATFORM)
    .eq('app_role', APP_ROLE)
    .maybeSingle();

  const finalKey = partnerKey || (current?.partner_key as string) || '';
  const finalPushKey = pushKey || (partnerKey ? null : (current?.push_key as string) || null);
  if (!finalKey) {
    return NextResponse.json({ error: 'ต้องกรอก Partner Key' }, { status: 400 });
  }

  // ตรวจกับ Shopee จริงก่อนบันทึก — key ผิดแล้วบันทึกไว้ = ทุก call ของบริษัทนี้ fail เงียบ ๆ
  // แล้วไม่มีใครรู้ว่าพังตรงไหน · ข้อความ error ส่งของ Shopee ตรง ๆ ให้ผู้ใช้เห็น
  const probe = await getAppPushConfig({ partner_id: partnerId, partner_key: finalKey, env });
  if (!probe.ok) {
    return NextResponse.json({
      error: `Shopee ปฏิเสธคู่ Partner ID/Key นี้ — ${probe.error}`,
    }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .upsert({
      ...(current?.id ? { id: current.id } : {}),
      company_id: companyId,
      platform: PLATFORM,
      app_role: APP_ROLE,
      label,
      partner_id: partnerId,
      partner_key: finalKey,
      push_key: finalPushKey,
      env,
      is_active: true,
      last_push_config_check: { at: now, ok: true, config: probe.config },
      created_by: userId,
      updated_at: now,
    }, { onConflict: 'company_id,platform,app_role' })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateShopeeAppCache();
  return NextResponse.json(toPublic(data as AppRow));
}

export const POST = upsert;
export const PUT = upsert;

export async function DELETE(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('company_id', companyId);   // ห้ามให้บริษัทหนึ่งไปปิด app ของอีกบริษัท

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateShopeeAppCache();
  return NextResponse.json({ success: true });
}
