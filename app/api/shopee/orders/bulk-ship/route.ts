// Path: app/api/shopee/orders/bulk-ship/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, can, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  type MassShipPackage,
  ensureValidToken,
  getShippingParameter,
  shipOrder,
  massShipOrder,
  getAllPackageNumbersBatch,
} from '@/lib/shopee/api';
import {
  type ShopeeRawAddress,
  type ShopeeShippingParams,
  type PickupAddressRow,
  resolvePickupChoice,
  toPickupAddressRows,
} from '@/lib/shopee/pickup';
import { logIntegration } from '@/lib/integration-logger';
import { resolveCarrierFromOrder } from '@/lib/shopee/sync';

/** คำตอบ "ให้มารับที่ไหน เมื่อไหร่" ที่ผู้ใช้เลือกมาจากจอ HandoverPickerPanel */
interface PickupSelectionInput {
  order_id: string;
  address_id?: number;
  pickup_time_id?: string;
}

interface BulkShipResult {
  order_id: string;
  order_sn: string;
  success: boolean;
  error?: string;
  /** ต้องให้คนเลือก "ที่อยู่ + รอบเวลา" ก่อน — ยังไม่ได้ยิงอะไรไปที่ Shopee */
  needs_pickup_choice?: boolean;
  pickup_addresses?: PickupAddressRow[];
  shop_name?: string;
  /** true = ไม่ได้ยิงซ้ำ แค่ซ่อมสถานะที่ค้างให้ตรงกับแพลตฟอร์ม */
  repaired?: boolean;
}

// เพดานเวลาของ route + งบเวลาที่ยอมใช้จริง (หยุดเองก่อนโดนตัด แล้วบอกว่าค้างที่ไหน)
// pattern เดียวกับ product import — ดู lib/lazada/product-sync.ts
export const maxDuration = 300;
const TIME_BUDGET_MS = 210_000;

/**
 * สถานะฝั่ง Shopee ที่แปลว่า "รับออเดอร์ไปแล้ว" — เจอแล้วห้ามยิงซ้ำ
 *
 * ⚠️ ค่าที่ซ่อมได้ต้องเป็น `processing` เท่านั้น — ใส่ SHIPPED/COMPLETED เข้ามาไม่ได้
 * เพราะสถานะจริงของมันคือ shipping/completed การเซ็ตเป็น processing = **ลากออเดอร์ถอยหลัง**
 * (คลาสเดียวกับบั๊ก TO_RETURN ที่ CLAUDE.md เตือนไว้ — ดู fix-bug.md 2026-08-28)
 * สถานะที่ล้ำไปกว่านี้ปล่อยให้ sync ปกติจัดการ ไม่ต้องมายุ่งตรงนี้
 */
const ALREADY_ACCEPTED = new Set(['PROCESSED']);

/** ล้ำไปกว่ารับออเดอร์แล้ว — ไม่ต้องยิงซ้ำ และ **ห้ามแตะสถานะ** ปล่อยให้ sync จัดการ */
const BEYOND_ACCEPTED = new Set(['SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED', 'TO_RETURN', 'CANCELLED']);

