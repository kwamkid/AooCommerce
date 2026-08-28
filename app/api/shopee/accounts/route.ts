import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { ensureValidToken, getShopInfo, ShopeeAccountRow } from '@/lib/shopee/api';
import {
  ensureValidToken as ensureValidLazadaToken,
  getSellerInfo as getLazadaSellerInfo,
  isReachableImage,
  type LazadaAccountRow,
} from '@/lib/lazada/api';
import { isChatAppConfigured as isLazadaChatAppConfigured } from '@/lib/lazada/api';

export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Support ?platform=tiktok|lazada|all to filter by platform (default: shopee)
    const platformParam = new URL(request.url).searchParams.get('platform') || 'shopee';

    let query = supabaseAdmin
      .from('marketplace_accounts')
      .select('id, company_id, platform, shop_id, shop_name, is_active, last_sync_at, last_product_sync_at, access_token_expires_at, refresh_token_expires_at, chat_access_token, auto_sync_stock, auto_sync_product_info, metadata, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    // Filter by platform — 'all' คืนทุก platform ใน call เดียว (หน้า settings ใช้แทนการยิง 3 รอบ)
    if (platformParam === 'tiktok') {
      query = query.eq('platform', 'tiktok');
    } else if (platformParam === 'lazada') {
      query = query.eq('platform', 'lazada');
    } else if (platformParam === 'all') {
      // no platform filter
    } else {
      // Default to shopee (includes legacy accounts without platform field)
      query = query.or('platform.eq.shopee,platform.is.null');
    }

    const { data: accounts, error } = await query;

    if (error) throw error;

    // Get linked product counts per account
    const accountIds = (accounts || []).filter(a => a.is_active).map(a => a.id);
    let linkCounts: Record<string, number> = {};
    if (accountIds.length > 0) {
      const { data: countRows } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('account_id')
        .in('account_id', accountIds)
        .eq('sync_enabled', true);

      if (countRows) {
        // Count distinct product_id per account
        const seen = new Map<string, Set<string>>();
        for (const row of countRows) {
          if (!seen.has(row.account_id)) seen.set(row.account_id, new Set());
          seen.get(row.account_id)!.add(row.account_id); // count rows as links
        }
        // Simple count per account
        const countMap: Record<string, number> = {};
        for (const row of countRows) {
          countMap[row.account_id] = (countMap[row.account_id] || 0) + 1;
        }
        linkCounts = countMap;
      }
    }

    // Add connection status and linked count to each account
    const now = new Date();
    const accountsWithStatus = (accounts || []).map(a => {
      const refreshExpiry = a.refresh_token_expires_at ? new Date(a.refresh_token_expires_at) : null;
      const isExpired = refreshExpiry ? refreshExpiry.getTime() < now.getTime() : true;
      // ส่งแค่ธงว่ามี token แชทหรือยัง — ตัว token ห้ามหลุดออกไป
      // TikTok: แชทต้องผ่าน OAuth app แชทแยกเสมอ · Lazada: มีขาแชทเฉพาะเมื่อ
      // ตั้ง LAZADA_CHAT_APP_* แยก (ไม่ตั้ง = token หลักใช้แชทได้ ถือว่าเชื่อมแล้ว)
      // · Shopee: แชทใช้ token หลักอยู่แล้ว
      const { chat_access_token, ...rest } = a;
      const chatConnected = a.platform === 'tiktok'
        ? !!chat_access_token
        : a.platform === 'lazada'
          ? (!isLazadaChatAppConfigured() || !!chat_access_token)
          : true;
      return {
        ...rest,
        chat_connected: chatConnected,
        connection_status: !a.is_active ? 'disconnected' : isExpired ? 'expired' : 'connected',
        linked_product_count: linkCounts[a.id] || 0,
      };
    });

    return NextResponse.json(accountsWithStatus);
  } catch (error) {
    console.error('Shopee accounts GET error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('id');
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    // Soft delete - set is_active to false and clear tokens
    const { error } = await supabaseAdmin
      .from('marketplace_accounts')
      .update({
        is_active: false,
        access_token: null,
        refresh_token: null,
        access_token_expires_at: null,
        refresh_token_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', accountId)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shopee accounts DELETE error:', error);
    return NextResponse.json({ error: 'Failed to disconnect shop' }, { status: 500 });
  }
}

// PATCH - Refresh shop profile (name + logo)
export async function PATCH(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const accountId = body.id;
    if (!accountId) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    const { data: account, error: accError } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .single();

    if (accError || !account) {
      return NextResponse.json({ error: 'Shop not found' }, { status: 404 });
    }

    // ── ตั้งโลโก้เองด้วย URL ────────────────────────────────────────────────
    // บาง marketplace ไม่คืนโลโก้ทาง API เลย (เช่น Lazada บางร้าน /seller/get ไม่มี
    // logo_url ให้เลย ทั้งที่ Seller Center ตั้งรูปไว้แล้ว) — ปล่อยไว้ = ไอคอนเปล่า
    // ตลอดกาล จึงต้องมีทางใส่ URL ตรงๆ · ส่ง shop_logo = '' เพื่อล้างค่า
    if (typeof body.shop_logo === 'string') {
      const raw = body.shop_logo.trim();
      if (raw) {
        if (!/^https:\/\//i.test(raw)) {
          return NextResponse.json({ error: 'ลิงก์รูปต้องขึ้นต้นด้วย https://' }, { status: 400 });
        }
        // ต้องโหลดได้จริงและเป็นรูป — กัน URL ตาย/ลิงก์หน้าเว็บมาแทนไฟล์ภาพ
        if (!(await isReachableImage(raw))) {
          return NextResponse.json({ error: 'เปิดลิงก์รูปนี้ไม่ได้ หรือไม่ใช่ไฟล์รูป' }, { status: 400 });
        }
      }
      await supabaseAdmin
        .from('marketplace_accounts')
        .update({
          metadata: { ...(account.metadata || {}), shop_logo: raw || null },
          updated_at: new Date().toISOString(),
        })
        .eq('id', account.id);

      return NextResponse.json({ success: true, shop_name: account.shop_name, shop_logo: raw });
    }

    // Lazada — ชื่อ + โลโก้มาจาก /seller/get (ปุ่ม refresh บน card ใช้ route เดียวกันทุก platform)
    if (account.platform === 'lazada') {
      const lazadaCreds = await ensureValidLazadaToken(account as LazadaAccountRow);
      const seller = await getLazadaSellerInfo(lazadaCreds);
      if (seller) {
        const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (seller.name) updateData.shop_name = seller.name;
        // ทับ shop_logo เฉพาะเมื่อ URL ใหม่โหลดได้จริง — /seller/get อาจคืนไฟล์
        // archive ที่ตายแล้ว ห้ามเอาไปทับโลโก้หน้าร้านที่เก็บไว้ (ดู fix-bug.md)
        if (seller.logo_url && (await isReachableImage(seller.logo_url))) {
          updateData.metadata = { ...(account.metadata || {}), shop_logo: seller.logo_url };
        }
        await supabaseAdmin
          .from('marketplace_accounts')
          .update(updateData)
          .eq('id', account.id);
      }
      return NextResponse.json({
        success: true,
        shop_name: seller?.name || account.shop_name,
        shop_logo: seller?.logo_url || '',
      });
    }

    if (account.platform === 'tiktok') {
      return NextResponse.json({ error: 'Refresh not supported for this platform' }, { status: 400 });
    }

    const creds = await ensureValidToken(account as ShopeeAccountRow);
    const shopInfo = await getShopInfo(creds);

    if (shopInfo) {
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (shopInfo.shop_name) updateData.shop_name = shopInfo.shop_name;
      if (shopInfo.shop_logo) {
        updateData.metadata = { ...(account.metadata || {}), shop_logo: shopInfo.shop_logo };
      }
      await supabaseAdmin
        .from('marketplace_accounts')
        .update(updateData)
        .eq('id', account.id);
    }

    return NextResponse.json({
      success: true,
      shop_name: shopInfo?.shop_name || account.shop_name,
      shop_logo: shopInfo?.shop_logo || '',
    });
  } catch (error) {
    console.error('Shopee accounts PATCH error:', error);
    return NextResponse.json({ error: 'Failed to refresh profile' }, { status: 500 });
  }
}

// PUT - Update account settings (auto-sync toggles)
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !can(companyRoles, 'marketplace.connect')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, auto_sync_stock, auto_sync_product_info } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof auto_sync_stock === 'boolean') updateData.auto_sync_stock = auto_sync_stock;
    if (typeof auto_sync_product_info === 'boolean') updateData.auto_sync_product_info = auto_sync_product_info;

    const { error } = await supabaseAdmin
      .from('marketplace_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Shopee accounts PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
