import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ensureValidToken, ShopeeAccountRow } from '@/lib/shopee/api';
import {
  getBundleDeal,
  getAddOnDeal,
  endBundleDeal,
  endAddOnDeal,
  deleteBundleDeal,
  deleteAddOnDeal,
} from '@/lib/shopee/deals';
import { deriveDealStatus, getUnsyncStrategy } from '@/lib/promotions/promotion-rules';
import { logIntegration } from '@/lib/integration-logger';

// ─── POST /api/shopee/deals/toggle — Enable/Disable single shop deal ──

export async function POST(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { promotion_id, account_id, action } = body as {
      promotion_id: string;
      account_id: string;
      action: 'enable' | 'disable';
    };

    if (!promotion_id || !account_id || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // ─── DISABLE: End/delete existing deal on Shopee ───
    if (action === 'disable') {
      // Find existing deal
      const { data: deal } = await supabaseAdmin
        .from('shopee_deals')
        .select('*')
        .eq('promotion_id', promotion_id)
        .eq('account_id', account_id)
        .single();

      if (!deal) {
        // No deal to disable — just update platform record
        await supabaseAdmin
          .from('promotion_platforms')
          .update({ is_enabled: false })
          .eq('promotion_id', promotion_id)
          .eq('account_id', account_id);
        return NextResponse.json({ success: true, message: 'ไม่มี deal บน Shopee' });
      }

      // Get account credentials
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', account_id)
        .single();

      if (!account) {
        return NextResponse.json({ error: 'ไม่พบบัญชี Shopee' }, { status: 404 });
      }

      const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);
      const externalDealId = deal.external_deal_id;
      const shopName = account.shop_name || account_id;
      let actionTaken = 'skip';

      if (externalDealId) {
        // Get real status from Shopee API
        const dealDetail = deal.deal_type === 'bundle_deal'
          ? await getBundleDeal(creds, externalDealId)
          : await getAddOnDeal(creds, externalDealId);

        const realStatus = deriveDealStatus(dealDetail as { start_time?: number; end_time?: number; time_status?: number } | null);
        const strategy = getUnsyncStrategy(realStatus);

        if (strategy === 'end') {
          if (deal.deal_type === 'bundle_deal') await endBundleDeal(creds, externalDealId);
          else await endAddOnDeal(creds, externalDealId);
          actionTaken = 'ended';
        } else if (strategy === 'delete') {
          if (deal.deal_type === 'bundle_deal') await deleteBundleDeal(creds, externalDealId);
          else await deleteAddOnDeal(creds, externalDealId);
          actionTaken = 'deleted';
        } else {
          actionTaken = 'already_expired';
        }
      }

      // Remove deal record from DB
      await supabaseAdmin.from('shopee_deals').delete().eq('id', deal.id);

      // Update platform record
      await supabaseAdmin
        .from('promotion_platforms')
        .update({ is_enabled: false })
        .eq('promotion_id', promotion_id)
        .eq('account_id', account_id);

      // Log
      logIntegration({
        company_id: companyId,
        integration: 'shopee',
        account_id: account.id,
        account_name: shopName,
        direction: 'outgoing',
        action: 'toggle_off_deal',
        method: 'POST',
        api_path: deal.deal_type === 'bundle_deal'
          ? (actionTaken === 'ended' ? '/api/v2/bundle_deal/end_bundle_deal' : '/api/v2/bundle_deal/delete_bundle_deal')
          : (actionTaken === 'ended' ? '/api/v2/add_on_deal/end_add_on_deal' : '/api/v2/add_on_deal/delete_add_on_deal'),
        request_body: { promotion_id, deal_id: externalDealId, action: actionTaken },
        response_body: { success: true },
        status: 'success',
        reference_type: 'promotion',
        reference_id: promotion_id,
        reference_label: `Toggle OFF deal → ${shopName} (${actionTaken})`,
      });

      return NextResponse.json({
        success: true,
        action: actionTaken,
        message: actionTaken === 'ended'
          ? `ปิด deal ร้าน ${shopName} สำเร็จ (ongoing → expired)`
          : actionTaken === 'deleted'
            ? `ลบ deal ร้าน ${shopName} สำเร็จ (upcoming → deleted)`
            : `deal ร้าน ${shopName} หมดอายุแล้ว`,
      });
    }

    // ─── ENABLE: Check for duplicate deal before allowing ───
    if (action === 'enable') {
      // Check if there's still an active deal (could happen if end hasn't propagated yet)
      const { data: existingDeal } = await supabaseAdmin
        .from('shopee_deals')
        .select('id, external_deal_id, status, deal_type')
        .eq('promotion_id', promotion_id)
        .eq('account_id', account_id)
        .single();

      if (existingDeal) {
        // Verify real status on Shopee
        const { data: account } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('id', account_id)
          .single();

        if (account && existingDeal.external_deal_id) {
          const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);
          const dealDetail = existingDeal.deal_type === 'bundle_deal'
            ? await getBundleDeal(creds, existingDeal.external_deal_id)
            : await getAddOnDeal(creds, existingDeal.external_deal_id);

          const realStatus = deriveDealStatus(dealDetail as { start_time?: number; end_time?: number; time_status?: number } | null);

          if (realStatus === 'ongoing' || realStatus === 'upcoming') {
            return NextResponse.json({
              error: 'มีดีลที่ยัง active อยู่บน Shopee — รอ 10 นาทีแล้วค่อยเปิดใหม่',
              error_code: 'DUPLICATE_DEAL',
            }, { status: 409 });
          }

          // Deal is expired on Shopee — clean up stale record
          await supabaseAdmin.from('shopee_deals').delete().eq('id', existingDeal.id);
        }
      }

      // Update platform record to enabled
      // Upsert: if record exists → update, if not → insert
      const { data: existingPlatform } = await supabaseAdmin
        .from('promotion_platforms')
        .select('id')
        .eq('promotion_id', promotion_id)
        .eq('account_id', account_id)
        .single();

      if (existingPlatform) {
        await supabaseAdmin
          .from('promotion_platforms')
          .update({ is_enabled: true })
          .eq('id', existingPlatform.id);
      } else {
        await supabaseAdmin
          .from('promotion_platforms')
          .insert({
            promotion_id,
            platform: 'shopee',
            account_id,
            is_enabled: true,
          });
      }

      // Return success — the actual deal creation will be handled by PushDealModal (SSE)
      return NextResponse.json({
        success: true,
        action: 'enabled',
        message: 'พร้อมสร้าง deal — กำลังเปิด Push...',
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('[toggle deal] error:', err);
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
