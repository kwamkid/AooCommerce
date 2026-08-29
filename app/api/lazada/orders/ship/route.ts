import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getLazadaShipmentProviders,
  packLazadaOrder,
  readyToShipLazada,
  type LazadaAccountRow,
} from '@/lib/lazada/api';
import { logIntegration } from '@/lib/integration-logger';
import { isQuotaBlocked } from '@/lib/marketplace/quota';

// จัดส่งออเดอร์ Lazada
//
// Lazada ไม่มี API "แบ่งกล่อง" แยกต่างหาก — **การแบ่งเกิดตอนแพ็ค**
// เรียก Pack หนึ่งครั้งต่อหนึ่งพัสดุ ส่ง order_item_ids เฉพาะกลุ่มนั้นไป
// (ต่างจาก Shopee/TikTok ที่สร้างออเดอร์ก้อนเดียวแล้วค่อยผ่าทีหลัง)
//
// ลำดับ: GetShipmentProvider → Pack (ต่อกล่อง) → ReadyToShip
//
// POST { order_id, parcels?: [{ order_item_ids: string[] }], shipment_provider_code? }
//   ไม่ส่ง parcels = แพ็ครวมกล่องเดียว

export async function POST(request: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
  if (!isAuth || !companyId || !can(companyRoles, 'marketplace.ship')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const body = await request.json().catch(() => ({}));
  const { order_id, parcels, shipment_provider_code, preview } = body as {
    order_id?: string;
    parcels?: { order_item_ids: string[] }[];
    shipment_provider_code?: string;
    preview?: boolean;
  };

  if (!order_id) {
    return NextResponse.json({ error: 'ต้องระบุออเดอร์' }, { status: 400 });
  }

  const { data: order } = await supabaseAdmin
    .from('orders')
    .select('id, source, order_status, external_order_sn, marketplace_account_id')
    .eq('id', order_id)
    .eq('company_id', companyId)
    .single();

  if (!order) return NextResponse.json({ error: 'ไม่พบออเดอร์' }, { status: 404 });
  if (order.source !== 'lazada') {
    return NextResponse.json({ error: 'ออเดอร์นี้ไม่ใช่ของ Lazada' }, { status: 400 });
  }
  if (!order.external_order_sn || !order.marketplace_account_id) {
    return NextResponse.json({ error: 'ออเดอร์ไม่มีข้อมูลเชื่อมกับร้าน Lazada' }, { status: 400 });
  }

  const { data: account } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('id', order.marketplace_account_id)
    .single();
  if (!account) return NextResponse.json({ error: 'ไม่พบร้าน Lazada' }, { status: 404 });

  // เช็ค circuit breaker ก่อนยิงเสมอ — ถ้าโควตาฝั่งจัดส่งเต็มอยู่ ยิงไปก็ fail
  // แล้วยิ่งลาก success rate ลง (กติกาเดียวกับ sync routes ทุกตัว)
  const quota = await isQuotaBlocked('lazada', 'fulfillment');
  if (quota.blocked) {
    return NextResponse.json({
      error: `Lazada จำกัดการเรียกชั่วคราว — ลองใหม่หลัง ${quota.until ? new Date(quota.until).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : 'สักครู่'}`,
    }, { status: 429 });
  }

  // รหัสรายชิ้นของ Lazada — เก็บไว้ตอน sync เพราะย้อนกลับไปหาทีหลังไม่ได้แม่น
  const { data: orderItems } = await supabaseAdmin
    .from('order_items')
    .select('id, product_name, quantity, external_line_item_ids')
    .eq('order_id', order_id);

  const missing = (orderItems || []).filter(
    oi => (oi.external_line_item_ids?.length || 0) < oi.quantity
  );
  if (missing.length > 0) {
    return NextResponse.json({
      error: `ไม่มีรหัสรายชิ้นของ Lazada สำหรับ: ${missing.map(m => m.product_name).join(', ')} — ลอง sync ออเดอร์นี้ใหม่ก่อน`,
    }, { status: 400 });
  }

  // เคยแพ็คไปแล้วมั้ย — Lazada **ไม่มี API ยกเลิกการแพ็ค** ถ้ายิงซ้ำจะได้พัสดุเกินจริง
  // ร่องรอยถูกบันทึกทันทีที่ Pack สำเร็จ (ก่อน ReadyToShip) จึงทนต่อการถูกตัดกลางคัน
  const { data: existingParcels } = await supabaseAdmin
    .from('order_parcels')
    .select('package_number')
    .eq('order_id', order_id)
    .not('package_number', 'is', null);

  if ((existingParcels?.length || 0) > 0 && !preview) {
    return NextResponse.json({
      already_packed: true,
      packages: existingParcels!.map(p => ({ package_id: p.package_number as string })),
      error: 'ออเดอร์นี้แพ็คไปแล้ว — ถ้าต้องการแก้ไขต้องทำใน Lazada Seller Center',
    }, { status: 409 });
  }

  const allItemIds = (orderItems || []).flatMap(oi => oi.external_line_item_ids || []);
  if (allItemIds.length === 0) {
    return NextResponse.json({ error: 'ไม่พบสินค้าในออเดอร์' }, { status: 400 });
  }

  // แบ่งกล่องตามที่ส่งมา — ไม่ส่งมา = กล่องเดียวรวมทุกชิ้น
  const groups = parcels?.length
    ? parcels.map(p => p.order_item_ids).filter(ids => ids.length > 0)
    : [allItemIds];

  try {
    const creds = await ensureValidToken(account as unknown as LazadaAccountRow, 'main');

    // ถามขนส่งที่ใช้ได้ก่อนเสมอ — แต่ละออเดอร์ไม่เหมือนกัน
    const { providers, platformDefault, error: provError } = await getLazadaShipmentProviders(
      creds, [{ orderId: order.external_order_sn, orderItemIds: allItemIds }]
    );
    if (provError) {
      return NextResponse.json({ error: `ดึงรายชื่อขนส่งไม่สำเร็จ: ${provError}` }, { status: 400 });
    }

    const chosen = shipment_provider_code
      ? providers.find(p => p.provider_code === shipment_provider_code)
      : (providers.find(p => p.provider_code === platformDefault) || providers[0]);

    // preview = ให้หน้าเว็บเอาไปแสดงตัวเลือกขนส่งก่อนยืนยัน ยังไม่แพ็คจริง
    if (preview) {
      return NextResponse.json({ providers, platform_default: platformDefault, parcels: groups.length });
    }
    // ไม่มีขนส่งให้เลือก = ปล่อยให้ Lazada จัดสรรเอง (มี platform_default อยู่แล้ว)
    // ห้าม hard-fail ตรงนี้ — ถ้า Lazada ต้องการรหัสขนส่งจริง มันจะบอกเองตอน Pack
    // ซึ่งเป็นข้อความที่ตรงกว่าที่เราเดา (ทดสอบจริงพบว่าลิสต์ว่างได้เป็นปกติ)

    // แพ็คทีละกล่อง — Lazada สร้างพัสดุหนึ่งใบต่อการเรียกหนึ่งครั้ง
    const packedPackages: { package_id: string; tracking_number?: string; provider?: string }[] = [];
    for (const ids of groups) {
      const { items, error } = await packLazadaOrder(creds, {
        orderId: order.external_order_sn,
        orderItemIds: ids,
        shipmentProviderCode: chosen?.provider_code,
        shippingAllocateType: chosen?.shipping_allocate_type,
      });
      if (error) {
        return NextResponse.json({
          error: `แพ็คไม่สำเร็จ: ${error}`,
          packed_so_far: packedPackages,
        }, { status: 400 });
      }
      for (const it of items) {
        if (!it.package_id) continue;
        if (packedPackages.some(p => p.package_id === it.package_id)) continue;
        packedPackages.push({
          package_id: it.package_id,
          tracking_number: it.tracking_number,
          provider: it.shipment_provider,
        });
      }
    }

    if (packedPackages.length === 0) {
      return NextResponse.json({ error: 'Lazada ไม่ได้คืนเลขพัสดุกลับมา' }, { status: 400 });
    }

    // **บันทึกร่องรอยก่อนทำ ReadyToShip** — ถ้าล้มหลังจากนี้ ยังรู้ว่าแพ็คไปแล้ว
    // ไม่งั้นกดซ้ำจะแพ็คใหม่ ได้พัสดุเกินและเสียค่าส่งฟรี ๆ
    for (let i = 0; i < packedPackages.length; i++) {
      await supabaseAdmin.from('order_parcels').insert({
        company_id: companyId,
        order_id,
        parcel_number: i + 1,
        package_number: packedPackages[i].package_id,
        status: 'pending',
      });
    }

    // แจ้งพร้อมส่ง — ถ้าไม่ทำขั้นนี้ขนส่งจะไม่มารับของ
    const { error: rtsError } = await readyToShipLazada(
      creds, packedPackages.map(p => p.package_id)
    );

    const tracking = packedPackages.map(p => p.tracking_number).filter(Boolean).join(', ');
    await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'processing',
        tracking_number: tracking || null,
        shipping_carrier: chosen?.name || packedPackages[0]?.provider || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id);

    logIntegration({
      company_id: companyId,
      integration: 'lazada',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'outgoing',
      action: 'ship_order',
      api_path: '/order/fulfill/pack',
      status: rtsError ? 'error' : 'success',
      error_message: rtsError || undefined,
      reference_type: 'order',
      reference_id: order_id,
      reference_label: order.external_order_sn,
      duration_ms: Date.now() - startedAt,
    });

    return NextResponse.json({
      success: true,
      packages: packedPackages,
      carrier: chosen?.name || packedPackages[0]?.provider || null,
      // แพ็คสำเร็จแล้วแต่แจ้งพร้อมส่งไม่ผ่าน — ของยังอยู่ ไม่ได้หาย แค่ต้องกดซ้ำ
      ready_to_ship_error: rtsError || undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
    logIntegration({
      company_id: companyId,
      integration: 'lazada',
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
