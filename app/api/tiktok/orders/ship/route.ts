import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getCommonHandoverSlots,
  batchShipTikTokPackages,
  type TikTokAccountRow,
  type TikTokShipPackageInput,
} from '@/lib/tiktok/api';
import { isQuotaBlocked } from '@/lib/marketplace/quota';
import { logIntegration } from '@/lib/integration-logger';

// จัดส่งออเดอร์ TikTok (BatchShipPackages)
//
// TikTok มี 2 วิธีส่งมอบเหมือน Shopee:
//   PICKUP   = ขนส่งมารับที่ร้าน → ต้องเลือกรอบเวลา (ถามผ่าน preview ก่อน)
//   DROP_OFF = เอาไปส่งเองที่จุดรับ → ไม่ต้องเลือกอะไร
//
// POST { order_id, handover_method?, pickup_slot?, preview? }

export const maxDuration = 120;

/**
 * สถานะที่แปลว่า "แจ้งส่งแล้ว" และ mapTikTokStatus แปลเป็น processing เหมือนกัน
 * → ซ่อมเป็น processing ได้ปลอดภัย
 */
const ALREADY_SHIPPED = new Set(['AWAITING_COLLECTION', 'PARTIALLY_SHIPPING']);

/**
 * ล้ำไปกว่านั้นแล้ว (shipping/completed) — **ห้ามเซ็ตเป็น processing** จะลากถอยหลัง
 * ปล่อยให้ sync ปกติอัปเดตให้ตรง
 */
