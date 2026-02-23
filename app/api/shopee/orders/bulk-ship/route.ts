// Path: app/api/shopee/orders/bulk-ship/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, isAdminRole, supabaseAdmin } from '@/lib/supabase-admin';
import {
  type ShopeeAccountRow,
  ensureValidToken,
  getShippingParameter,
  shipOrder,
} from '@/lib/shopee-api';

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

function formatTimeSlot(slot: { pickup_time_id: string; date: number; flags?: string[] }): TimeSlot {
  const date = new Date(slot.date * 1000);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const dayLabel = isToday ? 'วันนี้' : isTomorrow ? 'พรุ่งนี้' : date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
  const timeStr = date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false });

  return {
    pickup_time_id: slot.pickup_time_id,
    date: slot.date,
    display: `${dayLabel} ${timeStr}`,
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
    const { order_ids } = body;

    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0) {
      return NextResponse.json({ error: 'Missing order_ids array' }, { status: 400 });
    }

    if (order_ids.length > 50) {
      return NextResponse.json({ error: 'Maximum 50 orders per batch' }, { status: 400 });
    }

    // Fetch all orders
    const { data: orders, error: ordersError } = await supabaseAdmin
      .from('orders')
      .select('id, source, external_order_sn, external_status, shopee_account_id, order_status')
      .eq('company_id', companyId)
      .in('id', order_ids);

    if (ordersError) {
      return NextResponse.json({ error: ordersError.message }, { status: 500 });
    }

    // Create lookup map
    const orderMap = new Map((orders || []).map(o => [o.id, o]));

    // Cache credentials per shopee_account_id to avoid re-fetching
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

      if (!order.shopee_account_id || !order.external_order_sn) {
        results.push({ order_id: orderId, order_sn: '', success: false, error: 'Missing Shopee account or order SN' });
        continue;
      }

      try {
        // Get or cache credentials
        let creds = credsCache.get(order.shopee_account_id);
        if (!creds) {
          const { data: account, error: accError } = await supabaseAdmin
            .from('shopee_accounts')
            .select('*')
            .eq('id', order.shopee_account_id)
            .eq('company_id', companyId)
            .eq('is_active', true)
            .single();

          if (accError || !account) {
            results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: 'Shopee account not found' });
            continue;
          }

          creds = await ensureValidToken(account as ShopeeAccountRow);
          credsCache.set(order.shopee_account_id, creds);
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
              time_slot_list?: Array<{ pickup_time_id: string; date: number; flags?: string[] }>;
            }>;
          };
          dropoff?: { branch_list?: Array<{ branch_id: number }> };
        };

        // Handle dropoff mode
        if (params.info_needed?.dropoff && params.info_needed.dropoff.length > 0) {
          const dropoffParams: Record<string, unknown> = {};
          if (params.dropoff?.branch_list?.[0]) {
            dropoffParams.branch_id = params.dropoff.branch_list[0].branch_id;
          }
          const shipResult = await shipOrder(creds, order.external_order_sn, undefined, dropoffParams);
          if (shipResult.error) {
            results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: `รับออเดอร์ไม่สำเร็จ: ${shipResult.error}` });
          } else {
            await supabaseAdmin.from('orders').update({
              external_status: 'PROCESSED',
              order_status: 'shipping',
              updated_at: new Date().toISOString(),
            }).eq('id', orderId).eq('company_id', companyId);
            results.push({ order_id: orderId, order_sn: order.external_order_sn, success: true });
          }
          continue;
        }

        // Pickup mode
        const pickupAddress = params.pickup?.address_list?.[0];
        if (!pickupAddress) {
          results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: 'ไม่พบที่อยู่รับพัสดุ' });
          continue;
        }

        const timeSlots = pickupAddress.time_slot_list || [];

        // Express delivery: multiple time slots → let user choose
        if (timeSlots.length > 1) {
          results.push({
            order_id: orderId,
            order_sn: order.external_order_sn,
            success: false,
            needs_time_slot: true,
            time_slots: timeSlots.map(formatTimeSlot),
          });
          continue;
        }

        // Standard delivery: 0-1 time slot → auto-pick and ship
        const recommendedSlot = timeSlots.find(s => s.flags?.includes('recommended'));
        const pickupTimeSlot = recommendedSlot || timeSlots[0];

        const pickupParams = {
          address_id: pickupAddress.address_id,
          pickup_time_id: pickupTimeSlot?.pickup_time_id || '',
        };

        const shipResult = await shipOrder(creds, order.external_order_sn, pickupParams);

        if (shipResult.error) {
          results.push({ order_id: orderId, order_sn: order.external_order_sn, success: false, error: `รับออเดอร์ไม่สำเร็จ: ${shipResult.error}` });
          continue;
        }

        // Update DB
        await supabaseAdmin.from('orders').update({
          external_status: 'PROCESSED',
          order_status: 'shipping',
          updated_at: new Date().toISOString(),
        }).eq('id', orderId).eq('company_id', companyId);

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
