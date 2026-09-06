import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  exchangeCodeForToken, getShopListByMerchant, ensureValidToken, getShopInfo,
  resolveAppKeys, shopeeAppOf, type ShopeeApp,
} from '@/lib/shopee/api';
import { getCompanyShopeeApp } from '@/lib/shopee/app-credentials';
import {
  setAppPushConfig, blockShopsOnPartnerApp, shopeeWebhookUrl, SHOPEE_PUSH_CODES_FULL,
} from '@/lib/shopee/push-config';
import { logIntegrationNow } from '@/lib/integration-logger';
import { authorizeMarketplaceCallback } from '@/lib/oauth-state';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shopId = parseInt(searchParams.get('shop_id') || '0');
  const mainAccountId = parseInt(searchParams.get('main_account_id') || '0');

  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  const baseUrl = `${protocol}://${host}`;

  // Verify the signed state + the completing session; companyId comes from the
  // trusted state, never the raw param (prevents attaching a shop to a company
  // the caller isn't a member of).
  const rawState = searchParams.get('state') || request.cookies.get('shopee_oauth_state')?.value || null;
  const authz = await authorizeMarketplaceCallback(request, rawState);
  if (!authz.ok) {
    console.error('[Shopee Callback] Authorization failed:', authz.reason);
    return NextResponse.redirect(`${baseUrl}/settings/sales-channels?tab=marketplace&error=auth_${authz.reason}`);
  }
  const companyId = authz.companyId;

  // ขา seller = "เชื่อมต่อแชท" (app ของบริษัท) → จบที่หน้าช่องทางแชท
  // ขาปกติ = เชื่อมร้านเข้าระบบ (app กลาง) → จบที่หน้าช่องทางการขาย
  const shopeeApp: ShopeeApp = authz.payload.app === 'seller' ? 'seller' : 'partner';
  const isChatLeg = shopeeApp === 'seller';
  const fail = (reason: string) => NextResponse.redirect(
    isChatLeg
      ? `${baseUrl}/settings/chat-channels?shopee_chat=failed#shopee`
      : `${baseUrl}/settings/sales-channels?tab=marketplace&error=${reason}`
  );

  console.log('[Shopee Callback] Received params:', {
    code: code ? `${code.substring(0, 10)}...` : null,
    shop_id: shopId,
    main_account_id: mainAccountId,
    app: shopeeApp,
  });

  if (!code) {
    console.error('[Shopee Callback] Missing code');
    return fail('missing_params');
  }

  if (!shopId && !mainAccountId) {
    console.error('[Shopee Callback] No shop_id or main_account_id');
    return fail('missing_params');
  }

  try {
    // ต้องแลก token ด้วย app ตัวเดียวกับที่ใช้พาผู้ใช้ไปหน้าอนุญาต — คนละตัว = ลายเซ็นไม่ผ่าน
    // app แบบ seller เป็นของบริษัท จึงต้อง resolve จาก marketplace_app_credentials ก่อน
    const keys = await resolveAppKeys(shopeeApp, companyId);
    if (!keys) {
      console.error('[Shopee Callback] No app credentials for', shopeeApp, 'company', companyId);
      return fail('shopee_app_missing');
    }

    console.log('[Shopee Callback] Exchanging code for tokens...');
    const tokens = await exchangeCodeForToken(code, {
      shopId: shopId || undefined,
      mainAccountId: mainAccountId || undefined,
    }, shopeeApp, keys);
    console.log('[Shopee Callback] Token exchange success, expire_in:', tokens.expire_in);

    const now = new Date();
    const accessExpiry = new Date(now.getTime() + tokens.expire_in * 1000);
    const refreshExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Determine which shops to connect
    let shopIds: number[] = [];

    if (shopId) {
      // Direct shop-level auth (sub-account login)
      shopIds = [shopId];
    } else if (mainAccountId) {
      // Merchant-level auth — get shop list from token response or API
      if (tokens.shop_id_list && tokens.shop_id_list.length > 0) {
        shopIds = tokens.shop_id_list;
        console.log('[Shopee Callback] Shop IDs from token response:', shopIds);
      } else {
        // Fetch shop list via merchant API
        console.log('[Shopee Callback] Fetching shop list for merchant:', mainAccountId);
        // ต้องยิงด้วย app เดียวกับที่แลก token มา — คนละ app = คนละ key และคนละโฮสต์
        const shops = await getShopListByMerchant(mainAccountId, tokens.access_token, shopeeApp, keys);
        shopIds = shops.map(s => s.shop_id);
        console.log('[Shopee Callback] Shop IDs from merchant API:', shopIds);
      }
    }

    if (shopIds.length === 0) {
      console.error('[Shopee Callback] No shops found for this account');
      return fail('no_shops');
    }

    // ร้านเดิมของบริษัทนี้ — ต้องรู้ทั้ง metadata (merge ไม่ใช่ทับ) และ id ก่อนตัดสินใจว่า
    // ขา seller จะเขียนลง chat_* หรือเป็นการต่ออายุการเชื่อมต่อหลัก (ดูเหตุผลข้างล่าง)
    interface ExistingShop { id: string; metadata: Record<string, unknown>; mainApp: ShopeeApp }
    const existing = new Map<number, ExistingShop>();
    {
      const { data: rows } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id, shop_id, metadata')
        .eq('company_id', companyId)
        .eq('platform', 'shopee');
      for (const r of rows || []) {
        const metadata = (r.metadata || {}) as Record<string, unknown>;
        existing.set(r.shop_id as number, {
          id: r.id as string,
          metadata,
          mainApp: shopeeAppOf({ metadata }),
        });
      }
    }

    let connectedCount = 0;
    // ร้านที่ "เพิ่งเข้าระบบผ่าน app ของบริษัทเอง" ในรอบนี้ — ต้องตามไปตั้ง push ให้ (ดูท้ายฟังก์ชัน)
    const newSellerShopIds: number[] = [];

    for (const sid of shopIds) {
      const prior = existing.get(sid);

      // ── ขาแชท: ร้านมีอยู่แล้ว ────────────────────────────────────────────
      if (isChatLeg && prior) {
        // ⚠️ ร้านที่ **token ชุดหลักก็ออกจาก app seller ใบเดียวกัน** (สภาพของ ABC ทุกร้าน
        // วันนี้) ห้ามเก็บ token 2 ชุดของ app เดียวกัน — refresh_token ของ Shopee ใช้ได้
        // ครั้งเดียว ใบใหม่ทำใบเก่าตาย ⇒ เขียน chat_* เพิ่มจะไปฆ่าการเชื่อมต่อหลักของร้าน
        // เอง · เคสนี้จึงถือว่าเป็น "ต่ออายุการเชื่อมต่อเดิม" แล้วปล่อยให้แชทตกไปใช้ token
        // ชุดหลักเหมือนเดิม (ensureValidToken purpose:'chat' fallback) — ใช้งานได้ครบ
        // พอเจ้าของย้ายขาออเดอร์ไป partner app แล้ว รอบหน้าถึงจะแยกเป็นสองชุดจริง
        const sameApp = prior.mainApp === 'seller';
        const metadata = {
          ...prior.metadata,
          shopee_chat_app: 'seller',
          // เคยหมดอายุแล้วต่อใหม่ = ล้างธงทิ้ง ไม่งั้นหน้าตั้งค่ายังขึ้นว่าหมดอายุ
          shopee_chat_expired_at: undefined,
        };
        const { error } = await supabaseAdmin
          .from('marketplace_accounts')
          .update(sameApp ? {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            access_token_expires_at: accessExpiry.toISOString(),
            refresh_token_expires_at: refreshExpiry.toISOString(),
            is_active: true,
            metadata,
            updated_at: now.toISOString(),
          } : {
            // ร้านอยู่บน app กลาง — token ชุดหลักเป็นคนละ app คนละถัง แตะไม่ได้เด็ดขาด
            chat_access_token: tokens.access_token,
            chat_refresh_token: tokens.refresh_token,
            chat_access_token_expires_at: accessExpiry.toISOString(),
            chat_refresh_token_expires_at: refreshExpiry.toISOString(),
            metadata,
            updated_at: now.toISOString(),
          })
          .eq('id', prior.id);
        if (error) {
          console.error('[Shopee Callback] Chat token update failed for shop', sid, ':', error);
          continue;
        }
        console.log('[Shopee Callback] Chat leg saved for shop', sid, sameApp ? '(refreshed main — same app)' : '(chat_* columns)');
        connectedCount++;
        continue;
      }

      // ── ร้านใหม่ (หรือขาปกติ) ────────────────────────────────────────────
      // ขา seller ที่ยังไม่มีร้านในระบบ = บริษัทที่มีแต่ app ของตัวเอง — สร้างร้านด้วย
      // token ชุดหลักของ app นั้นเหมือนของเดิม แชทจะตกไปใช้ token ชุดเดียวกันนี้เอง
      const { data: account, error } = await supabaseAdmin
        .from('marketplace_accounts')
        .upsert({
          company_id: companyId,
          platform: 'shopee',
          shop_id: sid,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          access_token_expires_at: accessExpiry.toISOString(),
          refresh_token_expires_at: refreshExpiry.toISOString(),
          is_active: true,
          // ⚠️ ห้ามเขียนทับด้วย {} — จะล้างค่าที่ผู้ใช้ตั้งเอง (เช่นโลโก้ที่กรอกมือ)
          // ทุกครั้งที่ re-authorize · Shopee พอฟื้นเองได้จาก get_shop_info ข้างล่าง
          // แต่ถ้า call นั้นล้มก็หายจริง
          metadata: {
            ...(prior?.metadata || {}),
            ...(mainAccountId ? { main_account_id: mainAccountId } : {}),
            // ร้านนี้ authorize มาด้วย app ไหน — ทุก call หลังจากนี้ต้องเซ็นด้วย
            // คู่ partner_id/key ของ app ตัวนั้น (ดู shopeeAppOf ใน lib/shopee/api.ts)
            shopee_app: shopeeApp,
            ...(isChatLeg ? { shopee_chat_app: 'seller' } : {}),
          },
          updated_at: now.toISOString(),
        }, {
          // unique index จริงคือ (company_id, platform, shop_id) — ใช้ target อื่น
          // upsert จะ error 42P10 ทุกร้านแล้วจบแบบ "สำเร็จ" โดยไม่ save (ดู fix-bug.md)
          onConflict: 'company_id,platform,shop_id',
        })
        .select()
        .single();

      console.log('[Shopee Callback] Upsert shop:', { shop_id: sid, account_id: account?.id, error: error?.message });

      if (error) {
        console.error('[Shopee Callback] Upsert error for shop', sid, ':', error);
        continue;
      }
      connectedCount++;
      // ขา seller + ยังไม่เคยมีร้านนี้ = ร้านใหม่ที่ token ชุดหลักออกจาก app ของบริษัท
      if (isChatLeg && !prior) newSellerShopIds.push(sid);

      // Fetch shop name and logo (best effort)
      try {
        const creds = await ensureValidToken(account);
        const shopInfo = await getShopInfo(creds);
        console.log('[Shopee Callback] Shop info for', sid, ':', shopInfo);
        if (shopInfo) {
          const meta = { ...(account.metadata || {}) } as Record<string, unknown>;
          if (shopInfo.shop_logo) meta.shop_logo = shopInfo.shop_logo;
          const updateData: Record<string, unknown> = { updated_at: new Date().toISOString(), metadata: meta };
          if (shopInfo.shop_name) updateData.shop_name = shopInfo.shop_name;
          await supabaseAdmin
            .from('marketplace_accounts')
            .update(updateData)
            .eq('id', account.id);
        }
      } catch (e) {
        console.error('[Shopee Callback] Failed to fetch shop info for', sid, ':', e);
      }
    }

    // ถ้า save ไม่สำเร็จเลยสักร้าน ต้องบอกผู้ใช้เป็น error — ห้ามจบแบบ "สำเร็จ"
    // (เคยเกิดจริง: onConflict ไม่ตรง unique index → upsert พังทุกร้านแบบเงียบ)
    if (connectedCount === 0) {
      console.error('[Shopee Callback] All upserts failed for', shopIds.length, 'shop(s)');
      return fail('shopee_save_failed');
    }

    // ร้านใหม่ที่เข้ามาทาง app ของบริษัท + บริษัทตั้งโหมด "ครบในตัว" ⇒ app ใบนั้นต้องเปิด push
    // ครบทุก code และร้านต้องถูก block ที่ app กลาง — ไม่ทำ = ออเดอร์ร้านใหม่เงียบ (หรือเข้าซ้ำ
    // สองใบถ้าร้านเคยผูก app กลางไว้) และไม่มีใครรู้จนกว่าจะมีคนสังเกตว่าออเดอร์หาย
    // ⚠️ ต้องอยู่ใน after() — งานที่ปล่อยลอยก่อน redirect โดน Vercel freeze ทิ้งกลางทาง
    if (newSellerShopIds.length > 0) {
      const shopIdsToPush = [...newSellerShopIds];
      after(async () => {
        const fix = 'กดปุ่ม "ตั้งค่า push (webchat)" ที่ ตั้งค่า > ช่องทางแชท > Shopee';
        try {
          const app = await getCompanyShopeeApp(companyId, 'seller');
          // โหมด chat = ออเดอร์เข้าทาง app กลางอยู่แล้ว ห้ามไปเปิด code ออเดอร์ให้ app นี้
          if (app?.usage !== 'full') return;

          const applied = await setAppPushConfig(keys, {
            callbackUrl: shopeeWebhookUrl(),
            codes: SHOPEE_PUSH_CODES_FULL,
          });
          const blocked = applied.ok ? await blockShopsOnPartnerApp(shopIdsToPush) : null;
          if (applied.ok && (!blocked || blocked.ok)) return;

          await logIntegrationNow({
            company_id: companyId,
            integration: 'shopee',
            direction: 'outgoing',
            action: 'push_config_auto',
            status: 'error',
            error_message: `ตั้ง push อัตโนมัติหลังเชื่อมร้านไม่สำเร็จ — ${applied.error || blocked?.error || 'ไม่ทราบสาเหตุ'} · วิธีแก้: ${fix}`,
            reference_type: 'shopee_shop',
            reference_id: shopIdsToPush.join(','),
          });
        } catch (e) {
          await logIntegrationNow({
            company_id: companyId,
            integration: 'shopee',
            direction: 'outgoing',
            action: 'push_config_auto',
            status: 'error',
            error_message: `ตั้ง push อัตโนมัติหลังเชื่อมร้านล้ม — ${e instanceof Error ? e.message : String(e)} · วิธีแก้: ${fix}`,
            reference_type: 'shopee_shop',
            reference_id: shopIdsToPush.join(','),
          });
        }
      });
    }

    // Clear the cookie
    const response = NextResponse.redirect(
      isChatLeg
        ? `${baseUrl}/settings/chat-channels?shopee_chat=connected#shopee`
        : `${baseUrl}/settings/sales-channels?tab=marketplace&shopee=connected`
    );
    response.cookies.delete('shopee_oauth_state');

    console.log('[Shopee Callback] Success! Connected', connectedCount, 'of', shopIds.length, 'shop(s)');
    return response;
  } catch (err) {
    console.error('[Shopee Callback] Error:', err);
    return fail('shopee_auth_failed');
  }
}