const BEYOND_SHIPPED = new Set(['IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED']);

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.ship')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const { order_id, handover_method, pickup_slot, preview } = body as {
    order_id?: string;
    handover_method?: 'PICKUP' | 'DROP_OFF';
    pickup_slot?: { start_time: number; end_time: number };
    preview?: boolean;
  };

  if (!order_id) return NextResponse.json({ error: 'ต้องระบุออเดอร์' }, { status: 400 });

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, source, order_status, external_status, external_order_sn, marketplace_account_id, external_data')
    .eq('id', order_id)
    .eq('company_id', companyId)
    .single();

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 });
  if (order.source !== 'tiktok') {
    return NextResponse.json({ error: 'ออเดอร์นี้ไม่ใช่ของ TikTok' }, { status: 400 });
  }
  if (!order.marketplace_account_id || !order.external_order_sn) {
    return NextResponse.json({ error: 'ออเดอร์ไม่มีข้อมูลเชื่อมกับร้าน TikTok' }, { status: 400 });
  }

  // TikTok รับไปแล้วแต่ระบบเรายังค้าง — ซ่อมสถานะ ไม่ยิงซ้ำ
  // (เกิดเมื่อรอบก่อนถูกตัดกลางคัน: ยิงสำเร็จแล้วแต่ยังไม่ทันเขียน DB)
  if (BEYOND_SHIPPED.has(order.external_status || '')) {
    return NextResponse.json({
      error: `TikTok อยู่สถานะ ${order.external_status} แล้ว — รอ sync อัปเดตให้เอง`,
    }, { status: 400 });
  }

  if (ALREADY_SHIPPED.has(order.external_status || '')) {
    await supabaseAdmin
      .from('orders')
      .update({ order_status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', order_id)
      .eq('company_id', companyId)
      .eq('order_status', 'ready_to_ship');
    return NextResponse.json({ success: true, repaired: true, external_status: order.external_status });
  }

  const quota = await isQuotaBlocked('tiktok', 'fulfillment');
  if (quota.blocked) {
    return NextResponse.json({ error: 'TikTok จำกัดการเรียกชั่วคราว — ลองใหม่อีกครั้งภายหลัง' }, { status: 429 });
  }

  // เลขพัสดุ: ถ้าเคยแบ่งกล่อง ให้ใช้ของ order_parcels เพราะการแบ่งสร้างพัสดุชุดใหม่
  // ส่วน external_data เป็นภาพ ณ ตอน sync ครั้งล่าสุด — หลังแบ่งกล่องมันจะเก่าทันที
  // (split route ไม่ได้ refresh external_data) ถ้าใช้ของเก่าจะส่งเลขที่ TikTok ไม่รู้จักแล้ว
  const { data: parcelRows } = await supabaseAdmin
    .from('order_parcels')
    .select('package_number')
    .eq('order_id', order_id)
    .not('package_number', 'is', null);

  const lineItems = ((order.external_data as Record<string, unknown>)?.line_items || []) as
    { package_id?: string }[];
  const packageIds = (parcelRows?.length || 0) > 0
    ? [...new Set(parcelRows!.map(p => p.package_number as string))]
    : [...new Set(lineItems.map(li => li.package_id).filter((v): v is string => !!v))];

  if (packageIds.length === 0) {
    return NextResponse.json({
      error: 'ไม่พบเลขพัสดุของ TikTok ในออเดอร์นี้ — ลอง sync ออเดอร์ใหม่ก่อน',
    }, { status: 400 });
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', order.marketplace_account_id)
    .single();
  if (!account) return NextResponse.json({ error: 'ไม่พบร้าน TikTok' }, { status: 404 });

  try {
    const creds = await ensureValidToken(account as unknown as TikTokAccountRow);

    // preview = ให้หน้าเว็บเอารอบเวลาไปให้ผู้ใช้เลือกก่อน ยังไม่ส่งจริง
    if (preview) {
      // ถามทุกพัสดุแล้วเอาเฉพาะรอบที่ใช้ได้ร่วมกัน — ผู้ใช้เลือกครั้งเดียวแล้วใช้ได้จริงทุกใบ
      const { slots, perPackage, error } = await getCommonHandoverSlots(creds, packageIds);
      const anyHasSlots = [...perPackage.values()].some(n => n > 0);

      // มีพัสดุที่ต้องเลือกรอบ แต่หารอบร่วมไม่เจอ — บอกตรง ๆ ดีกว่าเลือกให้มั่ว
      if (anyHasSlots && slots.length === 0 && packageIds.length > 1) {
        return NextResponse.json({
          package_ids: packageIds,
          needs_pickup_slot: true,
          pickup_slots: [],
          error: 'พัสดุในออเดอร์นี้มีรอบเวลาเข้ารับไม่ตรงกัน — ต้องแจ้งส่งทีละกล่องใน TikTok Seller Center',
        });
      }

      return NextResponse.json({
        package_ids: packageIds,
        // มีรอบเวลาให้เลือก = ต้องถามผู้ใช้ก่อน · ไม่มี = ส่งได้เลยแบบ DROP_OFF
        needs_pickup_slot: slots.length > 0,
        pickup_slots: slots,
        slots_error: error,
      });
    }

    const method: 'PICKUP' | 'DROP_OFF' = handover_method || (pickup_slot ? 'PICKUP' : 'DROP_OFF');
    const packages: TikTokShipPackageInput[] = packageIds.map(id => ({
      id,
      handover_method: method,
      ...(method === 'PICKUP' && pickup_slot ? { pickup_slot } : {}),
    }));

    const { errors, error } = await batchShipTikTokPackages(creds, packages);
    if (error) {
      return NextResponse.json({ error: `TikTok ปฏิเสธ: ${error}` }, { status: 400 });
    }

    // ⚠️ TikTok คืนแต่รายการที่ล้ม ไม่มี success list — ตัวที่ไม่อยู่ใน errors คือสำเร็จ
    // ห้าม assume ว่าทุกใบสำเร็จ (บทเรียนจาก mass_ship_order ของ Shopee ที่เคยทำออเดอร์หาย)
    const failedIds = new Set(errors.map(e => e.package_id).filter(Boolean));
    const shipped = packageIds.filter(id => !failedIds.has(id));

    if (shipped.length > 0) {
      await supabaseAdmin
        .from('orders')
        .update({ order_status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', order_id)
        .eq('company_id', companyId);
    }

    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'ship_order',
      api_path: '/fulfillment/202309/packages/ship',
      request_body: { packages },
      response_body: { shipped, errors },
      status: errors.length > 0 ? 'error' : 'success',
      error_message: errors.map(e => e.message).filter(Boolean).join('; ') || undefined,
      reference_type: 'order',
      reference_id: order_id,
      reference_label: order.external_order_sn,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: shipped.length > 0,
      shipped_package_ids: shipped,
      failed: errors,
      handover_method: method,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
    logIntegration({
      company_id: companyId,
      integration: 'tiktok',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'ship_order',
      status: 'error',
      error_message: message,
      reference_type: 'order',
      reference_id: order_id,
      duration_ms: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
