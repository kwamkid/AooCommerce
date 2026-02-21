import { supabaseAdmin } from '@/lib/supabase-admin';
import { shopeeApiRequest, ensureValidToken, ShopeeAccountRow, getItemEnrichment, ShopeeItemEnrichment, getEscrowDetail } from '@/lib/shopee-api';

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
}

// --- Status Mapping ---

function mapShopeeStatus(shopeeStatus: string): { order_status: string; payment_status: string } {
  switch (shopeeStatus) {
    case 'UNPAID':
      return { order_status: 'new', payment_status: 'pending' };
    case 'READY_TO_SHIP':
      return { order_status: 'new', payment_status: 'paid' };
    case 'PROCESSED':
    case 'SHIPPED':
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
  onProgress?: SyncProgressCallback
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
        response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,item_list,pay_time,shipping_carrier,tracking_number,total_amount,payment_method,estimated_shipping_fee,actual_shipping_fee,actual_shipping_fee_confirmed,note,buyer_cancel_reason,cancel_by,cancel_reason',
      });

      if (error) {
        result.errors.push(`Batch fetch error: ${error}`);
        processedCount += batch.length;
        continue;
      }

      const orders = (data as { order_list: ShopeeOrder[] })?.order_list || [];
      for (const shopeeOrder of orders) {
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
      }
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
    .from('shopee_accounts')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', account.id);

  console.log(`[Shopee Sync] Done: orders_created=${result.orders_created}, orders_updated=${result.orders_updated}, products_created=${result.products_created}, customers_created=${result.customers_created}, errors=${result.errors.length}`, result.errors.slice(0, 5));
  return result;
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
    .select('id, order_status, external_status, external_data, customer_id, created_at')
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

    // Update if Shopee status changed
    if (existing.external_status !== shopeeOrder.order_status) {
      // Calculate shipping fee from Shopee data
      const updatedShippingFee = shopeeOrder.actual_shipping_fee_confirmed
        ? (shopeeOrder.actual_shipping_fee || 0)
        : (shopeeOrder.estimated_shipping_fee || 0);

      await supabaseAdmin
        .from('orders')
        .update({
          order_status,
          payment_status,
          external_status: shopeeOrder.order_status,
          external_data: shopeeOrder as unknown as Record<string, unknown>,
          shipping_fee: updatedShippingFee,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

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

      // Fetch escrow detail for COMPLETED orders (fire-and-forget)
      if (shopeeOrder.order_status === 'COMPLETED') {
        fetchAndSaveEscrowDetail(account, shopeeOrder.order_sn, existing.id).catch(err => {
          console.error(`[Shopee Sync] Escrow fetch error for ${shopeeOrder.order_sn}:`, err);
        });
      }
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

    if (statusUpdated || productsRecreated > 0) {
      return { action: 'updated', productsCreated: productsRecreated, customersCreated: 0 };
    }
    return { action: 'skipped', productsCreated: 0, customersCreated: 0 };
  }

  // --- Create new order ---

  // Find or create customer (track if newly created for rollback)
  const { customerId, isNewCustomer, shippingAddressId } = await findOrCreateShopeeCustomer(companyId, shopeeOrder);

  // Use Shopee order_sn as order number (unique, traceable)
  const orderNumber = `SP-${shopeeOrder.order_sn}`;

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
    });

    // Track newly created resources for potential rollback
    if (matched.isNewProduct) newlyCreatedProductIds.push(matched.product_id);
    if (matched.isNewVariation) newlyCreatedVariationIds.push(matched.variation_id);

    // Upsert marketplace link so product is linked to Shopee item/model
    try {
      await supabaseAdmin.from('marketplace_product_links').upsert({
        company_id: companyId,
        platform: 'shopee',
        account_id: account.id,
        account_name: account.shop_name || '',
        product_id: matched.product_id,
        variation_id: matched.variation_id || null,
        external_item_id: String(item.item_id),
        external_model_id: String(item.model_id || 0),
        external_sku: item.model_sku || item.item_sku || '',
        // Note: do NOT set external_item_status from order_status — they are different fields
        platform_price: price || null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'account_id,external_item_id,external_model_id' });
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
      shopee_account_id: account.id,
      external_status: shopeeOrder.order_status,
      external_data: shopeeOrder as unknown as Record<string, unknown>,
      warehouse_id: warehouseId,
      notes: orderNotes,
      created_at: new Date(shopeeOrder.create_time * 1000).toISOString(),
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
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  // Create order items + reserve stock
  for (const item of resolvedItems) {
    await supabaseAdmin
      .from('order_items')
      .insert({
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
      });

    // Reserve stock if we have variation_id and warehouse
    if (item.variation_id && warehouseId) {
      await reserveStock(companyId, warehouseId, item.variation_id, item.qty, order.id, order.order_number);
    }
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
  imageUrl: string
): Promise<void> {
  if (!imageUrl) return;

  try {
    // Check if image already exists
    let query = supabaseAdmin
      .from('product_images')
      .select('id')
      .eq('image_url', imageUrl)
      .eq('company_id', companyId);

    if (productId) query = query.eq('product_id', productId);
    if (variationId) query = query.eq('variation_id', variationId);

    const { data: existing } = await query.limit(1).single();
    if (existing) return; // Already exists

    await supabaseAdmin
      .from('product_images')
      .insert({
        company_id: companyId,
        product_id: productId,
        variation_id: variationId,
        image_url: imageUrl,
        storage_path: 'shopee-external',
        sort_order: 0,
      });
  } catch (e) {
    console.error(`[Shopee Sync] Failed to insert product image:`, e);
  }
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
        // Insert all parent images
        if (shopeeInfo.parentImages.length > 0) {
          for (const img of shopeeInfo.parentImages) {
            await upsertProductImage(companyId, existingVariation.product_id, null, img);
          }
        } else {
          await upsertProductImage(companyId, existingVariation.product_id, null, parentImg);
        }
      }

      // Add variation image from order detail (per-item image)
      if (shopeeInfo.shopeeImageUrl) {
        await upsertProductImage(companyId, null, existingVariation.id, shopeeInfo.shopeeImageUrl);
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

      // Insert all parent product images into product_images table
      if (shopeeInfo.parentImages.length > 0) {
        for (const img of shopeeInfo.parentImages) {
          await upsertProductImage(companyId, parentId, null, img);
        }
      } else if (parentImg) {
        await upsertProductImage(companyId, parentId, null, parentImg);
      }

      console.log(`[Shopee Sync] Created variation parent "${shopeeInfo.shopeeItemName}" (code: ${parentCode}) → product_id=${parentId}, images=${shopeeInfo.parentImages.length}`);
    }

    // Check if this specific variation already exists under the parent
    const variationSku = sku || `${parentCode}-${shopeeInfo.shopeeModelId}`;
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
      await upsertProductImage(companyId, null, newVariation.id, shopeeInfo.shopeeImageUrl);
    }

    console.log(`[Shopee Sync] Created variation "${shopeeInfo.shopeeModelName}" (SKU: ${variationSku}) under parent "${shopeeInfo.shopeeItemName}"`);

    return {
      variation_id: newVariation.id,
      product_id: parentId,
      product_code: variationSku,
      isNewProduct: !existingParent,
      isNewVariation: true,
    };
  }

  // --- Simple Product ---
  const productCode = sku || `SP-${shopeeInfo.shopeeItemId || Date.now()}`;
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

    return {
      variation_id: existingVar?.id || existingSimple.id,
      product_id: existingSimple.id,
      product_code: productCode,
      isNewProduct: false,
      isNewVariation: false,
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

  // Insert all product images into product_images table
  if (shopeeInfo.parentImages.length > 0) {
    for (const img of shopeeInfo.parentImages) {
      await upsertProductImage(companyId, newProduct.id, null, img);
    }
  } else if (simpleImg) {
    await upsertProductImage(companyId, newProduct.id, null, simpleImg);
  }

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
      address: unmasked(addr?.full_address),
      province: unmasked(addr?.state),
      district: unmasked(addr?.district),
      amphoe: unmasked(addr?.city),
      postal_code: unmasked(addr?.zipcode),
      customer_type_new: 'retail',
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
