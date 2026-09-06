import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { invalidateShopeeAppCache } from '@/lib/shopee/app-credentials';
import { getAppPushConfig, setChatOnlyPushConfig, shopeeWebhookUrl } from '@/lib/shopee/push-config';

// เปิด push แชท (code 10) ให้ app ของบริษัทนี้
//
// ⚠️ **เปิดแค่ code 10 เท่านั้น** — ออเดอร์/สินค้าเข้าทาง app กลางอยู่แล้ว
// ถ้า app นี้เปิด code ออเดอร์ด้วย ทุกเหตุการณ์จะ push มาสองใบ

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .select('id, partner_id, partner_key, env')
    .eq('id', id)
    .eq('company_id', companyId)      // app ของบริษัทตัวเองเท่านั้น
    .eq('platform', 'shopee')
    .maybeSingle();

  if (!row) return NextResponse.json({ error: 'ไม่พบ app นี้' }, { status: 404 });

  const keys = {
    partner_id: Number(row.partner_id),
    partner_key: row.partner_key as string,
    env: (row.env === 'sandbox' ? 'sandbox' : 'production') as 'production' | 'sandbox',
  };
  const callbackUrl = shopeeWebhookUrl();

  // เปิด 10 + ปิด code อื่นที่เปิดค้างอยู่ (ดูเหตุผลใน setChatOnlyPushConfig)
  const applied = await setChatOnlyPushConfig(keys, callbackUrl);
  // อ่านซ้ำหลังตั้ง — ค่าที่ Shopee ตอบกลับตอน set ไม่ครบเท่า get (ไม่มี live_push_status)
  const after = applied.ok ? await getAppPushConfig(keys) : applied;

  const record = {
    at: new Date().toISOString(),
    ok: applied.ok,
    callback_url: callbackUrl,
    error: applied.error || null,
    turned_off: applied.turnedOff,
    config: after.config,
  };
  await supabaseAdmin
    .from('marketplace_app_credentials')
    .update({ last_push_config_check: record, updated_at: record.at })
    .eq('id', id);
  invalidateShopeeAppCache();

  if (!applied.ok) {
    return NextResponse.json({ error: `Shopee ปฏิเสธการตั้งค่า push — ${applied.error}`, result: record }, { status: 400 });
  }
  return NextResponse.json({ success: true, result: record });
}
