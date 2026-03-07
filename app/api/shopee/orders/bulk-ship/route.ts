// Path: app/api/shopee/orders/bulk-ship/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  type MassShipPackage,
  ensureValidToken,
  getShippingParameter,
  shipOrder,
  massShipOrder,
  getAllPackageNumbersBatch,
} from '@/lib/shopee/api';
import { logIntegration } from '@/lib/integration-logger';

interface TimeSlot {
  pickup_time_id: string;
  date: number;
  display: string;
  recommended: boolean;
}

interface BulkShipResult {
  order_id: string;
  order_sn: string;
  success: boolean;
  error?: string;
  needs_time_slot?: boolean;
  time_slots?: TimeSlot[];
}

function formatTimeSlot(slot: { pickup_time_id: string; date: number; time_text?: string; flags?: string[] }): TimeSlot {
  const date = new Date(slot.date * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const dayLabel = isToday ? 'วันนี้' : isTomorrow ? 'พรุ่งนี้' : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

  // Use time_text from Shopee API (e.g. "08:30 - 12:30") instead of parsing from date timestamp
  const display = slot.time_text ? `${dayLabel} ${slot.time_text}` : dayLabel;

  return {
    pickup_time_id: slot.pickup_time_id,
    date: slot.date,
    display,
    recommended: slot.flags?.includes('recommended') || false,
  };
}

/**
 * POST - Bulk accept/ship Shopee orders.
 * Uses mass_ship_order API (max 50 packages/call) for optimized batch shipping.
 * Falls back to individual ship_order for orders needing time slot selection.
 */
export async function POST(request: NextRequest) {
  try {
    const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(request);
    if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { order_ids, pickup_time_id } = body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'Missing order_ids array' }, { status: 400 });
    }

    if (order_ids.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 orders per batch' }, { status: 400 });
    }

    // Fetch all orders (include is_split)
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, source, external_order_sn, external_status, marketplace_account_id, order_status, is_split')
      .eq('company_id', companyId)
      .in('id', order_ids);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Create lookup map
    const orderMap = new Map((orders || []).map(o => [o.id, o]));

    // Cache credentials per marketplace_account_id to avoid re-fetching
    const credsCache = new Map<string, Awaited<ReturnType<typeof ensureValidToken>>>();

    // Pre-validate orders and prepare work items
    const validOrders: typeof orders = [];
    const quickResults: BulkShipResult[] = [];

    for (const orderId of order_ids) {
      const order = orderMap.get(orderId);
      if (!order) {
        quickResults.push({ order_id: orderId, order_sn: '', success: false, error: 'Order not found' });
      } else if (order.source !== 'shopee') {
        quickResults.push({ order_id: orderId, order_sn: order.external_order_sn || '', success: false, error: 'Not a Shopee order' });
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
      if (!credsCache.has(accountId)) {
        const { data: account } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('id', accountId)
          .eq('company_id', companyId)
          .eq('is_active', true)
          .single();
        if (account) {
          credsCache.set(accountId, await ensureValidToken(account as ShopeeAccountRow));
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

    for (const [accountId, accountOrders] of byAccount) {
      const creds = credsCache.get(accountId);
      if (!creds) {
        for (const order of accountOrders) {
          parallelResults.push({ order_id: order.id, order_sn: order.external_order_sn || '', success: false, error: 'Shopee account not found' });
        }
        continue;
      }

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
        pickupAddress?: { address_id: number; time_slot_list?: Array<{ pickup_time_id: string; date: number; time_text?: string; flags?: string[] }> };
        dropoffBranchId?: number;
        timeSlots: Array<{ pickup_time_id: string; date: number; time_text?: string; flags?: string[] }>;
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
        const p = sp as {
          info_needed?: { pickup?: string[]; dropoff?: string[]; non_integrated?: string[] };
          pickup?: { address_list?: Array<{ address_id: number; address_flag?: string[]; time_slot_list?: Array<{ pickup_time_id: string; date: number; time_text?: string; flags?: string[] }> }> };
          dropoff?: { branch_list?: Array<{ branch_id: number }> };
        };
        const isDropoff = !!(p.info_needed?.dropoff && p.info_needed.dropoff.length > 0);
        const pickupAddr = p.pickup?.address_list?.[0];
        channelShippingParams.set(chId, {
          isDropoff,
          pickupAddress: pickupAddr ? { address_id: pickupAddr.address_id, time_slot_list: pickupAddr.time_slot_list } : undefined,
          dropoffBranchId: p.dropoff?.branch_list?.[0]?.branch_id,
          timeSlots: pickupAddr?.time_slot_list || [],
        });
      }

      // Assign shipping params to each order
      for (const order of accountOrders) {
        const chId = orderToChannel.get(order.external_order_sn!) || 0;
        const sp = channelShippingParams.get(chId);
        if (sp) orderShippingParams.set(order.external_order_sn!, sp);
      }

      // Separate orders: ones that need time slot vs ones that can ship immediately
      const ordersNeedingTimeSlot: typeof accountOrders = [];
      const ordersReadyToShip: typeof accountOrders = [];

      for (const order of accountOrders) {
        const sn = order.external_order_sn!;
        const sp = orderShippingParams.get(sn);
        if (!sp) continue; // already handled as error above

        if (!sp.isDropoff && !pickup_time_id && sp.timeSlots.length > 1) {
          ordersNeedingTimeSlot.push(order);
        } else {
          ordersReadyToShip.push(order);
        }
      }

      // Return needs_time_slot for orders that need it (with their own time slots)
      for (const order of ordersNeedingTimeSlot) {
        const sp = orderShippingParams.get(order.external_order_sn!)!;
        parallelResults.push({
          order_id: order.id,
          order_sn: order.external_order_sn || '',
          success: false,
          needs_time_slot: true,
          time_slots: sp.timeSlots.map(formatTimeSlot),
        });
      }

      // Skip to next account if no orders are ready to ship
      if (ordersReadyToShip.length === 0) continue;

      // Step 3: Build package list for mass_ship_order (only for ready-to-ship orders)
      // Group by logistics_channel_id (mass_ship_order requires same channel per batch)
      const channelGroups = new Map<number, { pkg: MassShipPackage; order: typeof accountOrders[0]; sp: ShippingParamResult }[]>();
      const fallbackOrders: typeof accountOrders[0][] = []; // orders without package info at all

      for (const order of ordersReadyToShip) {
        const sn = order.external_order_sn!;
        const pkgInfos = packageMap.get(sn);
        const sp = orderShippingParams.get(sn)!;

        if (!pkgInfos || pkgInfos.length === 0) {
          fallbackOrders.push(order);
          continue;
        }

        const isAdvancePackage = pkgInfos[0]?.advance_package === true;

        for (const pkgInfo of pkgInfos) {
          const channelId = pkgInfo.logistics_channel_id || 0;
          // Only include package_number for split orders (advance_package=true)
          // Unsplit orders: omit package_number per Shopee API doc
          const massShipPkg: MassShipPackage = isAdvancePackage
            ? { package_number: pkgInfo.package_number }
            : {};

          if (!channelGroups.has(channelId)) channelGroups.set(channelId, []);
          channelGroups.get(channelId)!.push({ pkg: massShipPkg, order, sp });
        }
      }

      console.log(`[Shopee Bulk Ship] ${accountOrders.length} orders → ${[...channelGroups.entries()].map(([ch, items]) => `channel=${ch}:${items.length}pkg`).join(', ')}${fallbackOrders.length > 0 ? ` + ${fallbackOrders.length} fallback` : ''}`);

      // Step 4: Mass ship per channel group
      // Build pickup/dropoff PER CHANNEL from its shipping params
      const orderSuccessSet = new Set<string>(); // order IDs that succeeded
      const orderErrorMap = new Map<string, string>(); // order ID → error

      for (const [channelId, items] of channelGroups) {
        // Use shipping params from the first order in this channel group
        const sp = items[0].sp;
        let chPickupInfo: { address_id: number; pickup_time_id: string } | undefined;
        let chDropoffInfo: { branch_id?: number } | undefined;

        if (sp.isDropoff) {
          if (sp.dropoffBranchId) chDropoffInfo = { branch_id: sp.dropoffBranchId };
        } else if (sp.pickupAddress) {
          const ts = sp.timeSlots;
          const selectedTimeSlotId = pickup_time_id
            || ts.find(s => s.flags?.includes('recommended'))?.pickup_time_id
            || ts[0]?.pickup_time_id
            || '';
          chPickupInfo = { address_id: sp.pickupAddress.address_id, pickup_time_id: selectedTimeSlotId };
        }

        const packages = items.map(i => i.pkg);
        const { successList, failList, error: massError } = await massShipOrder(
          creds, packages, {
            logisticsChannelId: channelId || undefined,
            pickup: chPickupInfo,
            dropoff: chDropoffInfo,
          },
        );

        if (massError) {
          console.error(`[Shopee Bulk Ship] mass_ship_order error for channel ${channelId}:`, massError);
          // Fall back to individual ship_order
          for (const item of items) {
            const result = await individualShipOrder(creds, item.order, chPickupInfo, chDropoffInfo, item.pkg.package_number);
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

        for (const item of items) {
          const pn = item.pkg.package_number;
          if (pn && successPns.has(pn)) {
            orderSuccessSet.add(item.order.id);
          } else if (pn && failPnMap.has(pn)) {
            const reason = failPnMap.get(pn)!;
            // Already shipped is OK
            if (reason.includes('already shipped') || reason.includes('order_status_error')) {
              orderSuccessSet.add(item.order.id);
            } else {
              orderErrorMap.set(item.order.id, `รับออเดอร์ไม่สำเร็จ: ${reason}`);
            }
          } else if (!pn) {
            // Unsplit order (no package_number) — if mass_ship didn't error, assume success
            orderSuccessSet.add(item.order.id);
          }
        }

        console.log(`[Shopee Bulk Ship] Channel ${channelId}: ${successList.length} success, ${failList.length} fail`);
      }

      // Step 5: Fallback — individual ship_order for orders without package_number
      for (const order of fallbackOrders) {
        const sp = orderShippingParams.get(order.external_order_sn!);
        if (!sp || (!sp.pickupAddress && !sp.isDropoff)) {
          orderErrorMap.set(order.id, 'ไม่พบที่อยู่รับพัสดุ');
          continue;
        }
        let fbPickup: { address_id: number; pickup_time_id: string } | undefined;
        let fbDropoff: { branch_id?: number } | undefined;
        if (sp.isDropoff) {
          if (sp.dropoffBranchId) fbDropoff = { branch_id: sp.dropoffBranchId };
        } else if (sp.pickupAddress) {
          const ts = sp.timeSlots;
          const slotId = pickup_time_id || ts.find(s => s.flags?.includes('recommended'))?.pickup_time_id || ts[0]?.pickup_time_id || '';
          fbPickup = { address_id: sp.pickupAddress.address_id, pickup_time_id: slotId };
        }
        const result = await individualShipOrder(creds, order, fbPickup, fbDropoff);
        if (result.success) {
          orderSuccessSet.add(order.id);
        } else {
          orderErrorMap.set(order.id, result.error || 'Unknown error');
        }
      }

      // Step 6: Update DB for successful orders
      for (const order of accountOrders) {
        if (orderSuccessSet.has(order.id)) {
          await supabaseAdmin.from('orders').update({
            external_status: 'PROCESSED',
            order_status: 'processing',
            updated_at: new Date().toISOString(),
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
        // Note: needs_time_slot orders were already handled above
      }
    }

    const results = [...quickResults, ...parallelResults];

    const successCount = results.filter(r => r.success).length;
    const needsTimeSlotCount = results.filter(r => r.needs_time_slot).length;
    const errorCount = results.filter(r => !r.success && !r.needs_time_slot).length;

    // Log each processed order to integration_logs
    for (const r of results) {
      if (r.needs_time_slot) continue;
      const order = orderMap.get(r.order_id);
      const accountId = order?.marketplace_account_id;
      let shopName = '';
      if (accountId) {
        const cached = credsCache.get(accountId);
        shopName = (cached as any)?.shop_name || '';
      }
      logIntegration({
        company_id: companyId,
        integration: 'shopee',
        account_id: accountId || undefined,
        account_name: shopName || undefined,
        direction: 'outgoing',
        action: 'accept_order',
        method: 'POST',
        api_path: '/api/v2/logistics/mass_ship_order',
        request_body: { order_sn: r.order_sn },
        response_body: r.success ? { success: true } : { error: r.error },
        status: r.success ? 'success' : 'error',
        error_message: r.error || undefined,
        reference_type: 'order',
        reference_id: r.order_sn,
        reference_label: r.order_sn,
      });
    }

    return NextResponse.json({
      results,
      summary: { total: order_ids.length, success: successCount, needs_time_slot: needsTimeSlotCount, error: errorCount },
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
): Promise<{ success: boolean; error?: string }> {
  const sn = order.external_order_sn || '';
  try {
    const result = await shipOrder(
      creds, sn,
      pickupInfo,
      dropoffInfo ? { branch_id: dropoffInfo.branch_id } : undefined,
      packageNumber,
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
