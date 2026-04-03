import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  TikTokAccountRow,
  TikTokCredentials,
  ensureValidToken,
  searchOrders,
  getOrderDetail,
} from '@/lib/tiktok/api';
import { logIntegration } from '@/lib/integration-logger';
import { parallelLimit } from '@/lib/parallel';
import { fetchCostMap } from '@/lib/cost-utils';
import { reserveStock as reserveStockService, deductAndUnreserve, returnStock as returnStockService } from '@/lib/stock-service';
import { getStockConfig } from '@/lib/stock-utils';

// --- Sync Progress ---

export interface SyncProgressEvent {
  phase: 'collecting' | 'processing' | 'done';
  current: number;
  total: number | null;
  label: string;
}

export type SyncProgressCallback = (event: SyncProgressEvent) => void;

// --- TikTok Order Types ---

interface TikTokLineItem {
  id: string;
  sku_id: string;
  product_id: string;
  product_name: string;
  sku_name: string;
  sku_image: string;
  seller_sku: string;
  original_price: string;
  sale_price: string;
  platform_discount: string;
  seller_discount: string;
  currency: string;
  package_id: string;
  package_status: string;
  tracking_number: string;
  shipping_provider_name: string;
  display_status: string;
  cancel_reason?: string;
  cancel_user?: string;
  rts_time?: number;
}

interface TikTokRecipientAddress {
  full_address: string;
  phone_number: string;
  name: string;
  first_name?: string;
  last_name?: string;
  region_code?: string;
  postal_code?: string;
  address_line1?: string;
  address_line2?: string;
  address_detail?: string;
  district_info?: { address_level_name: string; address_name: string; address_level: string }[];
}

interface TikTokPayment {
  currency: string;
  sub_total: string;
  shipping_fee: string;
  seller_discount: string;
  platform_discount: string;
  total_amount: string;
  original_total_product_price: string;
  original_shipping_fee: string;
  tax: string;
}

interface TikTokOrder {
  id: string;
  status: string;
  create_time: number;
  update_time: number;
  user_id: string;
  payment: TikTokPayment;
  recipient_address?: TikTokRecipientAddress;
  line_items: TikTokLineItem[];
  tracking_number?: string;
  shipping_provider?: string;
  shipping_provider_id?: string;
  shipping_type?: string;
  buyer_message?: string;
  cancel_reason?: string;
  cancellation_initiator?: string;
  rts_time?: number;
  rts_sla_time?: number;
  paid_time?: number;
  delivery_type?: string;
  fulfillment_type?: string;
  packages?: { id: string }[];
  is_cod?: boolean;
  seller_note?: string;
}

// --- Status Mapping ---

/**
 * TikTok status progression order (higher = later in lifecycle).
 */
const TIKTOK_STATUS_ORDER: Record<string, number> = {
  UNPAID: 0,
  ON_HOLD: 1,
  AWAITING_SHIPMENT: 2,
  PARTIALLY_SHIPPING: 3,
  AWAITING_COLLECTION: 4,
  IN_TRANSIT: 5,
  DELIVERED: 6,
  COMPLETED: 7,
  CANCELLED: 10,
};

/**
 * Map TikTok order status → internal order_status + payment_status.
 *
 * TikTok statuses:
 *   UNPAID → new / pending
 *   ON_HOLD → ready_to_ship / paid (accepted, awaiting fulfillment)
 *   AWAITING_SHIPMENT → ready_to_ship / paid
 *   PARTIALLY_SHIPPING → processing / paid
 *   AWAITING_COLLECTION → processing / paid (arranged, waiting pickup)
 *   IN_TRANSIT → shipping / paid
 *   DELIVERED → shipping / paid (delivered but not yet completed)
 *   COMPLETED → completed / paid
 *   CANCELLED → cancelled / cancelled
 */
