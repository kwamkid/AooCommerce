import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import {
  invalidateShopeeAppCache, normalizeUsage, getCompanyShopeeShopSplit, SHOPEE_CHAT_ONLY_BLOCKED,
} from '@/lib/shopee/app-credentials';
import {
  getAppPushConfig, setAppPushConfig, setChatOnlyPushConfig, blockShopsOnPartnerApp,
  shopeeWebhookUrl, SHOPEE_PUSH_CODES_FULL,
} from '@/lib/shopee/push-config';

// ตั้งค่า push ให้ app ของบริษัทนี้ — โหมดมาจาก **ค่าที่บริษัทตั้งไว้** (`usage`) ไม่ใช่การเดา
// จากสภาพร้าน · ของเดิมเดาว่า "มีร้านที่ shopee_app='seller' ไหม" ซึ่งตอบผิดตอนบริษัทตั้ง app
// ไว้ก่อนเชื่อมร้านสักร้าน (ได้ chat_only แล้วร้านที่เชื่อมทีหลังไม่มี push ออเดอร์)
//
//   chat  ร้านรับออเดอร์ผ่าน app กลาง → app นี้เปิด **แค่ code 10** (ปิด code อื่นที่ค้าง)
//         เปิด code ออเดอร์ด้วยจะได้ push ซ้ำสองใบทุกเหตุการณ์
//   full  app นี้คือทางเข้าออเดอร์ของบริษัทด้วย → เปิดครบทุก code ที่ webhook รองรับ
//         และ block ร้านที่ authorize ผ่าน app นี้ที่ app กลาง กันออเดอร์เข้าสองใบ

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;

  const { data: row } = await supabaseAdmin
    .from('marketplace_app_credentials')
    .select('id, partner_id, partner_key, env, usage')
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

  const mode = normalizeUsage(row.usage as string);
  // ร้านที่ authorize ผ่าน app นี้เป็นชุดหลัก — โหมด full ต้อง block ร้านพวกนี้ที่ app กลาง
  const { sellerMainShopIds: ownShopIds } = await getCompanyShopeeShopSplit(companyId);

  // ⚠️ ปิด code ออเดอร์ทั้งที่ร้านรับออเดอร์ผ่าน app นี้ = ออเดอร์หายเงียบ — ตีตกก่อนยิง Shopee
  if (mode === 'chat' && ownShopIds.length > 0) {
    return NextResponse.json({ error: SHOPEE_CHAT_ONLY_BLOCKED, shop_ids: ownShopIds }, { status: 409 });
  }

  const applied = mode === 'full'
    ? { ...(await setAppPushConfig(keys, { callbackUrl, codes: SHOPEE_PUSH_CODES_FULL })), turnedOff: [] as number[] }
    : await setChatOnlyPushConfig(keys, callbackUrl);
  // โหมด full: ร้านพวกนี้ต้องไม่ได้รับ push จาก app กลางอีกทาง (ล้มก็แค่จดไว้ — ไม่ใช่เหตุให้ทั้งปุ่มล้ม)
  // ยังไม่มีร้านบน app นี้ = ไม่มีอะไรต้อง block ข้ามไปเลย (ยิงไปก็ไปกวน list ของ app กลางเปล่า ๆ)
  const partnerBlock = mode === 'full' && applied.ok && ownShopIds.length > 0
    ? await blockShopsOnPartnerApp(ownShopIds)
    : null;
  // อ่านซ้ำหลังตั้ง — ค่าที่ Shopee ตอบกลับตอน set ไม่ครบเท่า get (ไม่มี live_push_status)
  const after = applied.ok ? await getAppPushConfig(keys) : applied;

  const record = {
    at: new Date().toISOString(),
    ok: applied.ok,
    callback_url: callbackUrl,
    error: applied.error || null,
    mode,
    turned_off: applied.turnedOff,
    own_shop_ids: ownShopIds,
    partner_block: partnerBlock ? { ok: partnerBlock.ok, error: partnerBlock.error || null, blocked: partnerBlock.blocked } : null,
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
