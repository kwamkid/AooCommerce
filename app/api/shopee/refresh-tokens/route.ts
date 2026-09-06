import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, type ShopeeAccountRow } from '@/lib/shopee/api';

export async function POST(request: NextRequest) {
  // Verify cron secret
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;

  if (!cronSecret || !expectedSecret || cronSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const bufferMs = 30 * 60 * 1000; // 30 minutes before expiry
  const cutoff = new Date(now.getTime() + bufferMs);

  // Find accounts with access tokens expiring soon
  const { data: accounts } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('is_active', true)
    .or('platform.eq.shopee,platform.is.null')
    .not('refresh_token', 'is', null)
    .lt('access_token_expires_at', cutoff.toISOString());

  // Skip + auto-deactivate accounts where refresh_token itself is already expired
  // (calling refreshAccessToken on these would just add errors to our API stats).
  const expiredIds = (accounts || [])
    .filter(a => a.refresh_token_expires_at && new Date(a.refresh_token_expires_at).getTime() < now.getTime())
    .map(a => a.id);

  if (expiredIds.length > 0) {
    await supabaseAdmin
      .from('marketplace_accounts')
      .update({ is_active: false, updated_at: now.toISOString() })
      .in('id', expiredIds);
  }

  const refreshable = (accounts || []).filter(a => !expiredIds.includes(a.id));

  let refreshed = 0;
  const errors: string[] = [];

  // ผ่าน ensureValidToken ทางเดียวกับ hot path — ทั้งคู่จึงแย่ง claim ตัวเดียวกันใน DB
  // เดิม route นี้ยิง refreshAccessToken เองโดยเผื่อ 30 นาที ส่วน hot path เผื่อ 5 นาที
  // → ชนกันเองจนใบที่สองถือ refresh_token ที่ถูก invalidate ไปแล้ว = fail
  // (refresh_access_token สำเร็จแค่ 60.8% — ดู lib/shopee/token-lock.ts)
  for (const account of refreshable) {
    try {
      await ensureValidToken(account as ShopeeAccountRow);
      refreshed++;
    } catch (e) {
      errors.push(`Shop ${account.shop_id}: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  }

  // ── token ขาแชท (app ของบริษัท) ──────────────────────────────────────
  // ต่ออายุแยกจากชุดหลัก เพราะเป็นคนละ app คนละคอลัมน์ · **ต้องมี cron ตัวนี้**
  // ไม่งั้นร้านที่ไม่มีคนทักติดกัน 30 วันจะถูก refresh_token หมดอายุเงียบ ๆ แล้ว
  // เจ้าของร้านมารู้ตอนพนักงานกดตอบลูกค้าไม่ได้ (ขาหลักไม่มีปัญหานี้เพราะ cron ดูดออเดอร์
  // ทุก 15 นาทีทำให้ token ถูกใช้ตลอด)
  const { data: chatAccounts } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('is_active', true)
    .or('platform.eq.shopee,platform.is.null')
    .not('chat_refresh_token', 'is', null)
    .lt('chat_access_token_expires_at', cutoff.toISOString());

  let chatRefreshed = 0;
  for (const account of chatAccounts || []) {
    // refresh token ขาแชทตายแล้ว = ต่อเองไม่ได้ ต้องให้เจ้าของกด "เชื่อมต่อแชทใหม่"
    // (ห้ามปิดร้าน — ออเดอร์ยังวิ่งได้ปกติ · watchdog เตือนล่วงหน้า 3 วันอยู่แล้ว)
    if (account.chat_refresh_token_expires_at
      && new Date(account.chat_refresh_token_expires_at).getTime() < now.getTime()) continue;
    try {
      await ensureValidToken(account as ShopeeAccountRow, { purpose: 'chat' });
      chatRefreshed++;
    } catch (e) {
      errors.push(`Shop ${account.shop_id} (chat): ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  }

  return NextResponse.json({
    refreshed,
    total: (accounts || []).length,
    deactivated: expiredIds.length,
    chat_refreshed: chatRefreshed,
    chat_total: (chatAccounts || []).length,
    errors,
  });
}
