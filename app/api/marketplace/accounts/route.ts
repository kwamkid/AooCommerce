import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import { isReachableImage } from '@/lib/lazada/api';
import { QUOTA_PLATFORMS } from '@/lib/marketplace/platforms';
import { isLoginKitConfigured } from '@/lib/tiktok/login-kit';
import { isChatAppConfigured as isLazadaChatAppConfigured } from '@/lib/lazada/api';

// จัดการร้านที่เชื่อมต่อไว้ — **ทุก marketplace ใช้ route นี้ร่วมกัน**
// (เดิมอยู่ที่ /api/shopee/accounts สมัยที่ยังมีแค่ Shopee · ย้ายมาชื่อกลาง 2026-08-30)
//
//   GET    ?platform=shopee|tiktok|lazada|all   รายการร้าน (ไม่ระบุ = shopee ตามของเดิม)
//   PUT    { id, warehouse_id | auto_sync_* }   แก้การตั้งค่าของร้าน
//   PATCH  { id }                               ดึงชื่อ+โลโก้จากแพลตฟอร์มมาใหม่
//   PATCH  { id, shop_logo }                    ตั้ง/ล้างลิงก์โลโก้เอง (ทุกแพลตฟอร์ม)
//   DELETE ?id=                                 ยกเลิกการเชื่อมต่อ
//
// ⚠️ เพิ่ม marketplace ใหม่ = เพิ่ม branch ที่นี่ ห้ามสร้าง /api/<platform>/accounts ของตัวเอง

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
      .select('id, company_id, platform, shop_id, shop_name, is_active, last_sync_at, last_product_sync_at, access_token_expires_at, refresh_token_expires_at, chat_access_token, chat_refresh_token_expires_at, auto_sync_stock, auto_sync_product_info, warehouse_id, metadata, created_at, updated_at')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    // 'all' = ทุกแพลตฟอร์มใน call เดียว (หน้า settings ใช้แทนการยิง 3 รอบ)
    // ชื่อแพลตฟอร์มอ่านจาก QUOTA_PLATFORMS — เพิ่มเจ้าใหม่ในนั้นแล้วที่นี่รองรับเอง
    if (platformParam === 'all') {
      // ไม่กรอง
    } else if ((QUOTA_PLATFORMS as readonly string[]).includes(platformParam) && platformParam !== 'shopee') {
      query = query.eq('platform', platformParam);
    } else {
      // shopee เป็นค่าเริ่มต้น และต้องรวมแถวเก่าที่ยังไม่มีคอลัมน์ platform ด้วย
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
      const { chat_access_token, chat_refresh_token_expires_at, ...rest } = a;
      // refresh token ของขาแชทตายแล้ว = ต่ออายุเองไม่ได้ ต้องพาไปอนุญาตใหม่
      // (ไม่งั้นสวิตช์ยังเปิดค้างอยู่ แต่พอพิมพ์ตอบลูกค้าจะเด้ง token refresh failed)
      const chatRefreshDead = chat_refresh_token_expires_at
        ? new Date(chat_refresh_token_expires_at).getTime() < now.getTime()
        : false;
      const hasLiveChatToken = !!chat_access_token && !chatRefreshDead;
      const chatConnected = a.platform === 'tiktok'
        ? hasLiveChatToken
        : a.platform === 'lazada'
          ? (!isLazadaChatAppConfigured() || hasLiveChatToken)
          : true;
      return {
        ...rest,
        chat_connected: chatConnected,
        // แยก "ยังไม่เคยเชื่อม" ออกจาก "เคยเชื่อมแล้วหมดอายุ" เพื่อบอกผู้ใช้ให้ตรง
        chat_expired: !!chat_access_token && chatRefreshDead,
        // TikTok ไม่มีโลโก้ร้านใน API ฝั่งขาย — ดึงจาก avatar บัญชีผ่าน Login Kit ได้
        // ถ้าตั้ง TIKTOK_CLIENT_* ไว้ (ไม่ตั้ง = ซ่อนปุ่ม ไม่ใช่ให้กดแล้วพัง)
        profile_link_available: a.platform === 'tiktok' && isLoginKitConfigured(),
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

    // ดึงชื่อ+โลโก้ใหม่จากแพลตฟอร์มย้ายไปอยู่ /api/marketplace/accounts/resync แล้ว
    // (ตัวนั้นรู้จักทุกแพลตฟอร์มผ่าน lib/marketplace/shop-info.ts และคงของเดิมไว้เมื่อ
    //  แพลตฟอร์มไม่ส่งมา) — ที่นี่เหลือเฉพาะการตั้งลิงก์รูปเอง
    return NextResponse.json(
      { error: 'ต้องส่ง shop_logo มาด้วย — ถ้าต้องการดึงข้อมูลจากแพลตฟอร์มใช้ /api/marketplace/accounts/resync' },
      { status: 400 }
    );
  } catch (error) {
    console.error('marketplace accounts PATCH error:', error);
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
    const { id, auto_sync_stock, auto_sync_product_info, warehouse_id } = body;
    if (!id) {
      return NextResponse.json({ error: 'Missing account ID' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof auto_sync_stock === 'boolean') updateData.auto_sync_stock = auto_sync_stock;
    if (typeof auto_sync_product_info === 'boolean') updateData.auto_sync_product_info = auto_sync_product_info;

    // คลังที่ร้านนี้ตัด/ซิงค์สต็อก — null = ใช้คลัง default ของบริษัท
    if (warehouse_id !== undefined) {
      if (warehouse_id === null || warehouse_id === '') {
        updateData.warehouse_id = null;
      } else {
        // ต้องเป็นคลังของบริษัทตัวเองและยังเปิดใช้อยู่
        const { data: wh } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('id', warehouse_id)
          .eq('company_id', companyId)
          .eq('is_active', true)
          .maybeSingle();
        if (!wh) {
          return NextResponse.json({ error: 'ไม่พบคลังนี้ หรือคลังถูกปิดใช้งานอยู่' }, { status: 400 });
        }
        updateData.warehouse_id = warehouse_id;
      }
    }

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
