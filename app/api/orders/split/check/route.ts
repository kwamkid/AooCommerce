import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getPackageDetail, ensureValidToken } from '@/lib/shopee/api';
import { ensureValidToken as ensureTikTokToken, getOrderSplitAttributes } from '@/lib/tiktok/api';

/**
 * GET /api/orders/split/check?order_id=xxx
 * Pre-check whether a marketplace order can be split (Shopee / TikTok).
 * Returns 200 if ok, 400 with error message if not.
 */
export async function GET(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orderId = req.nextUrl.searchParams.get('order_id');
  if (!orderId) {
    return NextResponse.json({ error: 'Missing order_id' }, { status: 400 });
  }

  try {
    // Fetch order
    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, source, marketplace_account_id, external_order_sn, external_data')
      .eq('id', orderId)
      .eq('company_id', companyId)
      .single();

    if (!order) {
      return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 });
    }

    // TikTok มี API บอกตรง ๆ ว่าออเดอร์นี้แบ่งได้มั้ย / บังคับแบ่งมั้ย
    if (order.source === 'tiktok') {
      if (!order.marketplace_account_id || !order.external_order_sn) {
        return NextResponse.json({ error: 'ไม่พบบัญชี TikTok' }, { status: 400 });
      }
      const { data: ttAccount } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', order.marketplace_account_id)
        .single();
      if (!ttAccount) {
        return NextResponse.json({ error: 'ไม่พบบัญชี TikTok' }, { status: 404 });
      }
      const ttCreds = await ensureTikTokToken(ttAccount);
      const { attributes, error } = await getOrderSplitAttributes(ttCreds, [order.external_order_sn]);
      if (error) {
        return NextResponse.json({ error: `เช็คสิทธิ์แบ่งกล่องไม่สำเร็จ: ${error}` }, { status: 400 });
      }
      const attr = attributes.find(a => String(a.order_id) === order.external_order_sn) || attributes[0];
      if (attr && attr.can_split === false) {
        return NextResponse.json({ error: 'TikTok ไม่อนุญาตให้แบ่งกล่องออเดอร์นี้' }, { status: 400 });
      }
      return NextResponse.json({ can_split: true, must_split: attr?.must_split ?? false });
    }

    if (order.source !== 'shopee') {
      return NextResponse.json({ can_split: true });
    }

    if (!order.marketplace_account_id) {
      return NextResponse.json({ error: 'ไม่พบบัญชี Shopee' }, { status: 400 });
    }

    // Get Shopee credentials
    const { data: account } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', order.marketplace_account_id)
      .single();

    if (!account) {
      return NextResponse.json({ error: 'ไม่พบบัญชี Shopee' }, { status: 404 });
    }

    const creds = await ensureValidToken(account);
    if (!creds) {
      return NextResponse.json({ error: 'Shopee token หมดอายุ กรุณาเชื่อมต่อใหม่' }, { status: 401 });
    }

    // Get package_number from external_data or fetch from Shopee
    const packageList = (order.external_data as Record<string, unknown>)?.package_list as
      { package_number: string }[] | undefined;
    const packageNumber = packageList?.[0]?.package_number;

    if (!packageNumber) {
      // Try fetching from Shopee API
      const { shopeeApiRequest } = await import('@/lib/shopee/api');
      const { data: detailData } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
        order_sn_list: order.external_order_sn,
        response_optional_fields: 'package_list',
      });
      const orderDetail = (detailData as { order_list?: { package_list?: { package_number: string }[] }[] })
        ?.order_list?.[0];
      const pkgNum = orderDetail?.package_list?.[0]?.package_number;

      if (!pkgNum) {
        return NextResponse.json({
          error: 'ไม่พบข้อมูล package จาก Shopee — ลอง sync ออเดอร์ใหม่',
        }, { status: 400 });
      }

      // Check with this package number
      const { packages, error: pkgError } = await getPackageDetail(creds, [pkgNum]);
      if (pkgError || packages.length === 0) {
        return NextResponse.json({ error: 'ไม่สามารถเช็คสถานะแบ่งกล่องจาก Shopee ได้' }, { status: 400 });
      }

      if (!packages[0].can_split_order) {
        // Update DB so we don't re-check next time
        await supabaseAdmin.from('orders').update({ can_split_order: false }).eq('id', orderId);
        return NextResponse.json({
          error: 'Shopee ไม่อนุญาตให้แบ่งกล่องออเดอร์นี้ — ร้านค้าต้องเปิดใช้งาน "แยกพัสดุ" ที่ Shopee Seller Centre ก่อน',
        }, { status: 400 });
      }

      // It can be split — update DB
      await supabaseAdmin.from('orders').update({ can_split_order: true }).eq('id', orderId);
      return NextResponse.json({ can_split: true });
    }

    // Check can_split_order
    const { packages, error: pkgError } = await getPackageDetail(creds, [packageNumber]);
    if (pkgError || packages.length === 0) {
      return NextResponse.json({ error: 'ไม่สามารถเช็คสถานะแบ่งกล่องจาก Shopee ได้' }, { status: 400 });
    }

    const canSplit = packages[0].can_split_order === true;

    // Update DB
    await supabaseAdmin.from('orders').update({ can_split_order: canSplit }).eq('id', orderId);

    if (!canSplit) {
      return NextResponse.json({
        error: 'Shopee ไม่อนุญาตให้แบ่งกล่องออเดอร์นี้ — ร้านค้าต้องเปิดใช้งาน "แยกพัสดุ" ที่ Shopee Seller Centre ก่อน',
      }, { status: 400 });
    }

    return NextResponse.json({ can_split: true });
  } catch (err) {
    console.error('Split check error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการเช็ค' }, { status: 500 });
  }
}