/**
 * POST - Bulk accept/ship Shopee orders.
 * Uses mass_ship_order API (max 50 packages/call) for optimized batch shipping.
 * Falls back to individual ship_order when mass_ship_order rejects the batch.
 *
 * ⚠️ `mass_ship_order` ส่ง `pickup` เป็นพารามิเตอร์ระดับบนสุด = **ใช้กับทุกพัสดุในสายนั้น**
 * ⇒ ออเดอร์ที่ที่อยู่/รอบเวลาไม่เหมือนกัน ต้องแยกเป็นคนละ call (ดู `groupKey` ด้านล่าง)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    const { isAuth, companyId } = auth;
    if (!isAuth || !companyId || !can(auth, 'marketplace.ship')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { order_ids, selections } = body as { order_ids?: unknown; selections?: unknown };

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'Missing order_ids array' }, { status: 400 });
    }

    if (order_ids.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 orders per batch' }, { status: 400 });
    }

    // คำตอบที่ผู้ใช้เลือกมา (ถ้ามี) — ต้องเป็นรูปที่ถูกจริง ๆ ก่อนเอาไปยิงต่อ
    const selectionsByOrderId = new Map<string, PickupSelectionInput>();
    if (selections !== undefined) {
      if (!Array.isArray(selections)) {
        return NextResponse.json({ error: 'selections must be an array' }, { status: 400 });
      }
      for (const raw of selections) {
        const s = raw as PickupSelectionInput;
        if (!s || typeof s.order_id !== 'string' || !s.order_id) {
          return NextResponse.json({ error: 'selections[].order_id is required' }, { status: 400 });
        }
        if (s.address_id !== undefined && !Number.isFinite(s.address_id)) {
          return NextResponse.json({ error: 'selections[].address_id must be a number' }, { status: 400 });
        }
        if (s.pickup_time_id !== undefined && typeof s.pickup_time_id !== 'string') {
          return NextResponse.json({ error: 'selections[].pickup_time_id must be a string' }, { status: 400 });
        }
        selectionsByOrderId.set(s.order_id, s);
      }
    }

    // Fetch all orders (include is_split)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, source, external_order_sn, external_status, marketplace_account_id, order_status, is_split, shipping_carrier')
      .eq('company_id', companyId)
      .in('id', order_ids);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Create lookup map
    const orderMap = new Map((orders || []).map(o => [o.id, o]));

    // Cache credentials + ตัวร้าน per marketplace_account_id
    // (ต้องเก็บตัว account ด้วย เพราะ `metadata.pickup_address_id` = ที่อยู่ที่ร้านนี้เพิ่งใช้)
    type AccountEntry = { creds: Awaited<ReturnType<typeof ensureValidToken>>; account: ShopeeAccountRow };
    const accountCache = new Map<string, AccountEntry>();

    // Pre-validate orders and prepare work items
    const validOrders: typeof orders = [];
    const quickResults: BulkShipResult[] = [];
    // ออเดอร์ที่แพลตฟอร์มรับไปแล้วแต่สถานะฝั่งเราค้าง — ซ่อมเป็นชุดเดียวท้ายสุด
    const repairIds: string[] = [];

    for (const orderId of order_ids) {
      const order = orderMap.get(orderId);
      if (!order) {
        quickResults.push({ order_id: orderId, order_sn: '', success: false, error: 'Order not found' });
      } else if (order.source !== 'shopee') {
        quickResults.push({ order_id: orderId, order_sn: order.external_order_sn || '', success: false, error: 'Not a Shopee order' });
      } else if (BEYOND_ACCEPTED.has(order.external_status || '')) {
        // Shopee ไปไกลกว่า "รับแล้ว" — ไม่ยิงซ้ำ และไม่แตะสถานะ (แตะ = ลากถอยหลัง)
        quickResults.push({ order_id: orderId, order_sn: order.external_order_sn || '', success: false, error: `Shopee อยู่สถานะ ${order.external_status} แล้ว — รอ sync อัปเดตให้เอง` });
      } else if (ALREADY_ACCEPTED.has(order.external_status || '')) {
        // Shopee รับไปแล้ว แต่ระบบเรายังค้างที่ "รอกดรับ" — เกิดได้เมื่อรอบก่อนถูกตัดกลางคัน
        // (ยิงสำเร็จแล้วแต่ยังไม่ทันเขียน DB) → **ซ่อมสถานะ ไม่ใช่ยิงซ้ำ**
        // ทำให้ "กดซ้ำ" กลายเป็นการซ่อมตัวเอง แทนที่จะเป็นการสั่งซ้ำ
        repairIds.push(order.id);
        quickResults.push({ order_id: orderId, order_sn: order.external_order_sn || '', success: true, repaired: true });
      } else if (order.external_status !== 'READY_TO_SHIP') {
        quickResults.push({ order_id: orderId, order_sn: order.external_order_sn || '', success: false, error: `สถานะปัจจุบัน: ${order.external_status}` });
      } else if (!order.marketplace_account_id || !order.external_order_sn) {
        quickResults.push({ order_id: orderId, order_sn: '', success: false, error: 'Missing Shopee account or order SN' });
      } else {
        validOrders.push(order);
      }
    }

    // Pre-fetch all credentials (deduplicated by account)
    const uniqueAccountIds = [...new Set(validOrders.map(o => o.marketplace_account_id).filter(Boolean))];
    for (const accountId of uniqueAccountIds) {
      if (!accountCache.has(accountId)) {
        const { data: account } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('id', accountId)
          .eq('company_id', companyId)
          .eq('is_active', true)
          .single();
        if (account) {
          accountCache.set(accountId, {
            creds: await ensureValidToken(account as ShopeeAccountRow),
            account: account as ShopeeAccountRow,
          });
        }
      }
    }

    // Group valid orders by marketplace_account_id
    const byAccount = new Map<string, typeof validOrders>();
    for (const order of validOrders) {
      const accId = order.marketplace_account_id!;
      if (!byAccount.has(accId)) byAccount.set(accId, []);
      byAccount.get(accId)!.push(order);
    }

    const parallelResults: BulkShipResult[] = [];

    const startedAt = Date.now();
    let ranOutOfTime = false;
    const notProcessed: string[] = [];

    for (const [accountId, accountOrders] of byAccount) {
      // หมดงบเวลา — หยุดตรงนี้แล้วบอกผู้เรียกว่าเหลือใบไหน ดีกว่าโดนตัดกลาง loop
      // ซึ่งจะทำให้มีใบที่ยิงไปแล้วแต่ไม่ได้บันทึก
      if (Date.now() - startedAt > TIME_BUDGET_MS) {
        ranOutOfTime = true;
        notProcessed.push(...accountOrders.map(o => o.id));
        continue;
      }
      const entry = accountCache.get(accountId);
      if (!entry) {
        for (const order of accountOrders) {
          parallelResults.push({ order_id: order.id, order_sn: order.external_order_sn || '', success: false, error: 'Shopee account not found' });
        }
        continue;
      }
      const { creds, account } = entry;
      const shopName = account.shop_name || '';
      // ที่อยู่ที่ร้านนี้เลือกไว้ครั้งล่าสุด — เอามาเป็นตัวตั้งต้น/ติดป้าย "ใช้ล่าสุด"
      const rememberedRaw = (account.metadata as Record<string, unknown> | null)?.pickup_address_id;
      const rememberedAddressId = Number.isFinite(Number(rememberedRaw)) && rememberedRaw != null
        ? Number(rememberedRaw)
        : null;

      const orderSns = accountOrders.map(o => o.external_order_sn!);

      // Step 1: Get package_number + logistics_channel_id for ALL orders via batch API
      const { packageMap } = await getAllPackageNumbersBatch(creds, orderSns);

      // Also load split order parcels from DB for orders already marked as split
      for (const order of accountOrders) {
        if (order.is_split && !packageMap.has(order.external_order_sn!)) {
          const { data: parcels } = await supabaseAdmin
            .from('order_parcels')
            .select('package_number')
            .eq('order_id', order.id)
            .order('parcel_number');
          const pns = (parcels || []).map(p => p.package_number).filter(Boolean);
          if (pns.length > 0) {
            packageMap.set(order.external_order_sn!, pns.map(pn => ({ package_number: pn })));
          }
        }
      }

      // Step 2: Fetch shipping parameters PER ORDER to handle mixed carriers
      // Each order may have different logistics (SPX vs Express vs dropoff) with different time slots
      type ShippingParamResult = {
        isDropoff: boolean;
        isNonIntegrated: boolean;
        nonIntegratedNeedsTracking: boolean;
        /** ที่อยู่รับพัสดุ **ทั้งหมด** ของร้าน — ห้ามหยิบตัวแรกมาใช้ตายตัว */
        addressList: ShopeeRawAddress[];
        dropoffBranchId?: number;
      };
      const orderShippingParams = new Map<string, ShippingParamResult>();

      // Deduplicate: orders with same logistics_channel_id likely have same params
      // Fetch one representative order per channel, then share the result
      const orderToChannel = new Map<string, number>(); // order_sn → channel_id
      for (const order of accountOrders) {
        const sn = order.external_order_sn!;
        const pkgInfos = packageMap.get(sn);
        const channelId = pkgInfos?.[0]?.logistics_channel_id || 0;
        orderToChannel.set(sn, channelId);
      }

      // Pick one representative order per channel
      const channelRepresentative = new Map<number, string>(); // channel_id → order_sn
      for (const [sn, chId] of orderToChannel) {
        if (!channelRepresentative.has(chId)) channelRepresentative.set(chId, sn);
      }

      // Fetch shipping params per channel (not per order — saves API calls)
      const channelShippingParams = new Map<number, ShippingParamResult | null>();
      for (const [chId, repSn] of channelRepresentative) {
        const { data: sp, error: spErr } = await getShippingParameter(creds, repSn);
        if (spErr) {
          channelShippingParams.set(chId, null);
          // Mark all orders with this channel as error
          for (const order of accountOrders) {
            if (orderToChannel.get(order.external_order_sn!) === chId) {
              parallelResults.push({ order_id: order.id, order_sn: order.external_order_sn || '', success: false, error: `ดึงข้อมูลขนส่งไม่ได้: ${spErr}` });
            }
          }
          continue;
        }
        const p = sp as ShopeeShippingParams;
        const isDropoff = !!(p.info_needed?.dropoff && p.info_needed.dropoff.length > 0);
        const isNonIntegrated = !!(p.info_needed?.non_integrated);
        const nonIntegratedNeedsTracking = !!(p.info_needed?.non_integrated?.includes('tracking_no'));
        channelShippingParams.set(chId, {
          isDropoff,
          isNonIntegrated,
          nonIntegratedNeedsTracking,
          addressList: p.pickup?.address_list || [],
          dropoffBranchId: p.dropoff?.branch_list?.[0]?.branch_id,
        });
      }

      // Assign shipping params to each order
      for (const order of accountOrders) {
        const chId = orderToChannel.get(order.external_order_sn!) || 0;
        const sp = channelShippingParams.get(chId);
        if (sp) orderShippingParams.set(order.external_order_sn!, sp);
      }

      // ตัดสินทีละใบว่า "ให้มารับที่ไหน เมื่อไหร่" ตอบได้แล้วหรือยัง
      const ordersReadyToShip: typeof accountOrders = [];
      // order.id → pickup ที่จะยิงจริง (เฉพาะช่องทางแบบให้มารับ)
      const pickupByOrder = new Map<string, { address_id: number; pickup_time_id: string }>();
      // order.id → ที่อยู่ที่ "ผู้ใช้เลือกมาเอง" (ใช้จำไว้ให้ครั้งหน้า — ค่าที่ระบบเดาให้ไม่นับ)
      const explicitAddressByOrder = new Map<string, number>();

      for (const order of accountOrders) {
        const sn = order.external_order_sn!;
        const sp = orderShippingParams.get(sn);
        if (!sp) continue; // already handled as error above

        if (sp.isDropoff || sp.isNonIntegrated) {
          ordersReadyToShip.push(order);
          continue;
        }

        const selection = selectionsByOrderId.get(order.id) || null;
        const choice = resolvePickupChoice(sp.addressList, { selection, rememberedAddressId });

        if (choice.kind === 'needs_choice') {
          parallelResults.push({
            order_id: order.id,
            order_sn: sn,
            success: false,
            needs_pickup_choice: true,
            pickup_addresses: toPickupAddressRows(sp.addressList, rememberedAddressId),
            shop_name: shopName,
          });
        } else if (choice.kind === 'invalid') {
          parallelResults.push({ order_id: order.id, order_sn: sn, success: false, error: choice.error });
        } else {
          pickupByOrder.set(order.id, { address_id: choice.address_id, pickup_time_id: choice.pickup_time_id });
          if (typeof selection?.address_id === 'number') {
            explicitAddressByOrder.set(order.id, selection.address_id);
          }
          ordersReadyToShip.push(order);
        }
      }

      // Skip to next account if no orders are ready to ship
      if (ordersReadyToShip.length === 0) continue;

      // Step 3: Build package list for mass_ship_order (only for ready-to-ship orders)
      // ⚠️ จัดกลุ่มด้วย channel **บวกที่อยู่+รอบเวลา** — `pickup` ของ mass_ship_order
      // เป็นค่าเดียวใช้กับทุกพัสดุใน call นั้น ปนกันเมื่อไหร่ = รถไปผิดที่ทั้งกอง
      type ChannelGroup = {
        channelId: number;
        sp: ShippingParamResult;
        pickup?: { address_id: number; pickup_time_id: string };
        items: { pkg: MassShipPackage; order: typeof accountOrders[0] }[];
      };
      const channelGroups = new Map<string, ChannelGroup>();
      const fallbackOrders: typeof accountOrders[0][] = []; // orders without package info at all

      for (const order of ordersReadyToShip) {
        const sn = order.external_order_sn!;
        const pkgInfos = packageMap.get(sn);
        const sp = orderShippingParams.get(sn)!;
        const pickup = pickupByOrder.get(order.id);

        if (!pkgInfos || pkgInfos.length === 0) {
          fallbackOrders.push(order);
          continue;
        }

        for (const pkgInfo of pkgInfos) {
          const channelId = pkgInfo.logistics_channel_id || 0;
          const groupKey = pickup
            ? `${channelId}|${pickup.address_id}|${pickup.pickup_time_id}`
            : `${channelId}`;
          // Always include package_number — Shopee returns it in success_list/fail_list
          // and we need it to match results back to orders.
          const massShipPkg: MassShipPackage = { package_number: pkgInfo.package_number };

          let group = channelGroups.get(groupKey);
          if (!group) {
            group = { channelId, sp, pickup, items: [] };
            channelGroups.set(groupKey, group);
          }
          group.items.push({ pkg: massShipPkg, order });
        }
      }

      console.log(`[Shopee Bulk Ship] ${accountOrders.length} orders → ${[...channelGroups.entries()].map(([key, g]) => `${key}:${g.items.length}pkg`).join(', ')}${fallbackOrders.length > 0 ? ` + ${fallbackOrders.length} fallback` : ''}`);

      // Step 4: Mass ship per group (channel + pickup ที่เหมือนกันทั้งกอง)
      const orderSuccessSet = new Set<string>(); // order IDs that succeeded
      const orderErrorMap = new Map<string, string>(); // order ID → error

      for (const [groupKey, group] of channelGroups) {
        const { sp, channelId, items } = group;
        let chPickupInfo: { address_id: number; pickup_time_id: string } | undefined;
        let chDropoffInfo: { branch_id?: number } | undefined;

        let chNonIntegrated: Record<string, unknown> | undefined;
        if (sp.isNonIntegrated) {
          // non_integrated: send empty object (or with tracking_number if needed)
          chNonIntegrated = {};
        } else if (sp.isDropoff) {
          if (sp.dropoffBranchId) chDropoffInfo = { branch_id: sp.dropoffBranchId };
        } else if (group.pickup) {
          chPickupInfo = group.pickup;
        }

        const packages = items.map(i => i.pkg);
        const { successList, failList, error: massError } = await massShipOrder(
          creds, packages, {
            logisticsChannelId: channelId || undefined,
            pickup: chPickupInfo,
            dropoff: chDropoffInfo,
            nonIntegrated: chNonIntegrated,
          },
        );

        if (massError) {
          console.error(`[Shopee Bulk Ship] mass_ship_order error for group ${groupKey}:`, massError);
          // Fall back to individual ship_order
          for (const item of items) {
            const result = await individualShipOrder(creds, item.order, chPickupInfo, chDropoffInfo, item.pkg.package_number, chNonIntegrated);
            if (result.success) {
              orderSuccessSet.add(item.order.id);
            } else {
              orderErrorMap.set(item.order.id, result.error || 'Unknown error');
            }
          }
          continue;
        }

        // Map results back to orders
        const successPns = new Set(successList.map(s => s.package_number));
        const failPnMap = new Map(failList.map(f => [f.package_number, f.fail_reason]));

        // Log full response for debugging
        console.log(`[Shopee Bulk Ship] Group ${groupKey}: sent ${items.length} pkgs, successList=${JSON.stringify(successList)}, failList=${JSON.stringify(failList)}`);

        for (const item of items) {
          const pn = item.pkg.package_number;
          if (pn && successPns.has(pn)) {
            orderSuccessSet.add(item.order.id);
          } else if (pn && failPnMap.has(pn)) {
            const reason = failPnMap.get(pn)!;
            if (reason.includes('already shipped') || reason.includes('order_status_error')) {
              orderSuccessSet.add(item.order.id);
            } else {
              orderErrorMap.set(item.order.id, `รับออเดอร์ไม่สำเร็จ: ${reason}`);
            }
          } else {
            // Package not in success_list or fail_list — treat as fail (do NOT assume success)
            orderErrorMap.set(item.order.id, `รับออเดอร์ไม่สำเร็จ: ไม่พบผลลัพธ์จาก Shopee (package: ${pn || 'N/A'})`);
          }
        }
      }

      // Step 5: Fallback — individual ship_order for orders without package_number
      for (const order of fallbackOrders) {
        const sp = orderShippingParams.get(order.external_order_sn!);
        const pickup = pickupByOrder.get(order.id);
        if (!sp || (!pickup && !sp.isDropoff && !sp.isNonIntegrated)) {
          orderErrorMap.set(order.id, 'ไม่พบที่อยู่รับพัสดุ');
          continue;
        }
        let fbPickup: { address_id: number; pickup_time_id: string } | undefined;
        let fbDropoff: { branch_id?: number } | undefined;
        let fbNonIntegrated: Record<string, unknown> | undefined;
        if (sp.isNonIntegrated) {
          fbNonIntegrated = {};
        } else if (sp.isDropoff) {
          if (sp.dropoffBranchId) fbDropoff = { branch_id: sp.dropoffBranchId };
        } else if (pickup) {
          fbPickup = pickup;
        }
        const result = await individualShipOrder(creds, order, fbPickup, fbDropoff, undefined, fbNonIntegrated);
        if (result.success) {
          orderSuccessSet.add(order.id);
        } else {
          orderErrorMap.set(order.id, result.error || 'Unknown error');
        }
      }

      // Step 6: Update DB for successful orders
      // Fetch external_data only for successful orders missing shipping_carrier
      const needsCarrier = accountOrders.filter(o => orderSuccessSet.has(o.id) && !o.shipping_carrier);
      const carrierMap = new Map<string, string>();
      if (needsCarrier.length > 0) {
        const { data: extRows } = await supabaseAdmin.from('orders')
          .select('id, shipping_carrier, external_data')
          .in('id', needsCarrier.map(o => o.id));
        for (const row of extRows || []) {
          const carrier = resolveCarrierFromOrder(row);
          if (carrier) carrierMap.set(row.id, carrier);
        }
      }

      for (const order of accountOrders) {
        if (orderSuccessSet.has(order.id)) {
          const resolvedCarrier = carrierMap.get(order.id);
          await supabaseAdmin.from('orders').update({
            external_status: 'PROCESSED',
            order_status: 'processing',
            updated_at: new Date().toISOString(),
            ...(resolvedCarrier ? { shipping_carrier: resolvedCarrier } : {}),
          }).eq('id', order.id).eq('company_id', companyId);

          if (order.is_split) {
            await supabaseAdmin.from('order_parcels').update({
              status: 'shipped',
              updated_at: new Date().toISOString(),
            }).eq('order_id', order.id);
          }

          // Auto-issue document (ABB/REC)
          const { autoIssueDocument } = await import('@/lib/invoice-service');
          autoIssueDocument(order.id, companyId).catch(() => {});

          parallelResults.push({ order_id: order.id, order_sn: order.external_order_sn || '', success: true });
        } else if (orderErrorMap.has(order.id)) {
          parallelResults.push({ order_id: order.id, order_sn: order.external_order_sn || '', success: false, error: orderErrorMap.get(order.id) });
        }
        // Note: needs_pickup_choice orders were already handled above
      }

      // Step 7: จำที่อยู่ที่ผู้ใช้ "เลือกเอง" ไว้ให้ครั้งหน้าเป็นตัวตั้งต้น
      // (ค่าที่ระบบเดาให้ไม่นับ ไม่งั้นจะกลายเป็นการยืนยันตัวเองไปเรื่อย ๆ)
      let addressToRemember: number | null = null;
      for (const order of accountOrders) {
        if (!orderSuccessSet.has(order.id)) continue;
        const chosen = explicitAddressByOrder.get(order.id);
        if (chosen != null) addressToRemember = chosen;
      }
      if (addressToRemember != null && addressToRemember !== rememberedAddressId) {
        // ⚠️ merge metadata เสมอ — ก้อนนี้เก็บโลโก้ร้าน/ธง app อยู่ด้วย เขียนทับ = หายหมด
        await supabaseAdmin.from('marketplace_accounts').update({
          metadata: { ...(account.metadata || {}), pickup_address_id: addressToRemember },
        }).eq('id', accountId).eq('company_id', companyId);
      }
    }

    const results = [...quickResults, ...parallelResults];

    const successCount = results.filter(r => r.success).length;
    const needsPickupChoiceCount = results.filter(r => r.needs_pickup_choice).length;
    const errorCount = results.filter(r => !r.success && !r.needs_pickup_choice).length;

    // Log each processed order to integration_logs with full detail
    for (const r of results) {
      if (r.needs_pickup_choice) continue;
      const order = orderMap.get(r.order_id);
      const accountId = order?.marketplace_account_id;
      const shopName = accountId ? (accountCache.get(accountId)?.account.shop_name || '') : '';
      logIntegration({
        company_id: companyId,
        integration: 'shopee',
        account_id: accountId || undefined,
        account_name: shopName || undefined,
        direction: 'outgoing',
        action: 'accept_order',
        method: 'POST',
        api_path: '/api/v2/logistics/mass_ship_order',
        request_body: { order_sn: r.order_sn, order_id: r.order_id },
        response_body: r.success
          ? { success: true, external_status: 'PROCESSED' }
          : { success: false, error: r.error },
        status: r.success ? 'success' : 'error',
        error_message: r.error || undefined,
        reference_type: 'order',
        reference_id: r.order_sn,
        reference_label: `${r.order_sn} → ${r.success ? 'PROCESSED' : 'FAILED'}`,
      });
    }

    // ซ่อมสถานะที่ค้าง — ทำเป็นชุดเดียว ไม่ยิง API แพลตฟอร์มเลยสักครั้ง
    if (repairIds.length > 0) {
      await supabaseAdmin
        .from('orders')
        .update({ order_status: 'processing', updated_at: new Date().toISOString() })
        .in('id', repairIds)
        .eq('company_id', companyId)
        .eq('order_status', 'ready_to_ship');
      console.warn(`[Shopee Bulk Ship] ซ่อมสถานะที่ค้าง ${repairIds.length} ใบ (แพลตฟอร์มรับไปแล้วแต่ระบบยังไม่อัปเดต)`);
    }

    return NextResponse.json({
      results,
      summary: {
        total: order_ids.length,
        success: successCount,
        needs_pickup_choice: needsPickupChoiceCount,
        error: errorCount,
        repaired: repairIds.length,
      },
      // หมดงบเวลาระหว่างทาง — ผู้เรียกต้องยิงต่อด้วยรายการที่เหลือ
      // ใบที่ทำไปแล้วจะถูกข้ามเองรอบหน้า (external_status เปลี่ยนเป็น PROCESSED แล้ว)
      timed_out: ranOutOfTime || undefined,
      remaining_order_ids: notProcessed.length > 0 ? notProcessed : undefined,
    });
  } catch (error) {
    console.error('[Shopee Bulk Ship] Error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to bulk ship orders',
    }, { status: 500 });
  }
}

/** Fallback: ship a single order using individual ship_order API */
async function individualShipOrder(
  creds: Awaited<ReturnType<typeof ensureValidToken>>,
  order: { id: string; external_order_sn: string | null; is_split?: boolean | null },
  pickupInfo?: { address_id: number; pickup_time_id: string },
  dropoffInfo?: { branch_id?: number },
  packageNumber?: string,
  nonIntegrated?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string }> {
  const sn = order.external_order_sn || '';
  try {
    const result = await shipOrder(
      creds, sn,
      pickupInfo,
      dropoffInfo ? { branch_id: dropoffInfo.branch_id } : undefined,
      packageNumber,
      nonIntegrated,
    );

    if (result.error) {
      const errText = String(result.error);
      if (errText.includes('already shipped') || errText.includes('order_status_error')) {
        return { success: true };
      }
      return { success: false, error: `รับออเดอร์ไม่สำเร็จ: ${result.error}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}
