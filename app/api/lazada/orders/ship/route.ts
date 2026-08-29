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
    .select('id, source, order_status, external_order_sn, marketplace_account_id, external_data')
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

  // คอลัมน์ external_line_item_ids ถูกเขียนตอน "สร้าง" ออเดอร์เท่านั้น — ออเดอร์ที่เข้าระบบ
  // ก่อนหน้านี้จึงว่าง และ sync ซ้ำก็ไม่เติมให้ (updateExistingOrder ไม่แตะ order_items)
  // → ถอยไปอ่านจาก external_data ที่ Lazada ส่งมาพร้อมออเดอร์เสมอ แทนที่จะปฏิเสธ
  const missingIds = (orderItems || []).some(
    oi => (oi.external_line_item_ids?.length || 0) < oi.quantity
  );

  // เคยแพ็คไปแล้วมั้ย — Lazada **ไม่มี API ยกเลิกการแพ็ค** ถ้ายิงซ้ำจะได้พัสดุเกินจริง
  // ร่องรอยถูกบันทึกทันทีที่ Pack สำเร็จ (ก่อน ReadyToShip) จึงทนต่อการถูกตัดกลางคัน
  const { data: existingParcels } = await supabaseAdmin
    .from('order_parcels')
    .select('package_number, status')
    .eq('order_id', order_id)
    .not('package_number', 'is', null);

  // แพ็คแล้วแต่ยังไม่ได้แจ้งพร้อมส่ง (RTS ล้มรอบก่อน) → ทำเฉพาะ RTS ซ้ำ **ห้ามแพ็คใหม่**
  const pendingParcels = (existingParcels || []).filter(p => p.status !== 'shipped');
  if (pendingParcels.length > 0 && !preview) {
    const { data: acc } = await supabaseAdmin
      .from('marketplace_accounts').select('*').eq('id', order.marketplace_account_id).single();
    if (acc) {
      const creds = await ensureValidToken(acc as unknown as LazadaAccountRow, 'main');
      const ids = pendingParcels.map(p => p.package_number as string);
      const { error: rtsErr } = await readyToShipLazada(creds, ids);
      if (rtsErr) {
        return NextResponse.json({ error: `แจ้งพร้อมส่งไม่สำเร็จ: ${rtsErr} — กดใหม่ได้`, packages: ids }, { status: 400 });
      }
      await supabaseAdmin.from('order_parcels')
        .update({ status: 'shipped', updated_at: new Date().toISOString() })
        .eq('order_id', order_id).neq('status', 'shipped');
      await supabaseAdmin.from('orders')
        .update({ order_status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', order_id).eq('company_id', companyId);
      return NextResponse.json({ success: true, resumed_ready_to_ship: true, packages: ids });
    }
  }

  if ((existingParcels?.length || 0) > 0 && !preview) {
    return NextResponse.json({
      already_packed: true,
      packages: existingParcels!.map(p => ({ package_id: p.package_number as string })),
      error: 'ออเดอร์นี้แพ็คและแจ้งพร้อมส่งไปแล้ว — ถ้าต้องการแก้ไขต้องทำใน Lazada Seller Center',
    }, { status: 409 });
  }

  // รูปแบบการขายของออเดอร์นี้ — Lazada บอกมาในตัวออเดอร์อยู่แล้ว ไม่ต้องเดา
  //   dropship        = ของอยู่ที่ร้าน ร้านแพ็คเอง (ปกติของร้านไทย)
  //   fbl             = ฝากของไว้คลัง Lazada — Lazada แพ็คให้ ไม่ใช่หน้าที่เรา
  //   pickup_in_store = ลูกค้ามารับที่ร้าน — เอกสารระบุว่า **แพ็คผ่าน API ไม่ได้**
  // ⚠️ dropship ของ Lazada ≠ DROP_OFF ของ Shopee/TikTok — คนละแกนกัน
  //    (อันนี้คือ "ของอยู่ที่ไหน ใครแพ็ค" ส่วนอันนั้นคือ "พัสดุออกจากร้านยังไง")
  const lazadaItems = ((order.external_data as Record<string, unknown>)?.items || []) as
    { is_fbl?: number; shipping_type?: string; warehouse_code?: string }[];
  const isFbl = lazadaItems.some(i => Number(i.is_fbl) === 1);
  const isPickupInStore = lazadaItems.some(
    i => (i.shipping_type || '').toLowerCase().includes('pickup_in_store')
  );
  if (isPickupInStore) {
    return NextResponse.json({
      error: 'ออเดอร์แบบลูกค้ามารับที่ร้าน แพ็คผ่านระบบไม่ได้ — ต้องทำใน Lazada Seller Center',
    }, { status: 400 });
  }
  const deliveryType = isFbl ? 'fbl' : 'dropship';

  const idsFromColumn = (orderItems || []).flatMap(oi => oi.external_line_item_ids || []);
  const idsFromExternal = lazadaItems
    .map(i => (i as { order_item_id?: string | number }).order_item_id)
    .filter(v => v != null)
    .map(String);
  const allItemIds = missingIds && idsFromExternal.length > 0 ? idsFromExternal : idsFromColumn;

  if (allItemIds.length === 0) {
    return NextResponse.json({ error: 'ไม่พบรหัสรายชิ้นของ Lazada ในออเดอร์นี้' }, { status: 400 });
  }

  // แบ่งกล่องตามที่ส่งมา — ไม่ส่งมา = กล่องเดียวรวมทุกชิ้น
  // ⚠️ id ที่ client ส่งมาต้องเป็นของออเดอร์นี้จริง ไม่งั้นแพ็คออเดอร์ของคนอื่นได้
  const allowed = new Set(allItemIds);
  if (parcels?.length) {
    const foreign = parcels.flatMap(p => p.order_item_ids).filter(id => !allowed.has(String(id)));
    if (foreign.length > 0) {
      return NextResponse.json({
        error: `รหัสรายชิ้นไม่ใช่ของออเดอร์นี้: ${foreign.slice(0, 3).join(', ')}`,
      }, { status: 400 });
    }
    const covered = new Set(parcels.flatMap(p => p.order_item_ids.map(String)));
    if (covered.size !== allowed.size) {
      return NextResponse.json({
        error: `ต้องจัดสินค้าให้ครบทุกชิ้น (จัดแล้ว ${covered.size} จาก ${allowed.size})`,
      }, { status: 400 });
    }
  }
  const groups = parcels?.length
    ? parcels.map(p => p.order_item_ids.map(String)).filter(ids => ids.length > 0)
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
        deliveryType,
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
      const { error: parcelErr } = await supabaseAdmin.from('order_parcels').insert({
        company_id: companyId,
        order_id,
        parcel_number: i + 1,
        package_number: packedPackages[i].package_id,
        status: 'pending',
      });
      // ร่องรอยนี้คือสิ่งเดียวที่กันการแพ็คซ้ำ — บันทึกไม่ได้ = ต้องหยุดและบอก
      // ไม่ใช่เดินต่อเงียบ ๆ แล้วปล่อยให้กดครั้งหน้าแพ็คซ้ำจนได้พัสดุเกิน
      if (parcelErr) {
        console.error('[Lazada Ship] บันทึกพัสดุไม่สำเร็จ:', parcelErr.message);
        return NextResponse.json({
          error: `แพ็คสำเร็จแล้วแต่บันทึกเลขพัสดุไม่ได้ (${parcelErr.message}) — **ห้ามกดซ้ำ** ให้ตรวจใน Lazada Seller Center ก่อน`,
          packages: packedPackages,
        }, { status: 500 });
      }
    }

    // แจ้งพร้อมส่ง — ถ้าไม่ทำขั้นนี้ขนส่งจะไม่มารับของ
    const { error: rtsError } = await readyToShipLazada(
      creds, packedPackages.map(p => p.package_id)
    );

    if (!rtsError) {
      await supabaseAdmin.from('order_parcels')
        .update({ status: 'shipped', updated_at: new Date().toISOString() })
        .eq('order_id', order_id).neq('status', 'shipped');
    }

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
