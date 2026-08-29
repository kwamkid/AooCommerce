import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { ensureValidToken as ensureShopeeToken, getShopInfo, type ShopeeAccountRow } from '@/lib/shopee/api';
import { ensureValidToken as ensureLazadaToken, getSellerInfo, type LazadaAccountRow } from '@/lib/lazada/api';
import { getAuthorizedShops } from '@/lib/tiktok/api';

// ดึงชื่อร้าน + โลโก้จากแพลตฟอร์มมาอัปเดตใหม่ — POST { account_id }
//
// ต่างจาก "เชื่อมต่อใหม่" (re-authorize) ตรงที่ **ไม่ต้องผ่าน OAuth และไม่แตะ token**
// ใช้ตอนร้านเปลี่ยนชื่อ/โลโก้บนแพลตฟอร์มแล้วอยากให้ในระบบตรงกัน
//
// ⚠️ **เขียนทับเฉพาะค่าที่แพลตฟอร์มส่งมาจริง** — ค่าที่ผู้ใช้ตั้งเองต้องอยู่ต่อ
//    TikTok ไม่มี API โลโก้ร้านเลย (ยืนยันแล้ว 2026-08-29: /authorization/202309/shops
//    คืนแค่ cipher/code/id/name/region/seller_type) → โลโก้ TikTok ต้องกรอกมือเท่านั้น
//    ถ้า resync ไปล้างทิ้ง โลโก้จะหายทุกครั้งที่กด

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { account_id } = await request.json().catch(() => ({}));
  if (!account_id) return NextResponse.json({ error: 'ต้องระบุร้าน' }, { status: 400 });

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', account_id)
    .eq('company_id', companyId)
    .single();

  if (!account) return NextResponse.json({ error: 'ไม่พบร้าน' }, { status: 404 });

  const platform = account.platform as string;
  const quota = await isQuotaBlocked(platform as 'shopee' | 'tiktok' | 'lazada', 'auth');
  if (quota.blocked) {
    return NextResponse.json({ error: 'แพลตฟอร์มจำกัดการเรียกชั่วคราว — ลองใหม่ภายหลัง' }, { status: 429 });
  }

  const prevMeta = (account.metadata || {}) as Record<string, unknown>;
  let shopName: string | null = null;
  let shopLogo: string | null = null;
  let note: string | undefined;

  try {
    if (platform === 'shopee') {
      const info = await getShopInfo(await ensureShopeeToken(account as ShopeeAccountRow));
      shopName = info?.shop_name || null;
      shopLogo = info?.shop_logo || null;
    } else if (platform === 'lazada') {
      const seller = await getSellerInfo(await ensureLazadaToken(account as unknown as LazadaAccountRow, 'main'));
      shopName = seller?.name || null;
      shopLogo = seller?.logo_url || null;
      if (!shopLogo) note = 'Lazada ไม่ได้ส่งโลโก้ของร้านนี้มา — ตั้งเองได้ที่ปุ่มโลโก้';
    } else if (platform === 'tiktok') {
      const shops = await getAuthorizedShops(account.access_token as string);
      const mine = shops.find(s => String(s.id) === String(account.shop_id)) || shops[0];
      shopName = mine?.name || null;
      // TikTok ไม่มีโลโก้ร้านใน API — ปล่อยเป็น null แล้วคงของเดิมไว้ข้างล่าง
      note = 'TikTok ไม่มีโลโก้ร้านใน API — ต้องตั้งเองด้วยปุ่มโลโก้';
    } else {
      return NextResponse.json({ error: `ยังไม่รองรับ ${platform}` }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ดึงข้อมูลร้านไม่สำเร็จ' },
      { status: 400 }
    );
  }

  // merge — เขียนทับเฉพาะสิ่งที่ได้มาจริง ของเดิมที่ผู้ใช้ตั้งไว้ต้องรอด
  const meta = { ...prevMeta };
  if (shopLogo) meta.shop_logo = shopLogo;

  const update: Record<string, unknown> = { metadata: meta, updated_at: new Date().toISOString() };
  if (shopName) update.shop_name = shopName;

  const { error } = await supabaseAdmin
    .from('marketplace_accounts')
    .update(update)
    .eq('id', account_id)
    .eq('company_id', companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    success: true,
    shop_name: shopName,
    // บอกให้ชัดว่าโลโก้มาจากไหน — ที่คงไว้จากของเดิมไม่ใช่ของใหม่ที่เพิ่งดึงมา
    shop_logo_updated: !!shopLogo,
    shop_logo: (meta.shop_logo as string) || null,
    note,
  });
}