export function mapTikTokStatus(tiktokStatus: string): { order_status: string; payment_status: string } {
  switch (tiktokStatus) {
    case 'UNPAID':
      return { order_status: 'new', payment_status: 'pending' };
    case 'ON_HOLD':
    case 'AWAITING_SHIPMENT':
      return { order_status: 'ready_to_ship', payment_status: 'paid' };
    case 'PARTIALLY_SHIPPING':
    case 'AWAITING_COLLECTION':
      return { order_status: 'processing', payment_status: 'paid' };
    case 'IN_TRANSIT':
    case 'DELIVERED':
      return { order_status: 'shipping', payment_status: 'paid' };
    case 'COMPLETED':
      return { order_status: 'completed', payment_status: 'paid' };
    case 'CANCELLED':
      return { order_status: 'cancelled', payment_status: 'cancelled' };
    default:
      return { order_status: 'new', payment_status: 'pending' };
  }
}

/** Check if new TikTok status is a forward progression */
function isStatusProgression(currentStatus: string, newStatus: string): boolean {
  const currentOrder = TIKTOK_STATUS_ORDER[currentStatus] ?? -1;
  const newOrder = TIKTOK_STATUS_ORDER[newStatus] ?? -1;
  return newOrder > currentOrder;
}

// --- Sync Result ---

export interface SyncResult {
  orders_created: number;
  orders_updated: number;
  orders_skipped: number;
  products_created: number;
  customers_created: number;
  errors: string[];
}

// --- Sync Functions ---

/**
 * Sync orders by specific TikTok order IDs (from webhook or manual).
 */
