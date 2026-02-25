// Path: app/api/shopee/orders/bulk-ship/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  ensureValidToken,
  getShippingParameter,
  shipOrder,
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
 * For standard delivery: auto-ship immediately.
 * For express delivery (multiple time slots): return needs_time_slot with available slots.
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

    const results: BulkShipResult[] = [];

    for (const orderId of order_ids) {
      const order = orderMap.get(orderId);

      if (!order) {
        results.push({ order_id: orderId, order_sn: '', success: false, error: 'Order not found' });
        continue;
      }

      if (order.source !== 'shopee') {
        results.push({ order_id: orderId, order_sn: order.external_order_sn || '', success: false, error: 'Not a Shopee order' });
        continue;
      }

      if (order.external_status !== 'READY_TO_SHIP') {
        results.push({
          order_id: orderId,
          order_sn: order.external_order_sn || '',
          success: false,
          error: `สถานะปัจจุบัน: ${order.external_status}`,
        });
        continue;
      }

      if (!order.marketplace_account_id || !order.external_order_sn) {
        results.push({ order_id: orderId, order_sn: '', success: false, error: 'Missing Shopee account or order SN' });
        continue;
      }

      try {
        // Get or cache credentials
        let creds = credsCache.get(order.marketplace_account_id);
        if (!creds) {
          const { data: account, error: accError } = await supabaseAdmin
            .from('marketplace_accounts')
            .select('*')
            .eq('id', order.marketplace_account_id)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .single();

          if (accError || !account) {
            results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: 'Shopee account not found' });
            continue;
          }

          creds = await ensureValidToken(account as ShopeeAccountRow);
          credsCache.set(order.marketplace_account_id, creds);
        }

        // Get shipping parameters
        const { data: shippingParams, error: paramError } = await getShippingParameter(creds, order.external_order_sn);

        if (paramError) {
          results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: `ดึงข้อมูลขนส่งไม่ได้: ${paramError}` });
          continue;
        }

        const params = shippingParams as {
          info_needed?: { pickup?: string[]; dropoff?: string[]; non_integrated?: string[] };
          pickup?: {
            address_list?: Array<{
              address_id: number;
              address_flag?: string[];
              time_slot_list?: Array<{ pickup_time_id: string; date: number; time_text?: string; flags?: string[] }>;
            }>;
          };
          dropoff?: { branch_list?: Array<{ branch_id: number }> };
        };

        // For split orders, get parcel package_numbers
        let packageNumbers: string[] = [];
        if (order.is_split) {
          const { data: parcels } = await supabaseAdmin
            .from('order_parcels')
            .select('id, parcel_number, package_number')
            .eq('order_id', orderId)
            .order('parcel_number');

          packageNumbers = (parcels || [])
            .map(p => p.package_number)
            .filter((pn): pn is string => !!pn);
        }

        // Helper: ship a single order/parcel
        const doShip = async (packageNumber?: string) => {
          if (params.info_needed?.dropoff && params.info_needed.dropoff.length > 0) {
            const dropoffParams: Record<string, unknown> = {};
            if (params.dropoff?.branch_list?.[0]) {
              dropoffParams.branch_id = params.dropoff.branch_list[0].branch_id;
            }
            return shipOrder(creds, order.external_order_sn, undefined, dropoffParams, packageNumber);
          }

          const pickupAddress = params.pickup?.address_list?.[0];
          if (!pickupAddress) {
            return { data: null, error: 'ไม่พบที่อยู่รับพัสดุ' };
          }

          const timeSlots = pickupAddress.time_slot_list || [];
          let selectedTimeSlotId = pickup_time_id as string | undefined;

          if (!selectedTimeSlotId) {
            if (timeSlots.length > 1) {
              return { data: null, error: '__needs_time_slot__', _timeSlots: timeSlots };
            }
            const recommendedSlot = timeSlots.find(s => s.flags?.includes('recommended'));
            const pickupTimeSlot = recommendedSlot || timeSlots[0];
            selectedTimeSlotId = pickupTimeSlot?.pickup_time_id || '';
          }

          return shipOrder(creds, order.external_order_sn, {
            address_id: pickupAddress.address_id,
            pickup_time_id: selectedTimeSlotId,
          }, undefined, packageNumber);
        };

        // Ship each parcel (or single order if not split)
        const parcelsToShip = order.is_split && packageNumbers.length > 0
          ? packageNumbers
          : [undefined]; // single ship without package_number

        let allSuccess = true;
        let shipError = '';

        for (const pkgNum of parcelsToShip) {
          const shipResult = await doShip(pkgNum) as { data: unknown; error?: string; _timeSlots?: unknown[] };

          if (shipResult.error === '__needs_time_slot__') {
            const timeSlots = (shipResult as { _timeSlots: Array<{ pickup_time_id: string; date: number; time_text?: string; flags?: string[] }> })._timeSlots;
            results.push({
              order_id: orderId,
              order_sn: order.external_order_sn,
              success: false,
              needs_time_slot: true,
              time_slots: timeSlots.map(formatTimeSlot),
            });
            allSuccess = false;
            break;
          }

          if (shipResult.error) {
            shipError = shipResult.error;
            allSuccess = false;
            break;
          }
        }

        if (!allSuccess) {
          if (shipError) {
            results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: `รับออเดอร์ไม่สำเร็จ: ${shipError}` });
          }
          continue;
        }

        // Update DB — PROCESSED = processing (ที่ต้องจัดส่ง), NOT shipping!
        await supabaseAdmin.from('orders').update({
          external_status: 'PROCESSED',
          order_status: 'processing',
          updated_at: new Date().toISOString(),
        }).eq('id', orderId).eq('company_id', companyId);

        // Update parcel statuses if split
        if (order.is_split) {
          await supabaseAdmin.from('order_parcels').update({
            status: 'shipped',
            updated_at: new Date().toISOString(),
          }).eq('order_id', orderId);
        }

        results.push({ order_id: orderId, order_sn: order.external_order_sn, success: true });
      } catch (err) {
        console.error(`[Shopee Bulk Ship] Error processing order ${orderId}:`, err);
        results.push({
          order_id: orderId,
          order_sn: order.external_order_sn,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const needsTimeSlotCount = results.filter(r => r.needs_time_slot).length;
    const errorCount = results.filter(r => !r.success && !r.needs_time_slot).length;

    // Log each processed order to integration_logs
    for (const r of results) {
      if (r.needs_time_slot) continue; // Don't log timeslot requests
      const order = orderMap.get(r.order_id);
      const accountId = order?.marketplace_account_id;
      // Look up shop name from account
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
        api_path: '/api/v2/logistics/ship_order',
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
