import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';
import {
  invalidateShopeeAppCache, maskSecret, normalizeUsage, getCompanyShopeeShopSplit,
  SHOPEE_CHAT_ONLY_BLOCKED,
} from '@/lib/shopee/app-credentials';
import { getAppPushConfig } from '@/lib/shopee/push-config';

// app ของแพลตฟอร์มที่ "เป็นของบริษัท" ทุกใบในระบบ (ตอนนี้มีแค่ Shopee Seller In House)
//
// GET   รายการทั้งหมด + ชื่อบริษัท — **key ปิดบังเสมอ** (superadmin ก็ไม่ต้องเห็นใบเต็ม)
//       + ถาม Shopee สด ๆ ว่า push ของแต่ละ app เปิด code อะไร (ผลเขียนทับ last_push_config_check)
// PATCH { id, is_active } ปิด/เปิดใบที่มีปัญหา (เช่น key รั่ว) โดยไม่ต้องรอเจ้าของบริษัท
//       { id, usage }     เปลี่ยนโหมด full/chat แทนบริษัท (กฎความปลอดภัยเดียวกับฝั่งบริษัท)

interface Row {
  id: string;
  company_id: string;
  platform: string;
  app_role: string;
  label: string | null;
  partner_id: number | string;
  partner_key: string;
  push_key: string | null;
  env: string;
  usage: string;
  is_active: boolean;
  last_push_config_check: { at?: string; ok?: boolean; error?: string | null; config?: { push_config_on_list?: number[]; live_push_status?: string } | null } | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  const auth = await checkSuperAdmin(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const [{ data: rows, error }, { data: companies }] = await Promise.all([
    supabaseAdmin
      .from('marketplace_app_credentials')
      .select('id, company_id, platform, app_role, label, partner_id, partner_key, push_key, env, usage, is_active, last_push_config_check, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('companies').select('id, name'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companyName = new Map((companies || []).map(c => [c.id as string, c.name as string]));

  // ตรวจของจริงจาก Shopee ทุกครั้งที่เปิดหน้า — ป้าย "ยังไม่เปิด push แชท" เคยอ่านจาก
  // last_push_config_check ซึ่งเขียนเฉพาะตอนกดปุ่ม "ตั้งค่า push" ในหน้าบริษัท · app ที่ตั้ง push
  // ผ่านสคริปต์ (ABC the Baby 6 ก.ย.) จึงขึ้น "ยังไม่เปิด / ยังไม่เคยตรวจ" ทั้งที่แชทวิ่งอยู่
  // (ดู fix-bug.md 2026-09-08) · ถามไม่สำเร็จ = คงค่าเดิมไว้ บอกแค่ว่าตรวจสดไม่ได้
  const liveById = new Map<string, Row['last_push_config_check']>();
  const liveErrorById = new Map<string, string>();
  await Promise.all((rows as Row[] || []).filter(r => r.is_active && r.platform === 'shopee').map(async r => {
    const res = await getAppPushConfig({
      partner_id: Number(r.partner_id),
      partner_key: r.partner_key,
      env: r.env === 'sandbox' ? 'sandbox' : 'production',
    });
    if (!res.ok) { liveErrorById.set(r.id, res.error || 'เรียก Shopee ไม่สำเร็จ'); return; }
    const record = { ...(r.last_push_config_check || {}), at: new Date().toISOString(), ok: true, error: null, config: res.config, source: 'superadmin' };
    liveById.set(r.id, record);
    await supabaseAdmin.from('marketplace_app_credentials').update({ last_push_config_check: record }).eq('id', r.id);
  }));

  return NextResponse.json((rows as Row[] || []).map(r => ({
    id: r.id,
    company_id: r.company_id,
    company_name: companyName.get(r.company_id) || null,
    platform: r.platform,
    app_role: r.app_role,
    label: r.label,
    partner_id: Number(r.partner_id),
    partner_key_masked: maskSecret(r.partner_key),
    push_key_masked: maskSecret(r.push_key),
    has_push_key: !!r.push_key,
    env: r.env,
    usage: normalizeUsage(r.usage),
    is_active: r.is_active,
    last_push_config_check: liveById.get(r.id) ?? r.last_push_config_check,
    live_error: liveErrorById.get(r.id) ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })));
}

export async function PATCH(request: NextRequest) {
  const auth = await checkSuperAdmin(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const hasActive = typeof body.is_active === 'boolean';
  const hasUsage = body.usage !== undefined && body.usage !== null;
  if (!body.id || (!hasActive && !hasUsage)) {
    return NextResponse.json({ error: 'ต้องส่ง id + is_active หรือ usage' }, { status: 400 });
  }
  if (hasUsage && body.usage !== 'full' && body.usage !== 'chat') {
    return NextResponse.json({ error: 'usage ต้องเป็น full หรือ chat' }, { status: 400 });
  }

  // ⚠️ กฎเดียวกับฝั่งบริษัท — ลดเป็น "แชทอย่างเดียว" ทั้งที่มีร้านรับออเดอร์ผ่าน app นี้
  // = push ออเดอร์ของร้านนั้นถูกปิด · superadmin ก็ข้ามกฎนี้ไม่ได้ (ผลเสียเท่ากัน)
  if (hasUsage && body.usage === 'chat') {
    const { data: row } = await supabaseAdmin
      .from('marketplace_app_credentials')
      .select('company_id')
      .eq('id', body.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: 'ไม่พบ app นี้' }, { status: 404 });
    const { sellerMainShopIds } = await getCompanyShopeeShopSplit(row.company_id as string);
    if (sellerMainShopIds.length > 0) {
      return NextResponse.json({ error: SHOPEE_CHAT_ONLY_BLOCKED, shop_ids: sellerMainShopIds }, { status: 409 });
    }
  }

  const { error } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .update({
      ...(hasActive ? { is_active: body.is_active } : {}),
      ...(hasUsage ? { usage: body.usage } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateShopeeAppCache();
  return NextResponse.json({ success: true });
}
