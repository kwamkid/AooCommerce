import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  createSalesChannelForChatAccount,
  syncSalesChannelFromChatAccount,
  removeSalesChannelForChatAccount,
} from '@/lib/sales-channels-sync';
import { isChatAppConfigured as isLazadaChatAppConfigured } from '@/lib/lazada/api';

// GET - List chat accounts
export async function GET(request: NextRequest) {
  try {
    const { isAuth, companyId } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const platform = searchParams.get('platform');

    let query = supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('company_id', companyId)
      .order('platform', { ascending: true })
      .order('created_at', { ascending: true });

    if (platform) {
      query = query.eq('platform', platform);
    }

    const { data, error } = await query;
    if (error) throw error;

    // รูปประจำช่องทาง — resolve ที่เดียวตรงนี้ ไม่ให้แต่ละหน้าไปเดาเอง
    // (แชท marketplace ไม่มีรูปใน credentials ของตัวเอง — โลโก้ร้านอยู่ที่
    // marketplace_accounts.metadata.shop_logo)
    const mpAccountIds = (data || [])
      .map(a => (a.credentials as Record<string, unknown> | null)?.marketplace_account_id)
      .filter((id): id is string => typeof id === 'string');

    const shopLogos: Record<string, string> = {};
    if (mpAccountIds.length > 0) {
      const { data: shops } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id, metadata')
        .eq('company_id', companyId)
        .in('id', mpAccountIds);
      for (const shop of shops || []) {
        const logo = (shop.metadata as Record<string, unknown> | null)?.shop_logo;
        if (typeof logo === 'string' && logo) shopLogos[shop.id] = logo;
      }
    }

    // Mask credentials for response
    const accounts = (data || []).map(account => ({
      ...account,
      picture_url: resolveAccountPicture(
        account.platform,
        account.credentials as Record<string, unknown> | null,
        shopLogos
      ),
      credentials: maskCredentials(account.credentials as Record<string, unknown>, account.platform),
      webhook_url: getWebhookUrl(request, account.id, account.platform),
    }));

    return NextResponse.json({ accounts });
  } catch (error) {
    console.error('GET chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

// POST - Create new chat account
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(companyRoles, 'masterdata.chat_channels')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { platform, account_name, credentials, marketplace_account_id } = body;

    if (!platform || !['line', 'facebook', 'shopee', 'lazada', 'tiktok'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }

    // Shopee/Lazada: chat channel is a reference to an already-connected
    // marketplace shop (tokens live in marketplace_accounts; no credentials of its own)
    if (platform === 'shopee' || platform === 'lazada' || platform === 'tiktok') {
      const platformLabel = platform === 'shopee' ? 'Shopee' : platform === 'lazada' ? 'Lazada' : 'TikTok';
      if (!marketplace_account_id) {
        return NextResponse.json({ error: `marketplace_account_id is required for ${platformLabel}` }, { status: 400 });
      }
      const { data: mpAccount } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('id, shop_id, shop_name, platform, chat_access_token')
        .eq('id', marketplace_account_id)
        .eq('company_id', companyId)
        .maybeSingle();
      const mpPlatformOk = platform === 'shopee'
        ? (!mpAccount?.platform || mpAccount?.platform === 'shopee')
        : mpAccount?.platform === platform;
      if (!mpAccount || !mpPlatformOk) {
        return NextResponse.json({ error: `ไม่พบร้าน ${platformLabel} นี้ในบริษัท` }, { status: 404 });
      }

      // TikTok/Lazada: token แชทมาจาก app แชทแยก (OAuth ขาที่สอง) — ยังไม่เชื่อม
      // เปิดสวิตช์ไปก็เป็นช่องแชทที่รับ-ส่งอะไรไม่ได้ · Lazada เช็คเฉพาะเมื่อตั้ง
      // LAZADA_CHAT_APP_* แยก (ไม่ตั้ง = token หลักใช้แชทได้ ไม่มีขาที่สอง)
      const needsChatToken = platform === 'tiktok'
        || (platform === 'lazada' && isLazadaChatAppConfigured());
      if (needsChatToken && !mpAccount.chat_access_token) {
        return NextResponse.json(
          { error: `ร้านนี้ยังไม่ได้เชื่อมต่อแชท ${platformLabel} — กดปุ่ม "เชื่อมต่อแชท" ก่อน` },
          { status: 400 }
        );
      }

      // Dedupe: one chat channel per shop
      const { data: existingRows } = await supabaseAdmin
        .from('chat_accounts')
        .select('id, credentials')
        .eq('company_id', companyId)
        .eq('platform', platform);
      const dup = (existingRows || []).find(a => {
        const c = a.credentials as Record<string, unknown> | null;
        return c && (c.marketplace_account_id === mpAccount.id || Number(c.shop_id) === mpAccount.shop_id);
      });
      if (dup) {
        return NextResponse.json({ error: `ร้าน ${platformLabel} นี้เปิดใช้แชทอยู่แล้ว` }, { status: 400 });
      }

      const { data, error } = await supabaseAdmin
        .from('chat_accounts')
        .insert({
          company_id: companyId,
          platform,
          account_name: (account_name?.trim() || mpAccount.shop_name || `${platformLabel} ${mpAccount.shop_id}`),
          credentials: { marketplace_account_id: mpAccount.id, shop_id: mpAccount.shop_id },
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // Lazada: backfill recent sessions so the chat page isn't empty on enable
      if (platform === 'tiktok') {
        try {
          const { data: fullAccount } = await supabaseAdmin
            .from('marketplace_accounts')
            .select('*')
            .eq('id', mpAccount.id)
            .single();
          if (fullAccount) {
            const { syncTikTokRecentConversations } = await import('@/lib/services/chat/tiktok');
            syncTikTokRecentConversations(fullAccount, 10).catch(() => {});
          }
        } catch { /* non-critical */ }
      }

      if (platform === 'lazada') {
        try {
          const { data: fullAccount } = await supabaseAdmin
            .from('marketplace_accounts')
            .select('*')
            .eq('id', mpAccount.id)
            .single();
          if (fullAccount) {
            const { syncLazadaRecentSessions } = await import('@/lib/services/chat/lazada');
            syncLazadaRecentSessions(fullAccount, 10).catch(() => {});
          }
        } catch { /* non-critical */ }
      }

      // No sales_channels mirror — marketplace orders already flow via sync
      return NextResponse.json({ success: true, account: data });
    }

    if (!account_name?.trim()) {
      return NextResponse.json({ error: 'Account name is required' }, { status: 400 });
    }

    // For FB: auto-generate verify_token if not provided
    const finalCredentials = { ...credentials };
    if (platform === 'facebook' && !finalCredentials.verify_token) {
      finalCredentials.verify_token = crypto.randomBytes(16).toString('hex');
    }

    // Validate: prevent duplicate FB page_id or LINE channel_secret across all companies
    if (platform === 'facebook' && finalCredentials.page_id) {
      const { data: existingFb } = await supabaseAdmin
        .from('chat_accounts')
        .select('id, company_id, account_name, credentials')
        .eq('platform', 'facebook')
        .eq('is_active', true);

      const duplicate = (existingFb || []).find(a => {
        const creds = a.credentials as Record<string, unknown> | null;
        return creds && (creds as Record<string, unknown>).page_id === finalCredentials.page_id;
      });

      if (duplicate) {
        return NextResponse.json({ error: 'Facebook Page นี้ถูกเชื่อมต่อแล้วในระบบ ไม่สามารถเพิ่มซ้ำได้' }, { status: 400 });
      }
    }

    if (platform === 'line' && finalCredentials.channel_secret) {
      const { data: existingLine } = await supabaseAdmin
        .from('chat_accounts')
        .select('id, company_id, account_name, credentials')
        .eq('platform', 'line')
        .eq('is_active', true);

      const duplicate = (existingLine || []).find(a => {
        const creds = a.credentials as Record<string, unknown> | null;
        return creds && (creds as Record<string, unknown>).channel_secret === finalCredentials.channel_secret;
      });

      if (duplicate) {
        return NextResponse.json({ error: 'LINE OA นี้ถูกเชื่อมต่อแล้วในระบบ ไม่สามารถเพิ่มซ้ำได้' }, { status: 400 });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('chat_accounts')
      .insert({
        company_id: companyId,
        platform,
        account_name: account_name.trim(),
        credentials: finalCredentials,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'ชื่อ account ซ้ำ กรุณาใช้ชื่ออื่น' }, { status: 400 });
      }
      throw error;
    }

    // Mirror into sales_channels so OrderForm + filters pick it up immediately.
    // Best-effort: if it fails we still return the chat_account success and rely on
    // the next chat-accounts edit / migration backfill to reconcile.
    try {
      await createSalesChannelForChatAccount({
        companyId,
        chatAccountId: data.id,
        platform: platform as 'line' | 'facebook',
        accountName: account_name.trim(),
      });
    } catch (e) {
      console.warn('createSalesChannelForChatAccount failed:', e);
    }

    // Auto-fetch LINE bot profile (non-blocking)
    if (platform === 'line' && finalCredentials.channel_access_token) {
      try {
        const botInfoRes = await fetch('https://api.line.me/v2/bot/info', {
          headers: { 'Authorization': `Bearer ${finalCredentials.channel_access_token}` },
        });
        if (botInfoRes.ok) {
          const botInfo = await botInfoRes.json();
          const updatedCreds = {
            ...finalCredentials,
            bot_name: botInfo.displayName || '',
            bot_picture_url: botInfo.pictureUrl || '',
            basic_id: botInfo.basicId || '',
          };
          await supabaseAdmin
            .from('chat_accounts')
            .update({ credentials: updatedCreds, updated_at: new Date().toISOString() })
            .eq('id', data.id);
          data.credentials = updatedCreds;
        }
      } catch (e) {
        console.warn('Auto-fetch LINE bot profile failed:', e);
      }
    }

    return NextResponse.json({
      success: true,
      account: {
        ...data,
        credentials: maskCredentials(data.credentials as Record<string, unknown>, platform),
        webhook_url: getWebhookUrl(request, data.id, platform),
      },
    });
  } catch (error) {
    console.error('POST chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}

// PUT - Update chat account
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(companyRoles, 'masterdata.chat_channels')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const body = await request.json();
    const { id, account_name, credentials, is_active } = body;

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Get existing account
    const { data: existing } = await supabaseAdmin
      .from('chat_accounts')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (account_name !== undefined) {
      updateData.account_name = account_name.trim();
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    if (credentials) {
      // Merge masked values with existing credentials
      const existingCreds = existing.credentials as Record<string, unknown>;
      const mergedCreds = { ...existingCreds };

      for (const [key, value] of Object.entries(credentials)) {
        if (typeof value === 'string' && value.includes('•')) {
          // Masked value — keep existing
          continue;
        }
        mergedCreds[key] = value;
      }

      // Validate: prevent duplicate FB page_id or LINE channel_secret
      if (existing.platform === 'facebook' && mergedCreds.page_id) {
        const { data: others } = await supabaseAdmin
          .from('chat_accounts')
          .select('id, credentials')
          .eq('platform', 'facebook')
          .eq('is_active', true)
          .neq('id', id);

        const dup = (others || []).find(a => {
          const c = a.credentials as Record<string, unknown> | null;
          return c && c.page_id === mergedCreds.page_id;
        });
        if (dup) return NextResponse.json({ error: 'Facebook Page นี้ถูกเชื่อมต่อแล้วในระบบ' }, { status: 400 });
      }

      if (existing.platform === 'line' && mergedCreds.channel_secret) {
        const { data: others } = await supabaseAdmin
          .from('chat_accounts')
          .select('id, credentials')
          .eq('platform', 'line')
          .eq('is_active', true)
          .neq('id', id);

        const dup = (others || []).find(a => {
          const c = a.credentials as Record<string, unknown> | null;
          return c && c.channel_secret === mergedCreds.channel_secret;
        });
        if (dup) return NextResponse.json({ error: 'LINE OA นี้ถูกเชื่อมต่อแล้วในระบบ' }, { status: 400 });
      }

      updateData.credentials = mergedCreds;
    }

    const { error } = await supabaseAdmin
      .from('chat_accounts')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    // Keep the sales_channels mirror in step (name + is_active).
    // Shopee/Lazada have no mirror — orders already flow via marketplace sync.
    if (existing.platform !== 'shopee' && existing.platform !== 'lazada' && existing.platform !== 'tiktok') {
      try {
        await syncSalesChannelFromChatAccount({
          companyId,
          chatAccountId: id,
          platform: existing.platform as 'line' | 'facebook',
          accountName: (updateData.account_name as string | undefined) ?? existing.account_name,
          isActive: (updateData.is_active as boolean | undefined) ?? existing.is_active,
        });
      } catch (e) {
        console.warn('syncSalesChannelFromChatAccount failed:', e);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

// DELETE - Delete chat account
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!companyId) return NextResponse.json({ error: 'No company context' }, { status: 403 });
    if (!can(companyRoles, 'masterdata.chat_channels')) return NextResponse.json({ error: 'Admin only' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Account ID is required' }, { status: 400 });
    }

    // Remove the mirror first (hard-deletes if no orders reference it; otherwise
    // sets is_active=false). FK SET NULL on the chat_accounts delete below will
    // also clear chat_account_id on any remaining historical mirror rows.
    try {
      await removeSalesChannelForChatAccount({ companyId, chatAccountId: id });
    } catch (e) {
      console.warn('removeSalesChannelForChatAccount failed:', e);
    }

    const { error } = await supabaseAdmin
      .from('chat_accounts')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE chat-accounts error:', error);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}

// Helper: mask secrets
/**
 * รูปประจำช่องทาง (avatar) — null = ไม่มีรูปจริง ให้ฝั่ง UI ตกไปใช้ไอคอน platform แทน
 *
 * ห้ามคืน path ของไอคอน platform เป็น "รูป" เด็ดขาด — เคยทำแบบนั้นแล้วการ์ดร้าน
 * marketplace โชว์โลโก้ Lazada/Shopee แทนโลโก้ร้านจริงตลอดไป (เจอจริง 2026-08-28)
 */
function resolveAccountPicture(
  platform: string,
  creds: Record<string, unknown> | null,
  shopLogos: Record<string, string>
): string | null {
  const mpId = creds?.marketplace_account_id;
  if (typeof mpId === 'string' && shopLogos[mpId]) return shopLogos[mpId];

  if (!creds) return null;
  if (platform === 'line') return (creds.bot_picture_url as string) || null;
  if (platform === 'facebook') {
    const pageId = creds.page_id as string | undefined;
    if (pageId) return `https://graph.facebook.com/${pageId}/picture?type=small`;
    return (creds.page_picture_url as string) || (creds.ig_profile_picture_url as string) || null;
  }
  return null;
}

function maskCredentials(creds: Record<string, unknown>, platform: string): Record<string, unknown> {
  const masked = { ...creds };
  const secretKeys = platform === 'line'
    ? ['channel_secret', 'channel_access_token']
    : platform === 'facebook'
      ? ['app_secret', 'page_access_token']
      : []; // shopee/lazada/tiktok — reference ids only, no secrets

  for (const key of secretKeys) {
    const value = masked[key];
    if (typeof value === 'string' && value.length > 4) {
      masked[key] = '•'.repeat(value.length - 4) + value.slice(-4);
    }
  }
  return masked;
}

// Helper: get webhook URL
function getWebhookUrl(request: NextRequest, accountId: string, platform: string): string {
  const host = request.headers.get('host') || 'localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  if (platform === 'shopee') {
    // Partner-level webhook (shared with order sync) — configured once at Shopee Open Platform
    return `${protocol}://${host}/api/shopee/webhook`;
  }
  if (platform === 'lazada') {
    // App-level webhook — configured once at Lazada Open Platform (Push Mechanism)
    return `${protocol}://${host}/api/lazada/webhook`;
  }
  if (platform === 'tiktok') {
    // App-level webhook (shared with order sync) — configured per-event at TikTok Partner Center
    return `${protocol}://${host}/api/tiktok/webhook`;
  }
  const apiPath = platform === 'line' ? 'line' : 'fb';
  return `${protocol}://${host}/api/${apiPath}/webhook?account=${accountId}`;
}
