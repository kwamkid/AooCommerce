import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';
import { invalidateShopeeAppCache, maskSecret } from '@/lib/shopee/app-credentials';

// app ของแพลตฟอร์มที่ "เป็นของบริษัท" ทุกใบในระบบ (ตอนนี้มีแค่ Shopee Seller In House)
//
// GET   รายการทั้งหมด + ชื่อบริษัท — **key ปิดบังเสมอ** (superadmin ก็ไม่ต้องเห็นใบเต็ม)
// PATCH { id, is_active } ปิด/เปิดใบที่มีปัญหา (เช่น key รั่ว) โดยไม่ต้องรอเจ้าของบริษัท

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
      .select('id, company_id, platform, app_role, label, partner_id, partner_key, push_key, env, is_active, last_push_config_check, created_at, updated_at')
      .order('created_at', { ascending: false }),
    supabaseAdmin.from('companies').select('id, name'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const companyName = new Map((companies || []).map(c => [c.id as string, c.name as string]));
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
    is_active: r.is_active,
    last_push_config_check: r.last_push_config_check,
    created_at: r.created_at,
    updated_at: r.updated_at,
  })));
}

export async function PATCH(request: NextRequest) {
  const auth = await checkSuperAdmin(request);
  if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  if (!body.id || typeof body.is_active !== 'boolean') {
    return NextResponse.json({ error: 'ต้องส่ง id + is_active' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .update({ is_active: body.is_active, updated_at: new Date().toISOString() })
    .eq('id', body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateShopeeAppCache();
  return NextResponse.json({ success: true });
}
