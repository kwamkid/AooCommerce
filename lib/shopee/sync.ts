import { supabaseAdmin } from '@/lib/supabase-admin';
import { shopeeApiRequest, ensureValidToken, ShopeeAccountRow, getItemEnrichment, ShopeeItemEnrichment, getEscrowDetail, getPackageDetail, getPackageNumberList } from '@/lib/shopee/api';
import { getCategoryName } from '@/lib/shopee/product-sync';
import { logIntegration } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';

// --- Sync Progress Types ---

export interface SyncProgressEvent {
  phase: 'collecting' | 'processing' | 'done';
  current: number;
  total: number | null;
  label: string;
}

export type SyncProgressCallback = (event: SyncProgressEvent) => void;

// --- Shopee Order Types ---

interface ShopeeOrderItem {
  item_id: number;
  item_name: string;
  item_sku: string;
  model_id: number;
  model_name: string;
  model_sku: string;
  model_quantity_purchased: number;
  model_original_price: number;
  model_discounted_price: number;
  image_info?: { image_url: string };
}

interface ShopeeRecipientAddress {
  name: string;
  phone: string;
  full_address: string;
  district: string;
  city: string;
  state: string;
  zipcode: string;
}

interface ShopeeOrder {
  order_sn: string;
  order_status: string;
  create_time: number;
  update_time: number;
  buyer_user_id: number;
  buyer_username: string;
  recipient_address: ShopeeRecipientAddress;
  total_amount: number;
  item_list: ShopeeOrderItem[];
  shipping_carrier: string;
  tracking_number: string;
  payment_method: string;
  // Optional fields from expanded response
  estimated_shipping_fee?: number;
  actual_shipping_fee?: number;
  actual_shipping_fee_confirmed?: boolean;
  note?: string;
  buyer_cancel_reason?: string;
  cancel_by?: string;
  cancel_reason?: string;
  ship_by_date?: number;
  days_to_ship?: number;
  // Split order fields
  split_up?: boolean;
  package_list?: { package_number: string; logistics_status?: string; shipping_carrier?: string; item_list?: { item_id: number; model_id: number }[] }[];
  // Tax invoice (Buyer Tax Invoice feature)
  invoice_data?: {
    number?: string;
    series_number?: string;
    type?: string;
    tax_code?: string;
    buyer_cpf_id?: string;
    // Allow additional fields from Shopee
    [key: string]: unknown;
  };
}

// --- Status Mapping ---

// Shopee status progression order (higher = later in lifecycle)
const SHOPEE_STATUS_ORDER: Record<string, number> = {
  UNPAID: 0,
  READY_TO_SHIP: 1,
  PROCESSED: 2,
  SHIPPED: 3,
  TO_CONFIRM_RECEIVE: 4,
  COMPLETED: 5,
  CANCELLED: 10,
  IN_CANCEL: 10,
};

function mapShopeeStatus(shopeeStatus: string): { order_status: string; payment_status: string } {
  switch (shopeeStatus) {
    case 'UNPAID':
      return { order_status: 'new', payment_status: 'pending' };
    case 'READY_TO_SHIP':
      return { order_status: 'ready_to_ship', payment_status: 'paid' };
    case 'PROCESSED':
      return { order_status: 'processing', payment_status: 'paid' };
    case 'SHIPPED':
    case 'TO_CONFIRM_RECEIVE':
      return { order_status: 'shipping', payment_status: 'paid' };
    case 'COMPLETED':
      return { order_status: 'completed', payment_status: 'paid' };
    case 'CANCELLED':
    case 'IN_CANCEL':
      return { order_status: 'cancelled', payment_status: 'cancelled' };
    default:
      return { order_status: 'new', payment_status: 'pending' };
  }
}

/** Check if new Shopee status is a forward progression (prevent out-of-order webhooks from reverting status) */
function isStatusProgression(currentStatus: string, newStatus: string): boolean {
  const currentOrder = SHOPEE_STATUS_ORDER[currentStatus] ?? -1;
  const newOrder = SHOPEE_STATUS_ORDER[newStatus] ?? -1;
  return newOrder > currentOrder;
}

// --- Sync Functions ---

/**
 * Sync orders by specific order_sn list (from webhook or detail fetch).
 */
export interface SyncResult {
  orders_created: number;
  orders_updated: number;
  orders_skipped: number;
  products_created: number;
  customers_created: number;
  errors: string[];
}

export async function syncOrdersByOrderSn(
  account: ShopeeAccountRow,
  orderSns: string[],
  onProgress?: SyncProgressCallback,
  /** Webhook status hint: if Shopee API returns stale status, use this instead */
  webhookStatusHint?: Record<string, string>
): Promise<SyncResult> {
  const creds = await ensureValidToken(account);
  const result: SyncResult = {
    orders_created: 0,
    orders_updated: 0,
    orders_skipped: 0,
    products_created: 0,
    customers_created: 0,
    errors: [],
  };

  let processedCount = 0;
  const totalOrders = orderSns.length;

  // Fetch order details in batches of 50
  for (let i = 0; i < orderSns.length; i += 50) {
    const batch = orderSns.slice(i, i + 50);
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
        order_sn_list: batch.join(','),
        response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,item_list,pay_time,shipping_carrier,tracking_number,total_amount,payment_method,estimated_shipping_fee,actual_shipping_fee,actual_shipping_fee_confirmed,note,buyer_cancel_reason,cancel_by,cancel_reason,ship_by_date,days_to_ship,package_list,invoice_data',
      });

      if (error) {
        result.errors.push(`Batch fetch error (shop_id=${creds.shop_id}): ${error}`);
        processedCount += batch.length;
        continue;
      }

      const orders = (data as { order_list: ShopeeOrder[] })?.order_list || [];

      // Apply webhook status hints before processing
      for (const shopeeOrder of orders) {
        const hintStatus = webhookStatusHint?.[shopeeOrder.order_sn];
        if (hintStatus) {
          const apiOrder = SHOPEE_STATUS_ORDER[shopeeOrder.order_status] ?? -1;
          const webhookOrder = SHOPEE_STATUS_ORDER[hintStatus] ?? -1;
          if (webhookOrder > apiOrder) {
            console.log(`[Shopee Sync] API returned ${shopeeOrder.order_status} but webhook says ${hintStatus} for ${shopeeOrder.order_sn} — using webhook status`);
            shopeeOrder.order_status = hintStatus;
          }
        }
      }

      // Process orders in parallel (concurrency=3) for ~3x speedup
      await parallelLimit(orders, async (shopeeOrder) => {
        try {
          const upsertResult = await upsertOrder(account, shopeeOrder);
          if (upsertResult.action === 'created') {
            result.orders_created++;
          } else if (upsertResult.action === 'updated') {
            result.orders_updated++;
          } else {
            result.orders_skipped++;
          }
          result.products_created += upsertResult.productsCreated;
          result.customers_created += upsertResult.customersCreated;
        } catch (e) {
          result.errors.push(`Order ${shopeeOrder.order_sn}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
        processedCount++;
        onProgress?.({
          phase: 'processing',
          current: processedCount,
          total: totalOrders,
          label: `กำลังประมวลผลออเดอร์ ${processedCount}/${totalOrders}`,
        });
      }, 3);
    } catch (e) {
      result.errors.push(`Batch error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      processedCount += batch.length;
    }
  }

  return result;
}

/**
 * Poll orders by time range (for periodic sync / manual sync).
 */
export async function syncOrdersByTimeRange(
  account: ShopeeAccountRow,
  timeFrom: number,
  timeTo: number,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  console.log(`[Shopee Sync] syncOrdersByTimeRange: shop_id=${account.shop_id}, timeFrom=${timeFrom} (${new Date(timeFrom * 1000).toISOString()}), timeTo=${timeTo} (${new Date(timeTo * 1000).toISOString()})`);
  const creds = await ensureValidToken(account);
  console.log(`[Shopee Sync] Token OK, shop_id=${creds.shop_id}`);
  const result: SyncResult = {
    orders_created: 0,
    orders_updated: 0,
    orders_skipped: 0,
    products_created: 0,
    customers_created: 0,
    errors: [],
  };
  const allOrderSns: string[] = [];

  // Paginate through order list
  let cursor = '';
  let hasMore = true;
  let pageNum = 0;

  while (hasMore) {
    pageNum++;
    const params: Record<string, unknown> = {
      time_range_field: 'update_time',
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 100,
    };
    if (cursor) params.cursor = cursor;

    console.log(`[Shopee Sync] Fetching order list page ${pageNum}...`);
    const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_list', params);

    if (error) {
      console.error(`[Shopee Sync] Order list error:`, error);
      result.errors.push(`Order list error: ${error}`);
      break;
    }

    console.log(`[Shopee Sync] Order list raw data:`, JSON.stringify(data).substring(0, 500));

    const response = data as {
      order_list: { order_sn: string; order_status: string }[];
      more: boolean;
      next_cursor: string;
    };

    const orderList = response.order_list || [];
    console.log(`[Shopee Sync] Page ${pageNum}: got ${orderList.length} orders, more=${response.more}`);

    for (const order of orderList) {
      allOrderSns.push(order.order_sn);
    }

    onProgress?.({
      phase: 'collecting',
      current: allOrderSns.length,
      total: null,
      label: `กำลังดึงรายการออเดอร์... (${allOrderSns.length} รายการ)`,
    });

    hasMore = response.more;
    cursor = response.next_cursor || '';
  }

  console.log(`[Shopee Sync] Total order_sns collected: ${allOrderSns.length}`, allOrderSns.slice(0, 10));

  // Fetch full details and sync
  if (allOrderSns.length > 0) {
    const syncResult = await syncOrdersByOrderSn(account, allOrderSns, onProgress);
    result.orders_created = syncResult.orders_created;
    result.orders_updated = syncResult.orders_updated;
    result.orders_skipped = syncResult.orders_skipped;
    result.products_created = syncResult.products_created;
    result.customers_created = syncResult.customers_created;
    result.errors.push(...syncResult.errors);
  }

  // Update last_sync_at
  await supabaseAdmin
    .from('marketplace_accounts')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', account.id);

  console.log(`[Shopee Sync] Done: orders_created=${result.orders_created}, orders_updated=${result.orders_updated}, products_created=${result.products_created}, customers_created=${result.customers_created}, errors=${result.errors.length}`, result.errors.slice(0, 5));
  return result;
}

/**
 * Sync incomplete orders — re-fetch status for Shopee orders that haven't reached COMPLETED/CANCELLED yet.
 * This catches orders that were created during early development or missed webhook updates.
 */
export async function syncIncompleteOrders(
  account: ShopeeAccountRow,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  const companyId = account.company_id;
  console.log(`[Shopee Sync] syncIncompleteOrders: shop_id=${account.shop_id}`);

  // Find orders that are not yet at a terminal state (COMPLETED / CANCELLED)
  const { data: incompleteOrders, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('external_order_sn')
    .eq('company_id', companyId)
    .eq('source', 'shopee')
    .eq('marketplace_account_id', account.id)
    .not('external_status', 'in', '("COMPLETED","CANCELLED","IN_CANCEL")')
    .not('external_order_sn', 'is', null)
    .order('created_at', { ascending: true });

  if (fetchError) {
    console.error(`[Shopee Sync] Failed to fetch incomplete orders:`, fetchError);
    return { orders_created: 0, orders_updated: 0, orders_skipped: 0, products_created: 0, customers_created: 0, errors: [fetchError.message] };
  }

  const orderSns = (incompleteOrders || []).map(o => o.external_order_sn!).filter(Boolean);
  console.log(`[Shopee Sync] Found ${orderSns.length} incomplete orders to re-sync`);

  if (orderSns.length === 0) {
    return { orders_created: 0, orders_updated: 0, orders_skipped: 0, products_created: 0, customers_created: 0, errors: [] };
  }

  onProgress?.({
    phase: 'collecting',
    current: orderSns.length,
    total: null,
    label: `พบ ${orderSns.length} ออเดอร์ที่ยังไม่สมบูรณ์`,
  });

  return syncOrdersByOrderSn(account, orderSns, onProgress);
}

// --- Shopee Split Order Helpers ---

/**
 * Sync order_parcels for a Shopee-side split order (existing order being updated).
 * Creates parcels from Shopee package_list if they don't exist yet.
 */
async function syncShopeeParcels(orderId: string, companyId: string, shopeeOrder: ShopeeOrder) {
  if (!shopeeOrder.package_list || shopeeOrder.package_list.length <= 1) return;

  try {
    // Check if parcels already exist
    const { count } = await supabaseAdmin
      .from('order_parcels')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', orderId);

    if ((count || 0) >= shopeeOrder.package_list.length) return; // already synced

    // Delete existing parcels if count mismatch (re-sync)
    if ((count || 0) > 0) {
      await supabaseAdmin.from('order_parcels').delete().eq('order_id', orderId);
    }

    const parcelsToInsert = shopeeOrder.package_list.map((pkg, idx) => ({
      order_id: orderId,
      parcel_number: idx + 1,
      package_number: pkg.package_number,
      shipping_carrier: pkg.shipping_carrier || shopeeOrder.shipping_carrier || null,
      status: pkg.logistics_status === 'LOGISTICS_PICKUP_DONE' || pkg.logistics_status === 'LOGISTICS_DELIVERY_DONE'
        ? 'shipped' : 'pending',
    }));
    await supabaseAdmin.from('order_parcels').insert(parcelsToInsert);
    console.log(`[Shopee Sync] Synced ${parcelsToInsert.length} parcels for split order ${shopeeOrder.order_sn}`);
  } catch (e) {
    console.error(`[Shopee Sync] Failed to sync parcels for ${shopeeOrder.order_sn}:`, e);
  }
}

/**
 * Check can_split_order via get_package_detail and update DB.
 * Only meaningful for READY_TO_SHIP orders with package_list.
 */
async function syncCanSplitOrder(
  orderId: string,
  creds: Awaited<ReturnType<typeof ensureValidToken>>,
  shopeeOrder: ShopeeOrder,
) {
  // Only check for READY_TO_SHIP orders (split only works at this stage)
  if (shopeeOrder.order_status !== 'READY_TO_SHIP') return;

  try {
    // Get package number: from shopeeOrder.package_list or fetch via API
    let packageNumber: string | undefined;

    if (shopeeOrder.package_list && shopeeOrder.package_list.length > 0) {
      packageNumber = shopeeOrder.package_list[0].package_number;
    }

    // If no package_list in order data, fetch it from Shopee API
    if (!packageNumber) {
      console.log(`[Shopee Sync] ${shopeeOrder.order_sn} has no package_list, fetching from API...`);
      const { packageNumbers, error: pkgError } = await getPackageNumberList(creds, shopeeOrder.order_sn);
      if (pkgError) {
        console.error(`[Shopee Sync] Failed to get package_list for ${shopeeOrder.order_sn}:`, pkgError);
        return;
      }
      // getPackageNumberList returns empty if <=1 package, but we still need the single package_number
      // Re-fetch with get_order_detail directly to get even a single package
      if (packageNumbers.length > 0) {
        packageNumber = packageNumbers[0];
      } else {
        // Fetch order detail with package_list to get even the single package
        const { data: detailData } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
          order_sn_list: shopeeOrder.order_sn,
          response_optional_fields: 'package_list',
        });
        const orderDetail = (detailData as { order_list?: { package_list?: { package_number: string }[] }[] })
          ?.order_list?.[0];
        packageNumber = orderDetail?.package_list?.[0]?.package_number;
      }
    }

    if (!packageNumber) {
      console.log(`[Shopee Sync] ${shopeeOrder.order_sn} no package_number found, skipping can_split_order check`);
      return;
    }

    console.log(`[Shopee Sync] Checking can_split_order for ${shopeeOrder.order_sn} (package: ${packageNumber})`);
    const { packages, error } = await getPackageDetail(creds, [packageNumber]);
    if (error) {
      console.error(`[Shopee Sync] get_package_detail error for ${shopeeOrder.order_sn}:`, error);
      return;
    }
    if (packages.length === 0) {
      console.log(`[Shopee Sync] get_package_detail returned empty for ${shopeeOrder.order_sn}`);
      return;
    }

    const canSplit = packages[0].can_split_order === true;
    const isSplitUp = packages[0].is_split_up === true;
    await supabaseAdmin
      .from('orders')
      .update({ can_split_order: canSplit, is_split: isSplitUp })
      .eq('id', orderId);

    console.log(`[Shopee Sync] ${shopeeOrder.order_sn} can_split_order=${canSplit}, is_split_up=${isSplitUp}`);
  } catch (e) {
    console.error(`[Shopee Sync] Failed to check can_split_order for ${shopeeOrder.order_sn}:`, e);
  }
}