export async function syncOrdersByIds(
  account: TikTokAccountRow,
  orderIds: string[],
  onProgress?: SyncProgressCallback,
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
  const totalOrders = orderIds.length;

  // Fetch order details in batches of 50
  for (let i = 0; i < orderIds.length; i += 50) {
    const batch = orderIds.slice(i, i + 50);
    try {
      const { orders } = await getOrderDetail(creds, batch);

      // Log API call
      logIntegration({
        company_id: account.company_id,
        integration: 'tiktok',
        account_id: account.id,
        account_name: account.shop_name,
        direction: 'outgoing',
        action: 'get_order_detail',
        method: 'GET',
        api_path: '/order/202507/orders',
        request_body: { ids: batch },
        response_body: { count: orders.length },
        status: 'success',
        reference_type: 'order',
        reference_label: `Batch ${batch.length} orders`,
      });

      // Apply webhook status hint
      if (webhookStatusHint) {
        for (const order of orders) {
          const hintStatus = webhookStatusHint[order.id];
          if (hintStatus) {
            const apiOrder = TIKTOK_STATUS_ORDER[order.status] ?? -1;
            const webhookOrder = TIKTOK_STATUS_ORDER[hintStatus] ?? -1;
            if (webhookOrder > apiOrder) {
              order.status = hintStatus;
            }
          }
        }
      }

      // Process orders in parallel (concurrency=3)
      await parallelLimit(orders as TikTokOrder[], async (tiktokOrder) => {
        try {
          const upsertResult = await upsertOrder(account, creds, tiktokOrder);
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
          result.errors.push(`Order ${tiktokOrder.id}: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
  account: TikTokAccountRow,
  timeFrom: number,
  timeTo: number,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  console.log(`[TikTok Sync] syncOrdersByTimeRange: shop_id=${account.shop_id}, timeFrom=${timeFrom}, timeTo=${timeTo}`);
  const creds = await ensureValidToken(account);
  const result: SyncResult = {
    orders_created: 0,
    orders_updated: 0,
    orders_skipped: 0,
    products_created: 0,
    customers_created: 0,
    errors: [],
  };
  const allOrderIds: string[] = [];

  // Paginate through order list
  let pageToken: string | undefined;
  let hasMore = true;
  let pageNum = 0;

  while (hasMore) {
    pageNum++;
    console.log(`[TikTok Sync] Fetching order list page ${pageNum}...`);

    try {
      const response = await searchOrders(creds, {
        updateTimeGe: timeFrom,
        updateTimeLt: timeTo,
        pageSize: 100,
        pageToken,
        sortField: 'update_time',
        sortOrder: 'ASC',
      });

      const orders = response.orders || [];
      console.log(`[TikTok Sync] Page ${pageNum}: got ${orders.length} orders`);

      for (const order of orders) {
        allOrderIds.push(order.id);
      }

      onProgress?.({
        phase: 'collecting',
        current: allOrderIds.length,
        total: null,
        label: `กำลังดึงรายการออเดอร์... (${allOrderIds.length} รายการ)`,
      });

      pageToken = response.next_page_token;
      hasMore = !!pageToken && orders.length > 0;
    } catch (e) {
      result.errors.push(`Order list error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      break;
    }
  }

  console.log(`[TikTok Sync] Total order IDs collected: ${allOrderIds.length}`);

  // Fetch full details and sync
  if (allOrderIds.length > 0) {
    const syncResult = await syncOrdersByIds(account, allOrderIds, onProgress);
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

  console.log(`[TikTok Sync] Done: created=${result.orders_created}, updated=${result.orders_updated}, errors=${result.errors.length}`);
  return result;
}

/**
 * Sync incomplete orders — re-fetch status for TikTok orders not yet at terminal state.
 */
export async function syncIncompleteOrders(
  account: TikTokAccountRow,
  onProgress?: SyncProgressCallback
): Promise<SyncResult> {
  const companyId = account.company_id;
  console.log(`[TikTok Sync] syncIncompleteOrders: shop_id=${account.shop_id}`);

  const { data: incompleteOrders, error: fetchError } = await supabaseAdmin
    .from('orders')
    .select('external_order_sn')
    .eq('company_id', companyId)
    .eq('source', 'tiktok')
    .eq('marketplace_account_id', account.id)
    .not('external_status', 'in', '("COMPLETED","CANCELLED")')
    .not('external_order_sn', 'is', null)
    .order('created_at', { ascending: true });

  if (fetchError) {
    return { orders_created: 0, orders_updated: 0, orders_skipped: 0, products_created: 0, customers_created: 0, errors: [fetchError.message] };
  }

  const orderIds = (incompleteOrders || []).map(o => o.external_order_sn!).filter(Boolean);
  console.log(`[TikTok Sync] Found ${orderIds.length} incomplete orders to re-sync`);

  if (orderIds.length === 0) {
    return { orders_created: 0, orders_updated: 0, orders_skipped: 0, products_created: 0, customers_created: 0, errors: [] };
  }

  return syncOrdersByIds(account, orderIds, onProgress);
}

// --- Internal: Upsert Order ---

interface UpsertResult {
  action: 'created' | 'updated' | 'skipped';
  productsCreated: number;
  customersCreated: number;
}

async function upsertOrder(
  account: TikTokAccountRow,
  creds: TikTokCredentials,
  tiktokOrder: TikTokOrder
): Promise<UpsertResult> {
  const companyId = account.company_id;
  const { order_status, payment_status } = mapTikTokStatus(tiktokOrder.status);

  // Check if order already exists
  const { data: existing } = await supabaseAdmin
    .from('orders')
    .select('id, order_status, external_status, external_data, customer_id, created_at, fulfillment_status, warehouse_id')
    .eq('company_id', companyId)
    .eq('source', 'tiktok')
    .eq('external_order_sn', tiktokOrder.id)
    .single();

  if (existing) {
    return updateExistingOrder(account, existing, tiktokOrder, order_status, payment_status);
  }

  return createNewOrder(account, creds, tiktokOrder, order_status, payment_status);
}

// --- Update existing order ---

async function updateExistingOrder(
  account: TikTokAccountRow,
  existing: { id: string; order_status: string; external_status: string | null; external_data: unknown; customer_id: string | null; fulfillment_status: string | null; warehouse_id: string | null },
  tiktokOrder: TikTokOrder,
  order_status: string,
  payment_status: string
): Promise<UpsertResult> {
  const companyId = account.company_id;
  let statusUpdated = false;

  const statusChanged = existing.external_status !== tiktokOrder.status;
  const isForward = isStatusProgression(existing.external_status || '', tiktokOrder.status);

  if (statusChanged && isForward) {
    const shippingFee = parseFloat(tiktokOrder.payment?.shipping_fee || '0');

    // Auto-sync fulfillment_status
    const fulfillmentUpdate: Record<string, unknown> = {};
    if (['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(tiktokOrder.status)) {
      fulfillmentUpdate.fulfillment_status = 'shipped';
      fulfillmentUpdate.shipped_at = new Date().toISOString();
    } else if (tiktokOrder.status === 'CANCELLED') {
      fulfillmentUpdate.fulfillment_status = 'pending';
      fulfillmentUpdate.hold_reason = null;
    }

    // Extract tracking from line items
    const tracking = tiktokOrder.tracking_number ||
      tiktokOrder.line_items?.find(li => li.tracking_number)?.tracking_number || null;
    const carrier = tiktokOrder.shipping_provider ||
      tiktokOrder.line_items?.find(li => li.shipping_provider_name)?.shipping_provider_name || null;

    await supabaseAdmin
      .from('orders')
      .update({
        order_status,
        payment_status,
        external_status: tiktokOrder.status,
        external_data: tiktokOrder as unknown as Record<string, unknown>,
        shipping_fee: shippingFee,
        shipping_carrier: carrier,
        tracking_number: tracking,
        updated_at: new Date().toISOString(),
        ...(tiktokOrder.rts_sla_time ? { delivery_date: new Date(tiktokOrder.rts_sla_time * 1000).toISOString().split('T')[0] } : {}),
        ...fulfillmentUpdate,
      })
      .eq('id', existing.id);

    statusUpdated = true;

    // Auto-issue documents
    if (['AWAITING_COLLECTION', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(tiktokOrder.status)) {
      const { autoIssueDocument } = await import('@/lib/invoice-service');
      autoIssueDocument(existing.id, companyId).catch(() => {});
    }

    // Stock deduction when order ships
    if (['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(tiktokOrder.status) && existing.warehouse_id) {
      const wasPreShip = ['new', 'ready_to_ship', 'processing'].includes(existing.order_status);
      if (wasPreShip) {
        try {
          const stockConfig = await getStockConfig(companyId);
          if (stockConfig.stockEnabled) {
            const { data: orderItems } = await supabaseAdmin
              .from('order_items')
              .select('id, variation_id, quantity')
              .eq('order_id', existing.id);
            for (const oi of (orderItems || [])) {
              if (!oi.variation_id) continue;
              try {
                await deductAndUnreserve({
                  supabase: supabaseAdmin,
                  companyId,
                  warehouseId: existing.warehouse_id,
                  variationId: oi.variation_id,
                  qty: Number(oi.quantity),
                  referenceType: 'order',
                  referenceId: existing.id,
                  notes: `TikTok shipped: ${tiktokOrder.id}`,
                });
              } catch (stockErr) {
                console.error(`[TikTok Sync] Stock deduct error for ${tiktokOrder.id}:`, stockErr);
              }
            }
          }
        } catch (stockErr) {
          console.error(`[TikTok Sync] Stock deduction failed for ${tiktokOrder.id}:`, stockErr);
        }
      }
    }

    // Stock return for cancelled orders
    if (tiktokOrder.status === 'CANCELLED' && existing.warehouse_id) {
      await returnStockForCancelledOrder(companyId, existing.id, existing.warehouse_id, existing.order_status, tiktokOrder.id);
    }
  }

  // Repair: if status matches but internal mapping is wrong
  if (!statusUpdated) {
    const expectedMapping = mapTikTokStatus(tiktokOrder.status);
    if (existing.order_status !== expectedMapping.order_status) {
      const shouldBeShipped = ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(tiktokOrder.status);
      const repairUpdate: Record<string, unknown> = {
        order_status: expectedMapping.order_status,
        payment_status: expectedMapping.payment_status,
        updated_at: new Date().toISOString(),
      };
      if (shouldBeShipped) {
        repairUpdate.fulfillment_status = 'shipped';
        repairUpdate.shipped_at = new Date().toISOString();
      }
      await supabaseAdmin.from('orders').update(repairUpdate).eq('id', existing.id);
      statusUpdated = true;
    }
  }

  // Repair created_at to match TikTok's create_time
  const tiktokCreatedAt = new Date(tiktokOrder.create_time * 1000).toISOString();
  if (existing.external_data === null || !('create_time' in (existing.external_data as any || {}))) {
    await supabaseAdmin.from('orders').update({ created_at: tiktokCreatedAt }).eq('id', existing.id);
  }

  return { action: statusUpdated ? 'updated' : 'skipped', productsCreated: 0, customersCreated: 0 };
}

// --- Create new order ---

async function createNewOrder(
  account: TikTokAccountRow,
  creds: TikTokCredentials,
  tiktokOrder: TikTokOrder,
  order_status: string,
  payment_status: string
): Promise<UpsertResult> {
  const companyId = account.company_id;

  // Find or create customer
  const { customerId, isNewCustomer, shippingAddressId } = await findOrCreateCustomer(companyId, tiktokOrder);

  // Use TikTok order ID as order number
  const orderNumber = tiktokOrder.id;

  // Match items with products/variations
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
  }[] = [];

  for (const item of tiktokOrder.line_items || []) {
    const qty = 1; // TikTok line items are per-unit
    const price = parseFloat(item.sale_price || item.original_price || '0');
    const total = qty * price;
    subtotal += total;

    const sku = item.seller_sku || '';
    const itemName = item.sku_name
      ? `${item.product_name} - ${item.sku_name}`
      : item.product_name;

    const matched = await findOrCreateVariationBySku(companyId, sku, itemName, price, {
      tiktokProductId: item.product_id,
      tiktokSkuId: item.sku_id,
      skuImage: item.sku_image,
      accountId: account.id,
      accountName: account.shop_name ?? undefined,
    });

    if (matched.isNewProduct) newlyCreatedProductIds.push(matched.product_id);
    if (matched.isNewVariation) newlyCreatedVariationIds.push(matched.variation_id);

    // Upsert marketplace link
    try {
      await supabaseAdmin.from('marketplace_product_links').upsert({
        company_id: companyId,
        account_id: account.id,
        account_name: account.shop_name || '',
        platform: 'tiktok',
        product_id: matched.product_id,
        variation_id: matched.variation_id || null,
        external_item_id: item.product_id,
        external_model_id: item.sku_id || '0',
        external_sku: sku,
        platform_product_name: item.product_name,
        platform_primary_image: item.sku_image || null,
        platform_price: price || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'account_id,external_item_id,external_model_id',
      });
    } catch (linkErr) {
      console.error(`[TikTok Sync] Failed to upsert marketplace link for item ${item.product_id}:`, linkErr);
    }

    resolvedItems.push({
      variation_id: matched.variation_id,
      product_id: matched.product_id,
      product_code: matched.product_code,
      product_name: itemName,
      qty,
      price,
      total,
    });
  }

  const totalAmount = parseFloat(tiktokOrder.payment?.total_amount || '0') || subtotal;
  const shippingFee = parseFloat(tiktokOrder.payment?.shipping_fee || '0');

  // Build notes
  const orderNotes = tiktokOrder.buyer_message
    ? `TikTok: ${tiktokOrder.id}\nข้อความจากผู้ซื้อ: ${tiktokOrder.buyer_message}`
    : `TikTok: ${tiktokOrder.id}`;

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

  // Extract tracking/carrier
  const tracking = tiktokOrder.tracking_number ||
    tiktokOrder.line_items?.find(li => li.tracking_number)?.tracking_number || null;
  const carrier = tiktokOrder.shipping_provider ||
    tiktokOrder.line_items?.find(li => li.shipping_provider_name)?.shipping_provider_name || null;

  // Create order
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .insert({
      company_id: companyId,
      order_number: orderNumber,
      customer_id: customerId,
      order_date: new Date(tiktokOrder.create_time * 1000).toISOString().split('T')[0],
      subtotal: totalAmount,
      vat_amount: 0,
      discount_amount: Math.max(0, subtotal - totalAmount),
      shipping_fee: shippingFee,
      total_amount: totalAmount,
      payment_method: 'tiktok',
      payment_status,
      order_status,
      source: 'tiktok',
      external_order_sn: tiktokOrder.id,
      marketplace_account_id: account.id,
      external_status: tiktokOrder.status,
      external_data: tiktokOrder as unknown as Record<string, unknown>,
      warehouse_id: warehouseId,
      notes: orderNotes,
      delivery_date: tiktokOrder.rts_sla_time
        ? new Date(tiktokOrder.rts_sla_time * 1000).toISOString().split('T')[0]
        : null,
      shipping_carrier: carrier,
      tracking_number: tracking,
      flow_type: 'r_retail', // Marketplace orders always use retail flow
      created_at: new Date(tiktokOrder.create_time * 1000).toISOString(),
    })
    .select()
    .single();

  if (orderError) {
    // Rollback newly created resources
    if (newlyCreatedVariationIds.length > 0) {
      await supabaseAdmin.from('product_variations').delete().in('id', newlyCreatedVariationIds);
    }
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
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  // Fetch WAC cost map
  const costMap = await fetchCostMap(
    supabaseAdmin,
    resolvedItems.map(i => i.variation_id).filter((v): v is string => !!v),
  );

  // Create order items
  const orderItemsToInsert = resolvedItems.map(item => ({
    company_id: companyId,
    order_id: order.id,
    variation_id: item.variation_id,
    product_id: item.product_id,
    product_code: item.product_code,
    product_name: item.product_name,
    quantity: item.qty,
    unit_price: item.price,
    unit_cost: item.variation_id ? (costMap[item.variation_id] || null) : null,
    discount_percent: 0,
    discount_amount: 0,
    discount_type: 'percent',
    subtotal: item.total,
    total: item.total,
  }));
  await supabaseAdmin.from('order_items').insert(orderItemsToInsert);

  // Reserve stock
  if (warehouseId) {
    try {
      const stockConfig = await getStockConfig(companyId);
      if (stockConfig.stockEnabled) {
        for (const item of resolvedItems) {
          if (item.variation_id) {
            await reserveStockService({
              supabase: supabaseAdmin,
              companyId,
              warehouseId,
              variationId: item.variation_id,
              qty: item.qty,
              referenceType: 'order',
              referenceId: order.id,
              notes: `TikTok order: ${tiktokOrder.id}`,
            });
          }
        }
      }
    } catch (stockErr) {
      console.error(`[TikTok Sync] Stock reservation error for ${tiktokOrder.id}:`, stockErr);
    }
  }

  // Create order shipments
  if (shippingAddressId) {
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
        shipping_fee: idx === 0 ? shippingFee : 0,
        delivery_status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      await supabaseAdmin.from('order_shipments').insert(shipmentsToInsert);
    }
  }

  // Auto-issue document if already past AWAITING_SHIPMENT
  if (['AWAITING_COLLECTION', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(tiktokOrder.status)) {
    const { autoIssueDocument } = await import('@/lib/invoice-service');
    autoIssueDocument(order.id, companyId).catch(() => {});
  }

  return {
    action: 'created',
    productsCreated: newlyCreatedProductIds.length,
    customersCreated: isNewCustomer ? 1 : 0,
  };
}

// --- Helper: Find or create customer ---

async function findOrCreateCustomer(
  companyId: string,
  tiktokOrder: TikTokOrder
): Promise<{ customerId: string; isNewCustomer: boolean; shippingAddressId: string | null }> {
  const addr = tiktokOrder.recipient_address;
  const buyerName = addr?.name || `TikTok User ${tiktokOrder.user_id}`;
  const buyerPhone = addr?.phone_number?.replace(/[^\d+]/g, '') || '';

  // Try to find existing customer by phone or name
  let customerId = '';
  let isNewCustomer = false;

  if (buyerPhone) {
    const { data: byPhone } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('phone', buyerPhone)
      .limit(1)
      .maybeSingle();
    if (byPhone) customerId = byPhone.id;
  }

  if (!customerId) {
    // No existing customer found — create new
    const { data: newCustomer, error } = await supabaseAdmin
      .from('customers')
      .insert({
        company_id: companyId,
        name: buyerName,
        phone: buyerPhone || null,
        customer_type: 'retail',
        source: 'tiktok',
        notes: `TikTok User ID: ${tiktokOrder.user_id}`,
      })
      .select('id')
      .single();

    if (error || !newCustomer) {
      throw new Error(`Failed to create customer: ${error?.message}`);
    }
    customerId = newCustomer.id;
    isNewCustomer = true;
  }

  // Create/update shipping address
  let shippingAddressId: string | null = null;
  if (addr) {
    const fullAddress = addr.full_address || [addr.address_line1, addr.address_line2, addr.address_detail].filter(Boolean).join(' ');

    const { data: existingAddr } = await supabaseAdmin
      .from('shipping_addresses')
      .select('id')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .limit(1)
      .maybeSingle();

    if (existingAddr) {
      shippingAddressId = existingAddr.id;
      await supabaseAdmin
        .from('shipping_addresses')
        .update({
          recipient_name: buyerName,
          phone: buyerPhone || null,
          address: fullAddress,
          postal_code: addr.postal_code || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingAddr.id);
    } else {
      const { data: newAddr } = await supabaseAdmin
        .from('shipping_addresses')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          recipient_name: buyerName,
          phone: buyerPhone || null,
          address: fullAddress,
          postal_code: addr.postal_code || null,
          is_default: true,
        })
        .select('id')
        .single();
      shippingAddressId = newAddr?.id || null;
    }
  }

  return { customerId, isNewCustomer, shippingAddressId };
}

// --- Helper: Find or create variation by SKU ---

async function findOrCreateVariationBySku(
  companyId: string,
  sku: string,
  itemName: string,
  price: number,
  tiktokInfo: {
    tiktokProductId: string;
    tiktokSkuId: string;
    skuImage: string;
    accountId: string;
    accountName?: string;
  }
): Promise<{
  variation_id: string;
  product_id: string;
  product_code: string;
  isNewProduct: boolean;
  isNewVariation: boolean;
}> {
  // 1. Try marketplace_product_links
  const { data: link } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, variation_id')
    .eq('account_id', tiktokInfo.accountId)
    .eq('external_item_id', tiktokInfo.tiktokProductId)
    .eq('external_model_id', tiktokInfo.tiktokSkuId || '0')
    .limit(1)
    .maybeSingle();

  if (link?.variation_id) {
    const { data: variation } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, sku')
      .eq('id', link.variation_id)
      .single();
    if (variation) {
      return {
        variation_id: variation.id,
        product_id: variation.product_id,
        product_code: variation.sku || '',
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 2. Try SKU match
  if (sku) {
    const { data: bySkuVar } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, sku')
      .eq('company_id', companyId)
      .eq('sku', sku)
      .limit(1)
      .maybeSingle();
    if (bySkuVar) {
      return {
        variation_id: bySkuVar.id,
        product_id: bySkuVar.product_id,
        product_code: bySkuVar.sku || '',
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 3. Try product code match
  if (sku) {
    const { data: byCodeProduct } = await supabaseAdmin
      .from('products')
      .select('id, product_code, product_variations!inner(id, sku)')
      .eq('company_id', companyId)
      .eq('product_code', sku)
      .limit(1)
      .maybeSingle();
    if (byCodeProduct?.product_variations?.[0]) {
      const pv = byCodeProduct.product_variations[0] as any;
      return {
        variation_id: pv.id,
        product_id: byCodeProduct.id,
        product_code: byCodeProduct.product_code || '',
        isNewProduct: false,
        isNewVariation: false,
      };
    }
  }

  // 4. Create new product + variation
  const productName = itemName.split(' - ')[0] || itemName;
  const productCode = sku || `TT-${tiktokInfo.tiktokProductId}`;

  const { data: newProduct, error: productErr } = await supabaseAdmin
    .from('products')
    .insert({
      company_id: companyId,
      product_name: productName,
      product_code: productCode,
      price,
      is_active: true,
      source: 'tiktok',
    })
    .select('id, product_code')
    .single();

  if (productErr || !newProduct) {
    throw new Error(`Failed to create product: ${productErr?.message}`);
  }

  const variationLabel = itemName.includes(' - ') ? itemName.split(' - ').slice(1).join(' - ') : null;

  const { data: newVariation, error: varErr } = await supabaseAdmin
    .from('product_variations')
    .insert({
      company_id: companyId,
      product_id: newProduct.id,
      sku: sku || productCode,
      variation_label: variationLabel || productName,
      price,
      is_active: true,
    })
    .select('id, sku')
    .single();

  if (varErr || !newVariation) {
    throw new Error(`Failed to create variation: ${varErr?.message}`);
  }

  // Upload image if available
  if (tiktokInfo.skuImage) {
    try {
      await supabaseAdmin.from('product_images').insert({
        company_id: companyId,
        product_id: newProduct.id,
        variation_id: newVariation.id,
        image_url: tiktokInfo.skuImage,
        sort_order: 0,
      });
    } catch { /* non-blocking */ }
  }

  console.log(`[TikTok Sync] Created product: ${productName} (${productCode})`);

  return {
    variation_id: newVariation.id,
    product_id: newProduct.id,
    product_code: newProduct.product_code || '',
    isNewProduct: true,
    isNewVariation: true,
  };
}

// --- Helper: Return stock for cancelled order ---

async function returnStockForCancelledOrder(
  companyId: string,
  orderId: string,
  warehouseId: string,
  previousOrderStatus: string,
  tiktokOrderId: string
) {
  // Only return stock if order was past the reservation stage
  if (!['ready_to_ship', 'processing', 'shipping'].includes(previousOrderStatus)) return;

  try {
    const stockConfig = await getStockConfig(companyId);
    if (!stockConfig.stockEnabled) return;

    const { data: orderItems } = await supabaseAdmin
      .from('order_items')
      .select('id, variation_id, quantity')
      .eq('order_id', orderId);

    for (const oi of (orderItems || [])) {
      if (!oi.variation_id) continue;
      try {
        await returnStockService({
          supabase: supabaseAdmin,
          companyId,
          warehouseId,
          variationId: oi.variation_id,
          qty: Number(oi.quantity),
          referenceType: 'order',
          referenceId: orderId,
          notes: `TikTok cancelled: ${tiktokOrderId}`,
        });
      } catch (err) {
        console.error(`[TikTok Sync] Stock return error for ${tiktokOrderId} item ${oi.variation_id}:`, err);
      }
    }
    console.log(`[TikTok Sync] Stock returned for cancelled order ${tiktokOrderId}`);
  } catch (err) {
    console.error(`[TikTok Sync] Stock return failed for ${tiktokOrderId}:`, err);
  }
}