// --- Upsert Logic ---

interface UpsertResult {
  action: 'created' | 'updated' | 'skipped';
  productsCreated: number;
  customersCreated: number;
}

/**
 * Upsert a single Shopee order.
 */
async function upsertOrder(account: ShopeeAccountRow, shopeeOrder: ShopeeOrder): Promise<UpsertResult> {
  const companyId = account.company_id;
  const { order_status, payment_status } = mapShopeeStatus(shopeeOrder.order_status);

  // Check if order already exists
  const { data: existing } = await supabaseAdmin
    .from('orders')
    .select('id, order_status, external_status, external_data, customer_id, created_at, fulfillment_status, warehouse_id')
    .eq('company_id', companyId)
    .eq('source', 'shopee')
    .eq('external_order_sn', shopeeOrder.order_sn)
    .single();

  // Fetch item enrichment from Shopee Product APIs (images + tier_variation + model images)
  const uniqueItemIds = [...new Set((shopeeOrder.item_list || []).map(i => i.item_id))];
  const creds = await ensureValidToken(account);
  const itemEnrichmentMap = await getItemEnrichment(creds, uniqueItemIds);

  if (existing) {
    let statusUpdated = false;

    // Update if Shopee status changed (only allow forward progression to prevent out-of-order webhooks)
    const statusChanged = existing.external_status !== shopeeOrder.order_status;
    const isForward = isStatusProgression(existing.external_status || '', shopeeOrder.order_status);
    if (statusChanged && isForward) {
      // Calculate shipping fee from Shopee data
      const updatedShippingFee = shopeeOrder.actual_shipping_fee_confirmed
        ? (shopeeOrder.actual_shipping_fee || 0)
        : (shopeeOrder.estimated_shipping_fee || 0);

      // Auto-sync fulfillment_status based on Shopee status
      const fulfillmentUpdate: Record<string, unknown> = {};
      if (['SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(shopeeOrder.order_status)) {
        fulfillmentUpdate.fulfillment_status = 'shipped';
        fulfillmentUpdate.shipped_at = new Date().toISOString();
      } else if (['CANCELLED', 'IN_CANCEL'].includes(shopeeOrder.order_status)) {
        fulfillmentUpdate.fulfillment_status = 'pending';
        fulfillmentUpdate.hold_reason = null;
      }

      const isSplit = shopeeOrder.split_up === true && (shopeeOrder.package_list || []).length > 1;
      await supabaseAdmin
        .from('orders')
        .update({
          order_status,
          payment_status,
          external_status: shopeeOrder.order_status,
          external_data: shopeeOrder as unknown as Record<string, unknown>,
          shipping_fee: updatedShippingFee,
          shipping_carrier: shopeeOrder.shipping_carrier || null,
          tracking_number: shopeeOrder.tracking_number || null,
          is_split: isSplit,
          updated_at: new Date().toISOString(),
          ...(shopeeOrder.ship_by_date ? { delivery_date: new Date(shopeeOrder.ship_by_date * 1000).toISOString().split('T')[0] } : {}),
          ...fulfillmentUpdate,
        })
        .eq('id', existing.id);

      // Create/update order_parcels for Shopee-side split orders
      if (isSplit) {
        await syncShopeeParcels(existing.id, companyId, shopeeOrder);
      }

      // Check can_split_order via get_package_detail
      await syncCanSplitOrder(existing.id, creds, shopeeOrder).catch(() => {});

      // อัปเดตค่าส่งใน order_shipments ด้วย (ใส่ที่ shipment แรก)
      if (updatedShippingFee > 0) {
        const { data: shipments } = await supabaseAdmin
          .from('order_shipments')
          .select('id')
          .eq('order_id', existing.id)
          .order('created_at', { ascending: true })
          .limit(1);
        if (shipments?.[0]) {
          await supabaseAdmin
            .from('order_shipments')
            .update({ shipping_fee: updatedShippingFee })
            .eq('id', shipments[0].id);
        }
      }
      statusUpdated = true;

      // Auto-issue document (ABB/REC) for orders that progressed past READY_TO_SHIP
      if (['PROCESSED', 'SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(shopeeOrder.order_status)) {
        const { autoIssueDocument } = await import('@/lib/invoice-service');
        autoIssueDocument(existing.id, companyId).catch(() => {});
      }

      // Stock return for CANCELLED/IN_CANCEL orders
      if (['CANCELLED', 'IN_CANCEL'].includes(shopeeOrder.order_status) && existing.warehouse_id) {
        await returnStockForCancelledOrder(
          companyId,
          existing.id,
          existing.warehouse_id,
          existing.order_status,
          shopeeOrder.order_sn,
        );
      }

      // Fetch escrow detail for COMPLETED orders (fire-and-forget)
      if (shopeeOrder.order_status === 'COMPLETED') {
        fetchAndSaveEscrowDetail(account, shopeeOrder.order_sn, existing.id).catch(err => {
          console.error(`[Shopee Sync] Escrow fetch error for ${shopeeOrder.order_sn}:`, err);
        });
      }
    }

    // Repair: if external_status matches but order_status/payment_status/fulfillment_status is wrong
    if (!statusUpdated) {
      const expectedMapping = mapShopeeStatus(shopeeOrder.order_status);
      const shouldBeShipped = ['SHIPPED', 'TO_CONFIRM_RECEIVE', 'COMPLETED'].includes(shopeeOrder.order_status);
      const needsOrderFix = existing.order_status !== expectedMapping.order_status;
      const needsFulfillmentFix = shouldBeShipped && (existing as Record<string, unknown>).fulfillment_status !== 'shipped';

      if (needsOrderFix || needsFulfillmentFix) {
        const repairUpdate: Record<string, unknown> = {
          order_status: expectedMapping.order_status,
          payment_status: expectedMapping.payment_status,
          updated_at: new Date().toISOString(),
        };
        if (shouldBeShipped) {
          repairUpdate.fulfillment_status = 'shipped';
          repairUpdate.shipped_at = new Date().toISOString();
        }
        await supabaseAdmin
          .from('orders')
          .update(repairUpdate)
          .eq('id', existing.id);
        console.log(`[Shopee Sync] Repaired order ${shopeeOrder.order_sn}: order_status=${existing.order_status}→${expectedMapping.order_status}, fulfillment fix=${needsFulfillmentFix}`);
        statusUpdated = true;

        // Also check can_split_order on repair
        await syncCanSplitOrder(existing.id, creds, shopeeOrder).catch(() => {});
      }
    }

    // Always re-check can_split_order for READY_TO_SHIP orders that haven't been checked yet
    // (covers manual re-sync, orders created before split feature, and retried webhook syncs)
    // Awaited (not fire-and-forget) to ensure it completes before function returns
    if (!statusUpdated && shopeeOrder.order_status === 'READY_TO_SHIP') {
      await syncCanSplitOrder(existing.id, creds, shopeeOrder).catch(() => {});
    }

    // Fetch escrow for COMPLETED orders that don't have escrow_detail yet
    // (covers orders that were already COMPLETED before this feature was added)
    if (!statusUpdated && shopeeOrder.order_status === 'COMPLETED') {
      const existingExternalData = (existing.external_data || {}) as Record<string, unknown>;
      if (!existingExternalData.escrow_detail) {
        fetchAndSaveEscrowDetail(account, shopeeOrder.order_sn, existing.id).catch(err => {
          console.error(`[Shopee Sync] Escrow backfill error for ${shopeeOrder.order_sn}:`, err);
        });
      }
    }

    // Repair created_at to match Shopee's create_time (instead of sync time)
    const shopeeCreatedAt = new Date(shopeeOrder.create_time * 1000).toISOString();
    if (existing.created_at && Math.abs(new Date(existing.created_at).getTime() - new Date(shopeeCreatedAt).getTime()) > 60000) {
      await supabaseAdmin
        .from('orders')
        .update({ created_at: shopeeCreatedAt })
        .eq('id', existing.id);
    }

    // Repair customer name if it's still masked (e.g. "****")
    if (existing.customer_id && shopeeOrder.buyer_username) {
      const { data: customer } = await supabaseAdmin
        .from('customers')
        .select('id, name')
        .eq('id', existing.customer_id)
        .single();
      if (customer && isMasked(customer.name)) {
        const betterName = unmasked(shopeeOrder.recipient_address?.name) || shopeeOrder.buyer_username;
        if (!isMasked(betterName)) {
          await supabaseAdmin
            .from('customers')
            .update({ name: betterName, updated_at: new Date().toISOString() })
            .eq('id', customer.id);
          console.log(`[Shopee Sync] Repaired masked customer name "${customer.name}" → "${betterName}" for order ${shopeeOrder.order_sn}`);
        }
      }
    }

    // Re-create any soft-deleted products referenced by this order's items
    const productsRecreated = await repairOrderProducts(companyId, existing.id, shopeeOrder, itemEnrichmentMap);

    // Repair: if order has no items but Shopee now provides item_list, create them
    const { count: existingItemCount } = await supabaseAdmin
      .from('order_items')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', existing.id);

    let itemsCreated = 0;
    if ((existingItemCount || 0) === 0 && (shopeeOrder.item_list || []).length > 0) {
      console.log(`[Shopee Sync] Order ${shopeeOrder.order_sn} has 0 items but Shopee has ${shopeeOrder.item_list.length} — creating items`);

      // Get default warehouse
      const { data: defaultWarehouse } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', companyId)
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1)
        .single();
      const warehouseId = defaultWarehouse?.id || null;

      let subtotal = 0;
      for (const item of shopeeOrder.item_list) {
        const qty = item.model_quantity_purchased || 1;
        const price = item.model_discounted_price || item.model_original_price || 0;
        const total = qty * price;
        subtotal += total;

        const sku = item.model_sku || item.item_sku || '';
        const itemName = item.model_name
          ? `${item.item_name} - ${item.model_name}`
          : item.item_name;

        const enrichment = itemEnrichmentMap.get(item.item_id);
        const variationImageUrl = enrichment?.modelImageMap.get(item.model_sku) || item.image_info?.image_url || '';
        const matched = await findOrCreateVariationBySku(companyId, sku, itemName, price, {
          shopeeItemId: item.item_id,
          shopeeItemName: item.item_name,
          shopeeModelId: item.model_id,
          shopeeModelName: item.model_name,
          shopeeModelSku: item.model_sku,
          shopeeItemSku: item.item_sku,
          shopeeImageUrl: variationImageUrl,
          tierVariationNames: enrichment?.tierVariations || [],
          parentImageUrl: enrichment?.images?.[0] || '',
          parentImages: enrichment?.images || [],
          allModels: enrichment?.allModels || [],
          enrichment: enrichment || undefined,
          accountId: account.id,
          accountName: account.shop_name ?? undefined,
        });

        const { error: itemInsertErr } = await supabaseAdmin
          .from('order_items')
          .insert({
            company_id: companyId,
            order_id: existing.id,
            variation_id: matched.variation_id,
            product_id: matched.product_id,
            product_code: matched.product_code,
            product_name: itemName,
            quantity: qty,
            unit_price: price,
            discount_percent: 0,
            discount_amount: 0,
            discount_type: 'percent',
            subtotal: total,
            total,
          });

        if (itemInsertErr) {
          console.error(`[Shopee Sync] Failed to insert order item for ${shopeeOrder.order_sn}:`, itemInsertErr.message, itemInsertErr.details);
          continue;
        }

        // Reserve stock
        if (matched.variation_id && warehouseId) {
          await reserveStock(companyId, warehouseId, matched.variation_id, qty, existing.id, shopeeOrder.order_sn);
        }

        itemsCreated++;
      }

      // Update order totals if they were zero
      const totalAmount = shopeeOrder.total_amount || subtotal;
      await supabaseAdmin
        .from('orders')
        .update({
          subtotal: totalAmount,
          total_amount: totalAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      // Create shipments if shipping address exists
      const shippingAddressId = await getExistingShippingAddressId(companyId, existing.customer_id);
      if (shippingAddressId) {
        const shippingFee = shopeeOrder.actual_shipping_fee_confirmed
          ? (shopeeOrder.actual_shipping_fee || 0)
          : (shopeeOrder.estimated_shipping_fee || 0);
        const { data: orderItemRows } = await supabaseAdmin
          .from('order_items')
          .select('id, quantity')
          .eq('order_id', existing.id);
        if (orderItemRows) {
          const shipmentsToInsert = orderItemRows.map((oi, idx) => ({
            company_id: companyId,
            order_item_id: oi.id,
            shipping_address_id: shippingAddressId,
            quantity: oi.quantity,
            shipping_fee: idx === 0 ? shippingFee : 0,
            delivery_status: 'pending',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
          await supabaseAdmin.from('order_shipments').insert(shipmentsToInsert);
        }
      }

      console.log(`[Shopee Sync] Created ${itemsCreated} items for existing order ${shopeeOrder.order_sn}`);
    }

    // Backfill missing sibling variations for ALL variation products in this order
    let siblingsBackfilled = 0;
    for (const item of shopeeOrder.item_list || []) {
      if (item.model_id > 0 && item.model_name) {
        const enrichment = itemEnrichmentMap.get(item.item_id);
        const itemSku = item.model_sku || item.item_sku || '';
        if (enrichment?.allModels && enrichment.allModels.length > 0) {
          // Find the existing variation to get its product_id — check marketplace_product_links first
          let parentProductId: string | null = null;

          // Try marketplace_product_links first (most accurate)
          const { data: mplLink } = await supabaseAdmin
            .from('marketplace_product_links')
            .select('product_id')
            .eq('account_id', account.id)
            .eq('external_item_id', String(item.item_id))
            .eq('external_model_id', String(item.model_id || 0))
            .limit(1)
            .maybeSingle();
          if (mplLink?.product_id) parentProductId = mplLink.product_id;

          // Fallback to SKU match
          if (!parentProductId && itemSku) {
            const { data: existingVar } = await supabaseAdmin
              .from('product_variations')
              .select('id, product_id')
              .eq('company_id', companyId)
              .eq('sku', itemSku)
              .limit(1)
              .maybeSingle();
            if (existingVar) parentProductId = existingVar.product_id;
          }

          if (parentProductId) {
              await backfillSiblingVariations(companyId, parentProductId, {
                shopeeItemId: item.item_id,
                shopeeItemName: item.item_name,
                shopeeModelId: item.model_id,
                shopeeModelName: item.model_name,
                shopeeModelSku: item.model_sku,
                shopeeItemSku: item.item_sku,
                shopeeImageUrl: '',
                tierVariationNames: enrichment.tierVariations || [],
                parentImageUrl: '',
                parentImages: [],
                allModels: enrichment.allModels,
                enrichment,
                accountId: account.id,
                accountName: account.shop_name ?? undefined,
              });
              siblingsBackfilled++;
          }
        }
      }
    }

    if (statusUpdated || productsRecreated > 0 || itemsCreated > 0 || siblingsBackfilled > 0) {
      return { action: 'updated', productsCreated: productsRecreated + itemsCreated, customersCreated: 0 };
    }
    return { action: 'skipped', productsCreated: 0, customersCreated: 0 };
  }

  // --- Create new order ---

  // Find or create customer (track if newly created for rollback)
  const { customerId, isNewCustomer, shippingAddressId } = await findOrCreateShopeeCustomer(companyId, shopeeOrder);

  // Use Shopee order_sn directly as order number (no prefix — easier to copy/search in Shopee)
  const orderNumber = shopeeOrder.order_sn;

  // Match items with products/variations by SKU
  // Track newly created resource IDs for rollback if order creation fails
  let subtotal = 0;
  const newlyCreatedProductIds: string[] = [];
  const newlyCreatedVariationIds: string[] = [];
  const resolvedItems: {
    variation_id: string | null;
    product_id: string | null;
    product_code: string;
    product_name: string;
    qty: number;
    price: number;
    total: number;
    shopeeItemId: number;
    shopeeModelId: number;
  }[] = [];

  for (const item of shopeeOrder.item_list || []) {
    const qty = item.model_quantity_purchased || 1;
    const price = item.model_discounted_price || item.model_original_price || 0;
    const total = qty * price;
    subtotal += total;

    const sku = item.model_sku || item.item_sku || '';
    const itemName = item.model_name
      ? `${item.item_name} - ${item.model_name}`
      : item.item_name;

    // Try to match by SKU, pass Shopee item info for variation detection
    const enrichment = itemEnrichmentMap.get(item.item_id);
    const variationImageUrl = enrichment?.modelImageMap.get(item.model_sku) || item.image_info?.image_url || '';
    let matched;
    try {
      matched = await findOrCreateVariationBySku(companyId, sku, itemName, price, {
        shopeeItemId: item.item_id,
        shopeeItemName: item.item_name,
        shopeeModelId: item.model_id,
        shopeeModelName: item.model_name,
        shopeeModelSku: item.model_sku,
        shopeeItemSku: item.item_sku,
        shopeeImageUrl: variationImageUrl,
        tierVariationNames: enrichment?.tierVariations || [],
        parentImageUrl: enrichment?.images?.[0] || '',
        parentImages: enrichment?.images || [],
        allModels: enrichment?.allModels || [],
        enrichment: enrichment || undefined,
        accountId: account.id,
        accountName: account.shop_name ?? undefined,
      });
    } catch (productErr) {
      const errMsg = productErr instanceof Error ? productErr.message : 'Unknown product error';
      logIntegration({
        company_id: companyId,
        integration: 'shopee',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'incoming',
        action: 'product_create_error',
        method: 'POST',
        api_path: '/api/shopee/webhook',
        status: 'error',
        error_message: `สร้างสินค้าไม่สำเร็จ: ${itemName} (SKU: ${sku}) — ${errMsg}`,
        reference_type: 'order',
        reference_id: shopeeOrder.order_sn,
        reference_label: `Product error: ${itemName}`,
      });
      throw productErr; // re-throw to fail the order creation
    }

    // Track newly created resources for potential rollback
    if (matched.isNewProduct) newlyCreatedProductIds.push(matched.product_id);
    if (matched.isNewVariation) newlyCreatedVariationIds.push(matched.variation_id);

    // Upsert marketplace link so product is linked to Shopee item/model
    // Include enrichment data from get_item_base_info (category, weight, name, status, image)
    const categoryId = enrichment?.category_id;
    let categoryName = '';
    if (categoryId) {
      try { categoryName = await getCategoryName(account.id, categoryId); } catch { /* ignore */ }
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const upsertData: Record<string, any> = {
        company_id: companyId,
        platform: 'shopee',
        account_id: account.id,
        account_name: account.shop_name || '',
        product_id: matched.product_id,
        variation_id: matched.variation_id || null,
        external_item_id: String(item.item_id),
        external_model_id: String(item.model_id || 0),
        external_sku: item.model_sku || item.item_sku || '',
        platform_price: price || null,
        platform_product_name: enrichment?.item_name || null,
        platform_primary_image: enrichment?.images?.[0] || null,
        external_item_status: enrichment?.item_status || null,
        shopee_category_id: categoryId ? String(categoryId) : null,
        shopee_category_name: categoryName || null,
        weight: enrichment?.weight || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Store attributes and brand from get_item_base_info directly (includes filled values)
      if (enrichment?.attribute_list && enrichment.attribute_list.length > 0) {
        upsertData.shopee_attributes = enrichment.attribute_list;
      }
      if (enrichment?.brand) {
        upsertData.shopee_brand_id = enrichment.brand.brand_id;
        upsertData.shopee_brand_name = enrichment.brand.display_brand_name || enrichment.brand.original_brand_name;
      }

      // Write structured platform_data alongside legacy shopee_* columns
      upsertData.platform_data = {
        category_id: upsertData.shopee_category_id ? Number(upsertData.shopee_category_id) : null,
        category_name: upsertData.shopee_category_name || null,
        attributes: upsertData.shopee_attributes || null,
        brand_id: upsertData.shopee_brand_id || null,
        brand_name: upsertData.shopee_brand_name || null,
      };

      await supabaseAdmin.from('marketplace_product_links').upsert(
        upsertData,
        { onConflict: 'account_id,external_item_id,external_model_id' }
      );
    } catch (linkErr) {
      console.error(`[Shopee Sync] Failed to upsert marketplace link for item ${item.item_id}:`, linkErr);
    }

    resolvedItems.push({
      variation_id: matched.variation_id,
      product_id: matched.product_id,
      product_code: matched.product_code,
      product_name: itemName,
      qty,
      price,
      total,
      shopeeItemId: item.item_id,
      shopeeModelId: item.model_id,
    });
  }

  const totalAmount = shopeeOrder.total_amount || subtotal;

  // Determine shipping fee from Shopee data
  const shippingFee = shopeeOrder.actual_shipping_fee_confirmed
    ? (shopeeOrder.actual_shipping_fee || 0)
    : (shopeeOrder.estimated_shipping_fee || 0);

  // Build notes: combine our label + buyer's note from Shopee
  const orderNotes = shopeeOrder.note
    ? `Shopee: ${shopeeOrder.order_sn}\nข้อความจากผู้ซื้อ: ${shopeeOrder.note}`
    : `Shopee: ${shopeeOrder.order_sn}`;

  // Get default warehouse for stock reservation
  const { data: defaultWarehouse } = await supabaseAdmin
    .from('warehouses')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_default', true)
    .eq('is_active', true)
    .limit(1)
    .single();

  const warehouseId = defaultWarehouse?.id || null;

  // Create order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      company_id: companyId,
      order_number: orderNumber,
      customer_id: customerId,
      order_date: new Date(shopeeOrder.create_time * 1000).toISOString().split('T')[0],
      subtotal: totalAmount,
      vat_amount: 0,
      discount_amount: Math.max(0, subtotal - totalAmount),
      shipping_fee: shippingFee,
      total_amount: totalAmount,
      payment_method: 'shopee',
      payment_status,
      order_status,
      source: 'shopee',
      external_order_sn: shopeeOrder.order_sn,
      marketplace_account_id: account.id,
      external_status: shopeeOrder.order_status,
      external_data: shopeeOrder as unknown as Record<string, unknown>,
      warehouse_id: warehouseId,
      notes: orderNotes,
      delivery_date: shopeeOrder.ship_by_date
        ? new Date(shopeeOrder.ship_by_date * 1000).toISOString().split('T')[0]
        : null,
      shipping_carrier: shopeeOrder.shipping_carrier || null,
      tracking_number: shopeeOrder.tracking_number || null,
      is_split: shopeeOrder.split_up === true && (shopeeOrder.package_list || []).length > 1,
      flow_type: 'a_cash', // Marketplace orders always use cash flow regardless of customer type
      created_at: new Date(shopeeOrder.create_time * 1000).toISOString(),
      // Tax invoice from Shopee Buyer Tax Invoice feature (customer request fields)
      ...(shopeeOrder.invoice_data?.tax_code ? {
        tax_invoice_requested: true,
        tax_invoice_tax_id: shopeeOrder.invoice_data.tax_code,
        tax_invoice_name: shopeeOrder.recipient_address?.name || shopeeOrder.buyer_username || null,
      } : {}),
    })
    .select()
    .single();

  if (orderError) {
    // Rollback: delete newly created variations and products
    if (newlyCreatedVariationIds.length > 0) {
      await supabaseAdmin.from('product_variations').delete().in('id', newlyCreatedVariationIds);
    }
    // Deduplicate product IDs and delete (only products with no remaining variations)
    const uniqueProductIds = [...new Set(newlyCreatedProductIds)];
    for (const pid of uniqueProductIds) {
      const { count } = await supabaseAdmin
        .from('product_variations')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', pid);
      if (count === 0) {
        await supabaseAdmin.from('products').delete().eq('id', pid);
      }
    }
    // Rollback: delete newly created customer (only if no other orders reference them)
    if (isNewCustomer) {
      const { count: orderCount } = await supabaseAdmin
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', customerId);
      if (orderCount === 0) {
        await supabaseAdmin.from('shipping_addresses').delete().eq('customer_id', customerId);
        await supabaseAdmin.from('customers').delete().eq('id', customerId);
      }
    }
    console.log(`[Shopee Sync] Rolled back ${newlyCreatedVariationIds.length} variations, ${uniqueProductIds.length} products${isNewCustomer ? ', 1 customer' : ''} for order ${shopeeOrder.order_sn}`);
    logIntegration({
      company_id: companyId,
      integration: 'shopee',
      account_id: account.id,
      account_name: account.shop_name,
      direction: 'incoming',
      action: 'order_create_error',
      method: 'POST',
      api_path: '/api/shopee/webhook',
      status: 'error',
      error_message: `สร้างออเดอร์ไม่สำเร็จ: ${shopeeOrder.order_sn} — ${orderError.message}`,
      reference_type: 'order',
      reference_id: shopeeOrder.order_sn,
      reference_label: `Order create failed: ${shopeeOrder.order_sn}`,
    });
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  // Create order items in bulk (single insert)
  const orderItemsToInsert = resolvedItems.map(item => ({
    company_id: companyId,
    order_id: order.id,
    variation_id: item.variation_id,
    product_id: item.product_id,
    product_code: item.product_code,
    product_name: item.product_name,
    quantity: item.qty,
    unit_price: item.price,
    discount_percent: 0,
    discount_amount: 0,
    discount_type: 'percent',
    subtotal: item.total,
    total: item.total,
  }));
  await supabaseAdmin.from('order_items').insert(orderItemsToInsert);

  // Reserve stock in parallel
  const stockItems = resolvedItems.filter(item => item.variation_id && warehouseId);
  if (stockItems.length > 0) {
    await Promise.all(stockItems.map(item =>
      reserveStock(companyId, warehouseId!, item.variation_id!, item.qty, order.id, order.order_number)
    ));
  }

  // Create order shipments for each item (same pattern as manual order creation)
  if (shippingAddressId) {
    try {
      const { data: orderItemRows } = await supabaseAdmin
        .from('order_items')
        .select('id, quantity')
        .eq('order_id', order.id);

      if (orderItemRows) {
        const shipmentsToInsert = orderItemRows.map((oi, idx) => ({
          company_id: companyId,
          order_item_id: oi.id,
          shipping_address_id: shippingAddressId,
          quantity: oi.quantity,
          shipping_fee: idx === 0 ? shippingFee : 0, // ค่าส่งใส่ที่ shipment แรก
          delivery_status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));

        await supabaseAdmin.from('order_shipments').insert(shipmentsToInsert);
        console.log(`[Shopee Sync] Created ${shipmentsToInsert.length} shipments for order ${order.order_number}`);
      }
    } catch (e) {
      console.error(`[Shopee Sync] Failed to create order shipments:`, e);
    }
  }

  // Create order_parcels for split orders from Shopee
  if (shopeeOrder.split_up && (shopeeOrder.package_list || []).length > 1) {
    try {
      const parcelsToInsert = shopeeOrder.package_list!.map((pkg, idx) => ({
        order_id: order.id,
        parcel_number: idx + 1,
        package_number: pkg.package_number,
        shipping_carrier: pkg.shipping_carrier || shopeeOrder.shipping_carrier || null,
        status: pkg.logistics_status === 'LOGISTICS_PICKUP_DONE' || pkg.logistics_status === 'LOGISTICS_DELIVERY_DONE'
          ? 'shipped' : 'pending',
      }));
      await supabaseAdmin.from('order_parcels').insert(parcelsToInsert);

      // Create order_parcel_items: map Shopee item_id+model_id → order_item_id
      const { data: orderItemRows } = await supabaseAdmin
        .from('order_items')
        .select('id, variation_id')
        .eq('order_id', order.id);

      if (orderItemRows) {
        // Build lookup: variation_id → order_item_id
        const varToOrderItem = new Map(orderItemRows.map(oi => [oi.variation_id, oi.id]));

        // Build lookup: "itemId:modelId" → variation_id (from resolvedItems)
        const shopeeToVar = new Map(resolvedItems.map(ri => [`${ri.shopeeItemId}:${ri.shopeeModelId}`, ri.variation_id]));

        const { data: parcelsCreated } = await supabaseAdmin
          .from('order_parcels')
          .select('id, parcel_number, package_number')
          .eq('order_id', order.id)
          .order('parcel_number');

        const parcelItemsToInsert: { parcel_id: string; order_item_id: string; quantity: number }[] = [];
        for (const pkg of shopeeOrder.package_list!) {
          const parcel = parcelsCreated?.find(p => p.package_number === pkg.package_number);
          if (!parcel || !pkg.item_list) continue;
          for (const item of pkg.item_list) {
            const varId = shopeeToVar.get(`${item.item_id}:${item.model_id}`);
            if (!varId) continue;
            const orderItemId = varToOrderItem.get(varId);
            if (!orderItemId) continue;
            // Shopee package_list.item_list doesn't include qty, default to 1
            parcelItemsToInsert.push({ parcel_id: parcel.id, order_item_id: orderItemId, quantity: 1 });
          }
        }
        if (parcelItemsToInsert.length > 0) {
          await supabaseAdmin.from('order_parcel_items').insert(parcelItemsToInsert);
        }
      }
      console.log(`[Shopee Sync] Created ${shopeeOrder.package_list!.length} parcels for split order ${shopeeOrder.order_sn}`);
    } catch (e) {
      console.error(`[Shopee Sync] Failed to create parcels for split order ${shopeeOrder.order_sn}:`, e);
    }
  }

  // Check can_split_order via get_package_detail
  await syncCanSplitOrder(order.id, creds, shopeeOrder).catch(() => {});

  // Fetch escrow detail for COMPLETED orders (fire-and-forget)
  if (shopeeOrder.order_status === 'COMPLETED') {
    fetchAndSaveEscrowDetail(account, shopeeOrder.order_sn, order.id).catch(err => {
      console.error(`[Shopee Sync] Escrow fetch error for ${shopeeOrder.order_sn}:`, err);
    });
  }

  // Count unique new products created for this order
  const uniqueNewProducts = new Set(newlyCreatedProductIds).size;

  return {
    action: 'created',
    productsCreated: uniqueNewProducts,
    customersCreated: isNewCustomer ? 1 : 0,
  };
}

// --- Escrow Detail ---

/**
 * Fetch and save escrow detail for a completed Shopee order.
 * Merges escrow data into external_data.escrow_detail and updates financial fields.
 */
async function fetchAndSaveEscrowDetail(
  account: ShopeeAccountRow,
  orderSn: string,
  orderId: string
): Promise<void> {
  try {
    const creds = await ensureValidToken(account);
    const { data, error } = await getEscrowDetail(creds, orderSn);

    if (error) {
      console.error(`[Shopee Sync] Escrow detail error for ${orderSn}:`, error);
      return;
    }

    const escrow = data as Record<string, unknown>;
    if (!escrow) return;

    // Get current external_data to merge
    const { data: currentOrder } = await supabaseAdmin
      .from('orders')
      .select('external_data')
      .eq('id', orderId)
      .single();

    const existingData = (currentOrder?.external_data || {}) as Record<string, unknown>;

    // Extract financial values
    const actualShippingFee = (escrow.order_income as Record<string, unknown>)?.actual_shipping_fee as number
      || (escrow as Record<string, unknown>).actual_shipping_fee as number || 0;
    const voucherFromSeller = (escrow.order_income as Record<string, unknown>)?.voucher_from_seller as number
      || (escrow as Record<string, unknown>).voucher_from_seller as number || 0;
    const sellerDiscount = (escrow.order_income as Record<string, unknown>)?.seller_discount as number
      || (escrow as Record<string, unknown>).seller_discount as number || 0;

    await supabaseAdmin
      .from('orders')
      .update({
        external_data: { ...existingData, escrow_detail: escrow },
        shipping_fee: actualShippingFee,
        discount_amount: voucherFromSeller + sellerDiscount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    // อัปเดตค่าส่งใน order_shipments ด้วย (ใส่ที่ shipment แรก)
    if (actualShippingFee > 0) {
      const { data: shipments } = await supabaseAdmin
        .from('order_shipments')
        .select('id')
        .eq('order_id', orderId)
        .order('created_at', { ascending: true })
        .limit(1);
      if (shipments?.[0]) {
        await supabaseAdmin
          .from('order_shipments')
          .update({ shipping_fee: actualShippingFee })
          .eq('id', shipments[0].id);
      }
    }

    console.log(`[Shopee Sync] Saved escrow detail for ${orderSn}: shipping=${actualShippingFee}, seller_discount=${voucherFromSeller + sellerDiscount}`);
  } catch (err) {
    console.error(`[Shopee Sync] fetchAndSaveEscrowDetail error for ${orderSn}:`, err);
  }
}

// --- Repair Products for Existing Orders ---

/**
 * When an existing order's products were soft-deleted, re-activate them.
 * Also backfill missing image, variation attributes, and product_images from Shopee data.
 * Returns the number of products re-activated/repaired.
 */
async function repairOrderProducts(
  companyId: string,
  orderId: string,
  shopeeOrder: ShopeeOrder,
  itemEnrichmentMap: Map<number, ShopeeItemEnrichment>
): Promise<number> {
  // Get order items
  const { data: orderItems } = await supabaseAdmin
    .from('order_items')
    .select('id, variation_id, product_id, product_code')
    .eq('order_id', orderId);

  if (!orderItems || orderItems.length === 0) return 0;

  let repaired = 0;
  const now = new Date().toISOString();
  const repairedProductIds = new Set<string>();

  for (const orderItem of orderItems) {
    if (!orderItem.product_id) continue;

    // Get variation SKU for better matching
    let variationSku: string | null = null;
    if (orderItem.variation_id) {
      const { data: varData } = await supabaseAdmin
        .from('product_variations')
        .select('sku')
        .eq('id', orderItem.variation_id)
        .single();
      variationSku = varData?.sku || null;
    }

    // Find matching Shopee item — try multiple matching strategies
    const shopeeItem = shopeeOrder.item_list?.find(item => {
      const modelSku = item.model_sku || '';
      const itemSku = item.item_sku || '';
      if (variationSku && modelSku && modelSku === variationSku) return true;
      if (modelSku && modelSku === orderItem.product_code) return true;
      if (itemSku && itemSku === orderItem.product_code) return true;
      if (orderItem.product_code?.startsWith('SP-') && String(item.item_id) === orderItem.product_code.replace('SP-', '')) return true;
      return false;
    });

    // Get enrichment data (tier_variation names + parent images + model images)
    const enrichment = shopeeItem ? itemEnrichmentMap.get(shopeeItem.item_id) : undefined;
    const parentImageUrl = enrichment?.images?.[0] || '';
    const tierVariationNames = enrichment?.tierVariations || [];
    const variationImageUrl = shopeeItem ? (enrichment?.modelImageMap.get(shopeeItem.model_sku) || shopeeItem.image_info?.image_url || '') : '';
    console.log(`[Shopee Sync] Repair enrichment for item ${shopeeItem?.item_id}: tierVariationNames=[${tierVariationNames.join(',')}], hasEnrichment=${!!enrichment}`);

    // Check product state
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('id, is_active, image, selected_variation_types')
      .eq('id', orderItem.product_id)
      .single();

    if (!product) continue;

    const needsReactivation = !product.is_active;
    const hasShopeeImage = !!(parentImageUrl || shopeeItem?.image_info?.image_url);
    const needsImage = !product.image && hasShopeeImage;
    const isVariationProduct = shopeeItem && shopeeItem.model_id > 0 && shopeeItem.model_name;

    // Check if product_images table is missing records (even if product.image column is set)
    let needsProductImageRecord = false;
    if (hasShopeeImage) {
      const { count } = await supabaseAdmin
        .from('product_images')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', orderItem.product_id)
        .eq('company_id', companyId);
      needsProductImageRecord = (count || 0) === 0;
    }
    // Check if variation types need updating: empty OR using generic fallback while real tier names are available
    const hasRealTierNames = tierVariationNames.length > 0;
    const currentTypesAreEmpty = !product.selected_variation_types || product.selected_variation_types.length === 0;
    const needsVariationTypes = isVariationProduct && (currentTypesAreEmpty || hasRealTierNames);

    // Check if product-level repair is needed
    const needsProductRepair = needsReactivation || needsImage || needsVariationTypes || needsProductImageRecord;

    // Product-level repairs (only once per product)
    if (needsProductRepair && !repairedProductIds.has(product.id)) {
      const productUpdate: Record<string, unknown> = { updated_at: now };

      if (needsReactivation) {
        productUpdate.is_active = true;
        await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', product.id);
      }

      // Backfill parent images from get_item_base_info (all images)
      const allParentImages = enrichment?.images || [];
      if (needsImage) {
        const img = parentImageUrl || shopeeItem!.image_info!.image_url;
        productUpdate.image = img;
        // Insert all images from Shopee
        if (allParentImages.length > 0) {
          for (const pImg of allParentImages) {
            await upsertProductImage(companyId, product.id, null, pImg);
          }
        } else {
          await upsertProductImage(companyId, product.id, null, img);
        }
      } else if (needsProductImageRecord) {
        // product.image exists but product_images table is empty — insert all images
        if (allParentImages.length > 0) {
          for (const pImg of allParentImages) {
            await upsertProductImage(companyId, product.id, null, pImg);
          }
        } else {
          const img = parentImageUrl || product.image || shopeeItem?.image_info?.image_url || '';
          if (img) {
            await upsertProductImage(companyId, product.id, null, img);
          }
        }
      }

      // Backfill selected_variation_types using Shopee tier names
      if (needsVariationTypes) {
        try {
          const variationTypeIds = await getOrCreateVariationTypeIds(companyId, tierVariationNames);
          // Only update if we actually got valid IDs — don't overwrite with empty array
          if (variationTypeIds.length > 0) {
            productUpdate.selected_variation_types = variationTypeIds;
          }
        } catch (e) {
          console.error(`[Shopee Sync] Failed to get variation type for backfill:`, e);
        }
      }

      await supabaseAdmin.from('products').update(productUpdate).eq('id', product.id);
      repairedProductIds.add(product.id);

      repaired++;
      const actions = [
        needsReactivation ? 're-activated' : null,
        needsImage ? 'image-backfilled' : null,
        needsProductImageRecord ? 'product-image-record-added' : null,
        needsVariationTypes ? 'variation-types-added' : null,
      ].filter(Boolean).join(', ');
      console.log(`[Shopee Sync] Repaired product ${product.id} (${actions}) for order ${orderId}`);
    }

    // Variation-level repairs (always check each variation independently)
    if (orderItem.variation_id && shopeeItem) {
      // Find exact model match for this variation
      let modelName = shopeeItem.model_name;
      if (variationSku && shopeeOrder.item_list) {
        const exactModel = shopeeOrder.item_list.find(item =>
          (item.model_sku || '') === variationSku
        );
        if (exactModel?.model_name) {
          modelName = exactModel.model_name;
        }
      }

      const { data: variation } = await supabaseAdmin
        .from('product_variations')
        .select('id, attributes')
        .eq('id', orderItem.variation_id)
        .single();

      if (variation) {
        // Backfill attributes using tier_variation names
        // Also re-update if currently using generic "ตัวเลือกสินค้า" key and real tier names are available
        const currentAttrs = variation.attributes as Record<string, string> | null;
        const attrsAreEmpty = !currentAttrs || Object.keys(currentAttrs).length === 0;
        const attrsUseGenericKey = currentAttrs && 'ตัวเลือกสินค้า' in currentAttrs;
        const shouldUpdateAttrs = modelName && (attrsAreEmpty || (attrsUseGenericKey && tierVariationNames.length > 0));

        if (shouldUpdateAttrs) {
          const attributes = buildVariationAttributes(tierVariationNames, modelName);
          await supabaseAdmin
            .from('product_variations')
            .update({ attributes, updated_at: now })
            .eq('id', variation.id);
          console.log(`[Shopee Sync] Backfilled attributes for variation ${variation.id}: ${JSON.stringify(attributes)}`);
        }

        // Backfill variation image (prefer model-specific image from get_model_list)
        if (variationImageUrl) {
          await upsertProductImage(companyId, null, variation.id, variationImageUrl);
        }
      }
    }
  }

  return repaired;
}

// --- Variation Type Helper ---

// Cache variation type ID per company to avoid repeated lookups
const variationTypeCache: Record<string, string> = {};

/**
 * Get or create variation type IDs from Shopee tier_variation names.
 * e.g. ["สี", "ขนาด"] → [uuid1, uuid2]
 * Falls back to "ตัวเลือกสินค้า" if no names provided.
 */
async function getOrCreateVariationTypeIds(companyId: string, tierVariationNames: string[]): Promise<string[]> {
  const names = tierVariationNames.length > 0 ? tierVariationNames : ['ตัวเลือกสินค้า'];
  const ids: string[] = [];

  for (const name of names) {
    const cacheKey = `${companyId}:${name}`;
    if (variationTypeCache[cacheKey]) {
      ids.push(variationTypeCache[cacheKey]);
      continue;
    }

    // Try to find existing for this company
    const { data: existing } = await supabaseAdmin
      .from('variation_types')
      .select('id')
      .eq('company_id', companyId)
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (existing) {
      variationTypeCache[cacheKey] = existing.id;
      ids.push(existing.id);
      continue;
    }

    // Check if it exists globally with a different company_id (seeded types)
    // variation_types has UNIQUE(name) constraint globally
    const { data: globalExisting } = await supabaseAdmin
      .from('variation_types')
      .select('id, company_id')
      .eq('name', name)
      .eq('is_active', true)
      .limit(1)
      .single();

    if (globalExisting) {
      // Claim it for this company so it shows up in the UI
      if (globalExisting.company_id !== companyId) {
        await supabaseAdmin
          .from('variation_types')
          .update({ company_id: companyId })
          .eq('id', globalExisting.id);
        console.log(`[Shopee Sync] Claimed variation type "${name}" (${globalExisting.id}) for company ${companyId}`);
      }
      variationTypeCache[cacheKey] = globalExisting.id;
      ids.push(globalExisting.id);
      continue;
    }

    // Create new
    const { data: maxData } = await supabaseAdmin
      .from('variation_types')
      .select('sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .single();

    const { data: newType, error } = await supabaseAdmin
      .from('variation_types')
      .insert({
        company_id: companyId,
        name,
        sort_order: (maxData?.sort_order || 0) + 1,
      })
      .select()
      .single();

    if (error || !newType) {
      console.error(`[Shopee Sync] Failed to create variation type "${name}":`, error);
      continue;
    }

    variationTypeCache[cacheKey] = newType.id;
    ids.push(newType.id);
    console.log(`[Shopee Sync] Created variation type "${name}" → ${newType.id}`);
  }

  return ids;
}

/**
 * Build variation attributes from Shopee tier_variation names + model_name.
 * model_name can contain comma-separated values for multi-tier variations.
 * e.g. tierNames=["สี","ขนาด"], modelName="แดง,XL" → {"สี":"แดง","ขนาด":"XL"}
 * Falls back to {"ตัวเลือกสินค้า": modelName} if no tier names.
 */
function buildVariationAttributes(tierVariationNames: string[], modelName: string): Record<string, string> {
  if (!modelName) return {};

  if (tierVariationNames.length === 0) {
    return { 'ตัวเลือกสินค้า': modelName };
  }

  // Shopee model_name uses comma to separate multi-tier values
  const values = modelName.split(',').map(v => v.trim());
  const attributes: Record<string, string> = {};

  for (let i = 0; i < tierVariationNames.length; i++) {
    attributes[tierVariationNames[i]] = values[i] || modelName;
  }

  return attributes;
}

/**
 * Insert image into product_images table if not already present.
 * For Shopee external URLs, uses 'shopee-external' as storage_path.
 */
async function upsertProductImage(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrl: string,
  sortOrder: number = 0
): Promise<void> {
  if (!imageUrl) return;

  try {
    // Check if image already exists to avoid duplicates
    let query = supabaseAdmin
      .from('product_images')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('image_url', imageUrl);

    if (productId) query = query.eq('product_id', productId);
    else query = query.is('product_id', null);
    if (variationId) query = query.eq('variation_id', variationId);
    else query = query.is('variation_id', null);

    const { count } = await query;
    if ((count || 0) > 0) return; // Already exists

    const { error: insertErr } = await supabaseAdmin
      .from('product_images')
      .insert({
        company_id: companyId,
        product_id: productId,
        variation_id: variationId,
        image_url: imageUrl,
        storage_path: 'shopee-external',
        sort_order: sortOrder,
      });

    if (insertErr) {
      console.error(`[Shopee Sync] upsertProductImage insert failed (product=${productId}, variation=${variationId}):`, insertErr.message);
    }
  } catch (e) {
    console.error(`[Shopee Sync] upsertProductImage error (product=${productId}, variation=${variationId}):`, e instanceof Error ? e.message : e);
  }
}

/** Batch insert multiple product images in parallel */
async function upsertProductImages(
  companyId: string,
  productId: string | null,
  variationId: string | null,
  imageUrls: string[]
): Promise<void> {
  const urls = imageUrls.filter(Boolean);
  if (urls.length === 0) return;
  await Promise.all(urls.map(url => upsertProductImage(companyId, productId, variationId, url)));
}

// --- Product/Variation Matching ---

interface ShopeeItemInfo {
  shopeeItemId: number;
  shopeeItemName: string;
  shopeeModelId: number;
  shopeeModelName: string;
  shopeeModelSku: string;
  shopeeItemSku: string;
  shopeeImageUrl: string;  // per-item image from order detail
  tierVariationNames: string[];  // e.g. ["สี", "ขนาด"] from get_item_base_info
  parentImageUrl: string;  // first image from get_item_base_info (for parent product)
  parentImages: string[];  // all images from get_item_base_info
  allModels?: import('@/lib/shopee/api').ShopeeModelInfo[];  // ALL models from get_model_list
  // Enrichment data for marketplace_product_links (passed through from getItemEnrichment)
  enrichment?: ShopeeItemEnrichment;
  accountId?: string;         // Shopee account ID for marketplace link
  accountName?: string;       // Shopee account name for marketplace link
}

/**
 * Backfill missing sibling variations for an existing parent product.
 * Checks each model from allModels — if the variation SKU doesn't exist yet, creates it.
 */
async function backfillSiblingVariations(
  companyId: string,
  parentId: string,
  shopeeInfo: ShopeeItemInfo
) {
  if (!shopeeInfo.allModels || shopeeInfo.allModels.length === 0) return;

  // Pre-compute category name for marketplace links
  let sibCategoryName = '';
  const sibCategoryId = shopeeInfo.enrichment?.category_id;
  if (sibCategoryId && shopeeInfo.accountId) {
    try { sibCategoryName = await getCategoryName(shopeeInfo.accountId, sibCategoryId); } catch { /* ignore */ }
  }

  let siblingCount = 0;
  for (const model of shopeeInfo.allModels) {
    const sibSku = model.model_sku || `SP-${shopeeInfo.shopeeItemId}-${model.model_id}`;

    // Check if already exists
    const { data: existingSib } = await supabaseAdmin
      .from('product_variations')
      .select('id')
      .eq('company_id', companyId)
      .eq('product_id', parentId)
      .eq('sku', sibSku)
      .limit(1)
      .maybeSingle();

    if (existingSib) continue;

    try {
      const sibAttributes = buildVariationAttributes(shopeeInfo.tierVariationNames, model.model_name);
      const { data: sibVar } = await supabaseAdmin
        .from('product_variations')
        .insert({
          company_id: companyId,
          product_id: parentId,
          variation_label: model.model_name,
          sku: sibSku,
          attributes: sibAttributes,
          default_price: model.price || 0,
          discount_price: 0,
          stock: 0,
          min_stock: 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      // Insert sibling variation image
      if (sibVar && model.image_url) {
        await upsertProductImage(companyId, parentId, sibVar.id, model.image_url);
      }

      // Create marketplace_product_links for sibling (with full enrichment data)
      if (sibVar && shopeeInfo.accountId) {
        try {
          const enrichData = shopeeInfo.enrichment;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const linkData: Record<string, any> = {
            company_id: companyId,
            platform: 'shopee',
            account_id: shopeeInfo.accountId,
            account_name: shopeeInfo.accountName || '',
            product_id: parentId,
            variation_id: sibVar.id,
            external_item_id: String(shopeeInfo.shopeeItemId),
            external_model_id: String(model.model_id || 0),
            external_sku: model.model_sku || '',
            platform_price: model.price || null,
            platform_product_name: enrichData?.item_name || shopeeInfo.shopeeItemName || null,
            platform_primary_image: enrichData?.images?.[0] || null,
            external_item_status: enrichData?.item_status || null,
            shopee_category_id: enrichData?.category_id ? String(enrichData.category_id) : null,
            shopee_category_name: sibCategoryName || null,
            weight: enrichData?.weight || null,
            last_synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (enrichData?.attribute_list && enrichData.attribute_list.length > 0) {
            linkData.shopee_attributes = enrichData.attribute_list;
          }
          if (enrichData?.brand) {
            linkData.shopee_brand_id = enrichData.brand.brand_id;
            linkData.shopee_brand_name = enrichData.brand.display_brand_name || enrichData.brand.original_brand_name;
          }

          // Write structured platform_data alongside legacy shopee_* columns
          linkData.platform_data = {
            category_id: linkData.shopee_category_id ? Number(linkData.shopee_category_id) : null,
            category_name: linkData.shopee_category_name || null,
            attributes: linkData.shopee_attributes || null,
            brand_id: linkData.shopee_brand_id || null,
            brand_name: linkData.shopee_brand_name || null,
          };

          await supabaseAdmin.from('marketplace_product_links').upsert(
            linkData,
            { onConflict: 'account_id,external_item_id,external_model_id' }
          );
        } catch (linkErr) {
          console.error(`[Shopee Sync] Failed to create marketplace link for sibling SKU=${sibSku}:`, linkErr);
        }
      }

      siblingCount++;
    } catch (sibErr) {
      console.error(`[Shopee Sync] Failed to create sibling variation SKU=${sibSku}:`, sibErr);
    }
  }
  if (siblingCount > 0) {
    console.log(`[Shopee Sync] Backfilled ${siblingCount} sibling variations for parent product ${parentId}`);
  }
}

/**
 * Find existing variation by SKU, or create a new product + variation.
 * Supports both simple and variation products:
 * - If Shopee item has model_id > 0 → variation product (parent + children)
 * - Otherwise → simple product
 */
async function findOrCreateVariationBySku(
  companyId: string,
  sku: string,
  productName: string,
  price: number,
  shopeeInfo: ShopeeItemInfo
): Promise<{
  variation_id: string;
  product_id: string;
  product_code: string;
  isNewProduct: boolean;
  isNewVariation: boolean;
}> {
  // 0. Try marketplace_product_links FIRST — most accurate because it maps Shopee item_id+model_id → product/variation
  if (shopeeInfo.accountId && shopeeInfo.shopeeItemId) {
    const { data: link } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('product_id, variation_id')
      .eq('account_id', shopeeInfo.accountId)
      .eq('external_item_id', String(shopeeInfo.shopeeItemId))
      .eq('external_model_id', String(shopeeInfo.shopeeModelId || 0))
      .limit(1)
      .maybeSingle();

    if (link?.variation_id && link?.product_id) {
      // Verify the variation still exists
      const { data: linkedVar } = await supabaseAdmin
        .from('product_variations')
        .select('id, product_id, sku, variation_label, is_active, products!inner(id, code, image, is_active)')
        .eq('id', link.variation_id)
        .limit(1)
        .single();

      if (linkedVar) {
        const productData = linkedVar.products as unknown as { id: string; code: string; image: string | null; is_active: boolean };
        const now = new Date().toISOString();

        // Re-activate if soft-deleted
        if (!productData.is_active) {
          await supabaseAdmin.from('products').update({ is_active: true, updated_at: now }).eq('id', productData.id);
          await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', productData.id);
          console.log(`[Shopee Sync] Re-activated soft-deleted product ${productData.id} via marketplace link`);
        } else if (!linkedVar.is_active) {
          await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('id', linkedVar.id);
        }

        // Backfill images
        if (!productData.image && (shopeeInfo.parentImageUrl || shopeeInfo.shopeeImageUrl)) {
          const parentImg = shopeeInfo.parentImageUrl || shopeeInfo.shopeeImageUrl;
          await supabaseAdmin.from('products').update({ image: parentImg }).eq('id', linkedVar.product_id);
          const imgs = shopeeInfo.parentImages.length > 0 ? shopeeInfo.parentImages : [parentImg];
          await upsertProductImages(companyId, linkedVar.product_id, null, imgs);
        }
        if (shopeeInfo.shopeeImageUrl) {
          await upsertProductImage(companyId, linkedVar.product_id, linkedVar.id, shopeeInfo.shopeeImageUrl);
        }

        // Backfill siblings
        if (shopeeInfo.allModels && shopeeInfo.allModels.length > 0 && shopeeInfo.shopeeModelId > 0) {
          await backfillSiblingVariations(companyId, linkedVar.product_id, shopeeInfo);
        }

        console.log(`[Shopee Sync] Matched via marketplace_product_links: item=${shopeeInfo.shopeeItemId} model=${shopeeInfo.shopeeModelId} → product=${linkedVar.product_id} variation=${linkedVar.id}`);
        return {
          variation_id: linkedVar.id,
          product_id: linkedVar.product_id,
          product_code: productData.code || sku,
          isNewProduct: false,
          isNewVariation: false,
        };
      }
    }
  }

  // 1. Try to find by SKU in product_variations (including soft-deleted)
  if (sku) {
    const { data: existingVariation } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, sku, variation_label, is_active, products!inner(id, code, image, is_active)')
      .eq('company_id', companyId)
      .eq('sku', sku)
      .limit(1)
      .single();

    if (existingVariation) {
      const productData = existingVariation.products as unknown as { id: string; code: string; image: string | null; is_active: boolean };
      const now = new Date().toISOString();

      // Re-activate if soft-deleted
      if (!productData.is_active) {
        await supabaseAdmin.from('products').update({ is_active: true, updated_at: now }).eq('id', productData.id);
        await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', productData.id);
        console.log(`[Shopee Sync] Re-activated soft-deleted product ${productData.id} (SKU: ${sku})`);
      } else if (!existingVariation.is_active) {
        await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('id', existingVariation.id);
      }

      // Backfill parent images from get_item_base_info (all images)
      if (!productData.image && (shopeeInfo.parentImageUrl || shopeeInfo.shopeeImageUrl)) {
        const parentImg = shopeeInfo.parentImageUrl || shopeeInfo.shopeeImageUrl;
        await supabaseAdmin
          .from('products')
          .update({ image: parentImg })
          .eq('id', existingVariation.product_id);
        // Insert all parent images (parallel)
        const imgs = shopeeInfo.parentImages.length > 0 ? shopeeInfo.parentImages : [parentImg];
        await upsertProductImages(companyId, existingVariation.product_id, null, imgs);
      }

      // Add variation image from order detail (per-item image)
      if (shopeeInfo.shopeeImageUrl) {
        await upsertProductImage(companyId, existingVariation.product_id, existingVariation.id, shopeeInfo.shopeeImageUrl);
      }

      // Backfill missing sibling variations for existing products
      if (shopeeInfo.allModels && shopeeInfo.allModels.length > 0 && shopeeInfo.shopeeModelId > 0) {
        await backfillSiblingVariations(companyId, existingVariation.product_id, shopeeInfo);
      }

      return {
        variation_id: existingVariation.id,
        product_id: existingVariation.product_id,
        product_code: productData.code || sku,
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 2. Not found — detect if variation or simple product
  const isVariation = shopeeInfo.shopeeModelId > 0 && !!shopeeInfo.shopeeModelName;

  if (isVariation) {
    // --- Variation Product ---
    // Check if parent product already exists (created by a previous item in the same order)
    // We tag parent products with shopee_item_id in metadata/description for grouping
    const parentCode = shopeeInfo.shopeeItemSku || `SP-${shopeeInfo.shopeeItemId}`;

    const { data: existingParent } = await supabaseAdmin
      .from('products')
      .select('id, code, is_active')
      .eq('company_id', companyId)
      .eq('code', parentCode)
      .eq('source', 'shopee')
      .limit(1)
      .single();

    let parentId: string;
    let parentProductCode: string;

    if (existingParent) {
      // Parent already exists — re-activate if soft-deleted
      if (!existingParent.is_active) {
        const now = new Date().toISOString();
        await supabaseAdmin.from('products').update({ is_active: true, updated_at: now }).eq('id', existingParent.id);
        await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', existingParent.id);
        console.log(`[Shopee Sync] Re-activated soft-deleted parent product ${existingParent.id} (code: ${parentCode})`);
      }
      parentId = existingParent.id;
      parentProductCode = existingParent.code;
    } else {
      // Get variation type IDs — use tier_variation names from Shopee if available
      const variationTypeIds = await getOrCreateVariationTypeIds(companyId, shopeeInfo.tierVariationNames);

      // Create parent product (variation_label = NULL → variation type)
      const parentImg = shopeeInfo.parentImageUrl || shopeeInfo.shopeeImageUrl || null;
      const { data: newParent, error: parentError } = await supabaseAdmin
        .from('products')
        .insert({
          company_id: companyId,
          code: parentCode,
          name: shopeeInfo.shopeeItemName,
          variation_label: null,  // NULL = variation product
          image: parentImg,
          source: 'shopee',
          selected_variation_types: variationTypeIds,
          description: `Shopee Item #${shopeeInfo.shopeeItemId}`,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (parentError || !newParent) {
        throw new Error(`Failed to create parent product: ${parentError?.message}`);
      }

      parentId = newParent.id;
      parentProductCode = parentCode;

      // Insert all parent product images (parallel)
      const parentImgs = shopeeInfo.parentImages.length > 0 ? shopeeInfo.parentImages : (parentImg ? [parentImg] : []);
      await upsertProductImages(companyId, parentId, null, parentImgs);

      console.log(`[Shopee Sync] Created variation parent "${shopeeInfo.shopeeItemName}" (code: ${parentCode}) → product_id=${parentId}, images=${shopeeInfo.parentImages.length}`);
    }

    // Check if this specific variation already exists under the parent
    const variationSku = sku || `SP-${shopeeInfo.shopeeItemId}-${shopeeInfo.shopeeModelId}`;
    const { data: existingVar } = await supabaseAdmin
      .from('product_variations')
      .select('id')
      .eq('company_id', companyId)
      .eq('product_id', parentId)
      .eq('sku', variationSku)
      .limit(1)
      .single();

    if (existingVar) {
      return {
        variation_id: existingVar.id,
        product_id: parentId,
        product_code: variationSku,
        isNewProduct: !existingParent, // parent was just created above
        isNewVariation: false,
      };
    }

    // Create variation child with attributes from tier_variation names
    // price here is model_discounted_price from order — use as discount_price if original is higher
    const attributes = buildVariationAttributes(shopeeInfo.tierVariationNames, shopeeInfo.shopeeModelName);
    const { data: newVariation, error: variationError } = await supabaseAdmin
      .from('product_variations')
      .insert({
        company_id: companyId,
        product_id: parentId,
        variation_label: shopeeInfo.shopeeModelName,  // display name from attributes
        sku: variationSku,
        attributes,
        default_price: price,
        discount_price: 0,
        stock: 0,
        min_stock: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (variationError || !newVariation) {
      throw new Error(`Failed to create variation: ${variationError?.message}`);
    }

    // Insert variation image from order detail (per-item image)
    if (shopeeInfo.shopeeImageUrl) {
      await upsertProductImage(companyId, parentId, newVariation.id, shopeeInfo.shopeeImageUrl);
    }

    console.log(`[Shopee Sync] Created variation "${shopeeInfo.shopeeModelName}" (SKU: ${variationSku}) under parent "${shopeeInfo.shopeeItemName}"`);

    // Create ALL sibling variations from get_model_list (for new AND existing parents)
    if (shopeeInfo.allModels && shopeeInfo.allModels.length > 0) {
      await backfillSiblingVariations(companyId, parentId, shopeeInfo);
    }

    return {
      variation_id: newVariation.id,
      product_id: parentId,
      product_code: variationSku,
      isNewProduct: !existingParent,
      isNewVariation: true,
    };
  }

  // --- Simple Product ---
  const productCode = sku || `SP-${shopeeInfo.shopeeItemId}`;
  const simpleLabel = sku || productName;  // Use SKU or name as display label

  // Check if a soft-deleted product with the same code exists
  const { data: existingSimple } = await supabaseAdmin
    .from('products')
    .select('id, code, is_active')
    .eq('company_id', companyId)
    .eq('code', productCode)
    .limit(1)
    .single();

  if (existingSimple) {
    // Re-activate if soft-deleted
    const now = new Date().toISOString();
    if (!existingSimple.is_active) {
      await supabaseAdmin.from('products').update({ is_active: true, updated_at: now }).eq('id', existingSimple.id);
      await supabaseAdmin.from('product_variations').update({ is_active: true, updated_at: now }).eq('product_id', existingSimple.id);
      console.log(`[Shopee Sync] Re-activated soft-deleted simple product ${existingSimple.id} (code: ${productCode})`);
    }
    // Find its variation
    const { data: existingVar } = await supabaseAdmin
      .from('product_variations')
      .select('id')
      .eq('product_id', existingSimple.id)
      .limit(1)
      .single();

    if (existingVar) {
      return {
        variation_id: existingVar.id,
        product_id: existingSimple.id,
        product_code: productCode,
        isNewProduct: false,
        isNewVariation: false,
      };
    }

    // Variation was hard-deleted — recreate it
    const { data: recreatedVar } = await supabaseAdmin
      .from('product_variations')
      .insert({
        company_id: companyId,
        product_id: existingSimple.id,
        variation_label: simpleLabel,
        sku: sku || null,
        default_price: price,
        discount_price: 0,
        stock: 0,
        min_stock: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    console.log(`[Shopee Sync] Recreated missing variation for product ${existingSimple.id} (code: ${productCode})`);

    return {
      variation_id: recreatedVar?.id || existingSimple.id,
      product_id: existingSimple.id,
      product_code: productCode,
      isNewProduct: false,
      isNewVariation: true,
    };
  }

  const simpleImg = shopeeInfo.parentImageUrl || shopeeInfo.shopeeImageUrl || null;
  const { data: newProduct, error: productError } = await supabaseAdmin
    .from('products')
    .insert({
      company_id: companyId,
      code: productCode,
      name: productName,
      variation_label: simpleLabel,  // Simple product: needs a value (determines product_type in view)
      image: simpleImg,
      source: 'shopee',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (productError || !newProduct) {
    throw new Error(`Failed to create product: ${productError?.message}`);
  }

  // Insert all product images (parallel)
  const productImgs = shopeeInfo.parentImages.length > 0 ? shopeeInfo.parentImages : (simpleImg ? [simpleImg] : []);
  await upsertProductImages(companyId, newProduct.id, null, productImgs);

  const { data: newVariation, error: variationError } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: newProduct.id,
      variation_label: simpleLabel,
      sku: sku || null,
      default_price: price,
      discount_price: 0,
      stock: 0,
      min_stock: 0,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (variationError || !newVariation) {
    // Rollback product
    await supabaseAdmin.from('products').delete().eq('id', newProduct.id);
    throw new Error(`Failed to create variation: ${variationError?.message}`);
  }

  console.log(`[Shopee Sync] Created simple product "${productName}" (SKU: ${sku || 'none'}) → product_id=${newProduct.id}`);

  return {
    variation_id: newVariation.id,
    product_id: newProduct.id,
    product_code: productCode,
    isNewProduct: true,
    isNewVariation: true,
  };
}

// --- Stock Reservation ---

/**
 * Reserve stock for a variation in a warehouse.
 * Same pattern as order creation flow in /api/orders/route.ts
 */
async function reserveStock(
  companyId: string,
  warehouseId: string,
  variationId: string,
  quantity: number,
  orderId: string,
  orderNumber: string
): Promise<void> {
  try {
    const { data: existingInv } = await supabaseAdmin
      .from('inventory')
      .select('id, quantity, reserved_quantity')
      .eq('warehouse_id', warehouseId)
      .eq('variation_id', variationId)
      .eq('company_id', companyId)
      .single();

    if (existingInv) {
      const newReserved = (existingInv.reserved_quantity || 0) + quantity;
      await supabaseAdmin
        .from('inventory')
        .update({
          reserved_quantity: newReserved,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingInv.id);

      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: companyId,
          warehouse_id: warehouseId,
          variation_id: variationId,
          type: 'reserve',
          quantity,
          balance_after: existingInv.quantity,
          reference_type: 'order',
          reference_id: orderId,
          notes: `Reserve for Shopee order ${orderNumber}`,
          created_at: new Date().toISOString(),
        });
    } else {
      // Create inventory row with 0 quantity and reserved
      await supabaseAdmin
        .from('inventory')
        .insert({
          company_id: companyId,
          warehouse_id: warehouseId,
          variation_id: variationId,
          quantity: 0,
          reserved_quantity: quantity,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: companyId,
          warehouse_id: warehouseId,
          variation_id: variationId,
          type: 'reserve',
          quantity,
          balance_after: 0,
          reference_type: 'order',
          reference_id: orderId,
          notes: `Reserve for Shopee order ${orderNumber}`,
          created_at: new Date().toISOString(),
        });
    }
  } catch (err) {
    console.error(`[Shopee Sync] Stock reserve error for variation ${variationId}:`, err);
  }
}

/**
 * Return/unreserve stock when a Shopee order is cancelled.
 * - If order was NOT yet shipped (new/ready_to_ship/processing): unreserve (ลด reserved_quantity)
 * - If order was already shipped (shipping/completed): return stock (เพิ่ม quantity กลับ)
 */
async function returnStockForCancelledOrder(
  companyId: string,
  orderId: string,
  warehouseId: string,
  previousOrderStatus: string,
  orderSn: string,
) {
  try {
    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('variation_id, quantity')
      .eq('order_id', orderId)
      .eq('company_id', companyId);

    if (!orderItems || orderItems.length === 0) return;

    // Determine if stock was already deducted (shipped) or just reserved
    const wasShipped = ['shipping', 'completed'].includes(previousOrderStatus);

    for (const oi of orderItems) {
      if (!oi.variation_id) continue;
      try {
        const { data: inv } = await supabaseAdmin
          .from('inventory')
          .select('id, quantity, reserved_quantity')
          .eq('warehouse_id', warehouseId)
          .eq('variation_id', oi.variation_id)
          .eq('company_id', companyId)
          .single();

        if (!inv) continue;

        if (wasShipped) {
          // Stock was deducted → return quantity
          const newQty = (inv.quantity || 0) + oi.quantity;
          await supabaseAdmin
            .from('inventory')
            .update({ quantity: newQty, updated_at: new Date().toISOString() })
            .eq('id', inv.id);

          await supabaseAdmin
            .from('inventory_transactions')
            .insert({
              company_id: companyId,
              warehouse_id: warehouseId,
              variation_id: oi.variation_id,
              type: 'return',
              quantity: oi.quantity,
              balance_after: newQty,
              reference_type: 'order',
              reference_id: orderId,
              notes: `Return stock for cancelled Shopee order ${orderSn}`,
              created_at: new Date().toISOString(),
            });
        } else {
          // Stock was only reserved → unreserve
          const newReserved = Math.max(0, (inv.reserved_quantity || 0) - oi.quantity);
          await supabaseAdmin
            .from('inventory')
            .update({ reserved_quantity: newReserved, updated_at: new Date().toISOString() })
            .eq('id', inv.id);

          await supabaseAdmin
            .from('inventory_transactions')
            .insert({
              company_id: companyId,
              warehouse_id: warehouseId,
              variation_id: oi.variation_id,
              type: 'unreserve',
              quantity: oi.quantity,
              balance_after: inv.quantity,
              reference_type: 'order',
              reference_id: orderId,
              notes: `Unreserve for cancelled Shopee order ${orderSn}`,
              created_at: new Date().toISOString(),
            });
        }
      } catch (itemErr) {
        console.error(`[Shopee Sync] Stock return error for variation ${oi.variation_id}:`, itemErr);
      }
    }
  } catch (err) {
    console.error(`[Shopee Sync] Stock return error for order ${orderSn}:`, err);
  }
}

// --- Customer Logic ---

/**
 * Update customer name if current name is masked (****) and we have a better name now.
 */
async function updateCustomerIfMasked(customerId: string, currentName: string | null, newName: string): Promise<void> {
  if (!currentName || !isMasked(currentName)) return; // name is fine, skip
  if (isMasked(newName)) return; // new name is also masked, skip

  await supabaseAdmin
    .from('customers')
    .update({ name: newName, updated_at: new Date().toISOString() })
    .eq('id', customerId);
  console.log(`[Shopee Sync] Updated masked customer name "${currentName}" → "${newName}" for customer ${customerId}`);
}

/** Check if Shopee has masked this value (e.g. "***", "** **", "**** ****") */
function isMasked(value: string | undefined | null): boolean {
  if (!value) return true;
  // Remove all spaces and check if only asterisks remain
  const stripped = value.replace(/\s/g, '');
  if (!stripped) return true;
  return /^\*+$/.test(stripped);
}

/** Return the value only if it's not masked, otherwise null */
function unmasked(value: string | undefined | null): string | null {
  if (!value || isMasked(value)) return null;
  return value;
}

/** Get existing default shipping address ID for a customer (for item repair) */
async function getExistingShippingAddressId(companyId: string, customerId: string | null): Promise<string | undefined> {
  if (!customerId) return undefined;
  const { data } = await supabaseAdmin
    .from('shipping_addresses')
    .select('id')
    .eq('customer_id', customerId)
    .eq('company_id', companyId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  return data?.id;
}

/**
 * Ensure a shipping address exists for a customer from Shopee order data.
 * Returns the shipping_address ID if created/found, or undefined if no address data.
 */
async function ensureShippingAddress(
  companyId: string,
  customerId: string,
  addr: ShopeeRecipientAddress | undefined
): Promise<string | undefined> {
  if (!addr) return undefined;

  const fullAddress = unmasked(addr.full_address);
  if (!fullAddress) return undefined;

  // Check if customer already has a default shipping address
  const { data: existing } = await supabaseAdmin
    .from('shipping_addresses')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('is_default', true)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create new shipping address
  const { data: newAddr } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      company_id: companyId,
      customer_id: customerId,
      address_name: 'ที่อยู่ Shopee',
      contact_person: unmasked(addr.name) || null,
      phone: unmasked(addr.phone) || null,
      address_line1: fullAddress,
      district: unmasked(addr.district) || null,
      amphoe: unmasked(addr.city) || null,
      province: unmasked(addr.state) || null,
      postal_code: unmasked(addr.zipcode) || null,
      is_default: true,
      is_active: true,
    })
    .select('id')
    .single();

  return newAddr?.id;
}

/**
 * Find or create a customer for a Shopee buyer.
 */
async function findOrCreateShopeeCustomer(
  companyId: string,
  shopeeOrder: ShopeeOrder
): Promise<{ customerId: string; isNewCustomer: boolean; shippingAddressId?: string }> {
  const addr = shopeeOrder.recipient_address;
  const phone = unmasked(addr?.phone);
  const buyerName = unmasked(addr?.name) || shopeeOrder.buyer_username || 'Shopee Buyer';

  console.log(`[Shopee Sync] Customer data: name=${addr?.name}, phone=${addr?.phone}, full_address=${addr?.full_address?.substring(0, 80)}, district=${addr?.district}, city=${addr?.city}, state=${addr?.state}, zipcode=${addr?.zipcode}`);

  // 1. Try to find by phone
  if (phone) {
    const { data: existingByPhone } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId)
      .eq('phone', phone)
      .limit(1)
      .single();
    if (existingByPhone) {
      await updateCustomerIfMasked(existingByPhone.id, existingByPhone.name, buyerName);
      const shippingAddressId = await ensureShippingAddress(companyId, existingByPhone.id, addr);
      return { customerId: existingByPhone.id, isNewCustomer: false, shippingAddressId };
    }
  }

  // 2. Try to find by buyer_username in notes (same Shopee buyer, different orders)
  if (shopeeOrder.buyer_username) {
    const { data: existingByUsername } = await supabaseAdmin
      .from('customers')
      .select('id, name')
      .eq('company_id', companyId)
      .ilike('notes', `%${shopeeOrder.buyer_username}%`)
      .limit(1)
      .single();
    if (existingByUsername) {
      await updateCustomerIfMasked(existingByUsername.id, existingByUsername.name, buyerName);
      const shippingAddressId = await ensureShippingAddress(companyId, existingByUsername.id, addr);
      return { customerId: existingByUsername.id, isNewCustomer: false, shippingAddressId };
    }
  }

  // 3. Create customer with auto-generated unique code
  const customerCode = `SP-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

  const { data: newCustomer, error } = await supabaseAdmin
    .from('customers')
    .insert({
      company_id: companyId,
      customer_code: customerCode,
      name: buyerName,
      contact_person: unmasked(addr?.name),
      phone: phone,
      customer_type: 'retail',
      is_active: true,
      notes: `สร้างอัตโนมัติจาก Shopee (${shopeeOrder.buyer_username || ''})`,
    })
    .select('id')
    .single();

  if (error || !newCustomer) {
    throw new Error(`Failed to create customer: ${error?.message}`);
  }

  // Auto-create shipping address
  const shippingAddressId = await ensureShippingAddress(companyId, newCustomer.id, addr);

  return { customerId: newCustomer.id, isNewCustomer: true, shippingAddressId };
}

