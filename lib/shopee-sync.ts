import { supabaseAdmin } from '@/lib/supabase-admin';
import { shopeeApiRequest, ensureValidToken, ShopeeAccountRow } from '@/lib/shopee-api';

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
export async function syncOrdersByOrderSn(
  account: ShopeeAccountRow,
  orderSns: string[]
): Promise<{ created: number; updated: number; errors: string[] }> {
  const creds = await ensureValidToken(account);
  const result = { created: 0, updated: 0, errors: [] as string[] };

  // Fetch order details in batches of 50
  for (let i = 0; i < orderSns.length; i += 50) {
    const batch = orderSns.slice(i, i + 50);
    try {
      const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_detail', {
        order_sn_list: batch.join(','),
        response_optional_fields: 'buyer_user_id,buyer_username,recipient_address,item_list,pay_time,shipping_carrier,tracking_number,total_amount,payment_method',
      });

      if (error) {
        result.errors.push(`Batch fetch error: ${error}`);
        continue;
      }

      const orders = (data as { order_list: ShopeeOrder[] })?.order_list || [];
      for (const shopeeOrder of orders) {
        try {
          const wasCreated = await upsertOrder(account, shopeeOrder);
          if (wasCreated) {
            result.created++;
          } else {
            result.updated++;
          }
        } catch (e) {
          result.errors.push(`Order ${shopeeOrder.order_sn}: ${e instanceof Error ? e.message : 'Unknown error'}`);
        }
      }
    } catch (e) {
      result.errors.push(`Batch error: ${e instanceof Error ? e.message : 'Unknown error'}`);
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
  timeTo: number
): Promise<{ created: number; updated: number; errors: string[] }> {
  const creds = await ensureValidToken(account);
  const result = { created: 0, updated: 0, errors: [] as string[] };
  const allOrderSns: string[] = [];

  // Paginate through order list
  let cursor = '';
  let hasMore = true;

  while (hasMore) {
    const params: Record<string, unknown> = {
      time_range_field: 'update_time',
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 100,
    };
    if (cursor) params.cursor = cursor;

    const { data, error } = await shopeeApiRequest(creds, 'GET', '/api/v2/order/get_order_list', params);

    if (error) {
      result.errors.push(`Order list error: ${error}`);
      break;
    }

    const response = data as {
      order_list: { order_sn: string; order_status: string }[];
      more: boolean;
      next_cursor: string;
    };

    for (const order of response.order_list || []) {
      allOrderSns.push(order.order_sn);
    }

    hasMore = response.more;
    cursor = response.next_cursor || '';
  }

  // Fetch full details and sync
  if (allOrderSns.length > 0) {
    const syncResult = await syncOrdersByOrderSn(account, allOrderSns);
    result.created = syncResult.created;
    result.updated = syncResult.updated;
    result.errors.push(...syncResult.errors);
  }

  // Update last_sync_at
  await supabaseAdmin
    .from('shopee_accounts')
    .update({ last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', account.id);

  return result;
}

// --- Upsert Logic ---

/**
 * Upsert a single Shopee order. Returns true if created, false if updated.
 */
async function upsertOrder(account: ShopeeAccountRow, shopeeOrder: ShopeeOrder): Promise<boolean> {
  const companyId = account.company_id;
  const { order_status, payment_status } = mapShopeeStatus(shopeeOrder.order_status);

  // Check if order already exists
  const { data: existing } = await supabaseAdmin
    .from('orders')
    .select('id, order_status, external_status')
    .eq('company_id', companyId)
    .eq('source', 'shopee')
    .eq('external_order_sn', shopeeOrder.order_sn)
    .single();

  if (existing) {
    // Only update if Shopee status changed
    if (existing.external_status !== shopeeOrder.order_status) {
      await supabaseAdmin
        .from('orders')
        .update({
          order_status,
          payment_status,
          external_status: shopeeOrder.order_status,
          external_data: shopeeOrder as unknown as Record<string, unknown>,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
    }
    return false;
  }

  // --- Create new order ---

  // Find or create customer
  const customerId = await findOrCreateShopeeCustomer(companyId, shopeeOrder);

  // Generate order number
  const { data: orderNumber } = await supabaseAdmin
    .rpc('generate_order_number', { p_company_id: companyId });

  // Calculate totals from items
  let subtotal = 0;
  const mappedItems = (shopeeOrder.item_list || []).map(item => {
    const qty = item.model_quantity_purchased || 1;
    const price = item.model_discounted_price || item.model_original_price || 0;
    const total = qty * price;
    subtotal += total;
    return { ...item, qty, price, total };
  });

  const totalAmount = shopeeOrder.total_amount || subtotal;

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
      shipping_fee: 0,
      total_amount: totalAmount,
      payment_method: 'shopee',
      payment_status,
      order_status,
      source: 'shopee',
      external_order_sn: shopeeOrder.order_sn,
      shopee_account_id: account.id,
      external_status: shopeeOrder.order_status,
      external_data: shopeeOrder as unknown as Record<string, unknown>,
      notes: `Shopee: ${shopeeOrder.order_sn}`,
    })
    .select()
    .single();

  if (orderError) {
    throw new Error(`Failed to create order: ${orderError.message}`);
  }

  // Create order items
  for (const item of mappedItems) {
    await supabaseAdmin
      .from('order_items')
      .insert({
        company_id: companyId,
        order_id: order.id,
        variation_id: null,
        product_id: null,
        product_code: item.model_sku || item.item_sku || `SHOPEE-${item.item_id}`,
        product_name: item.model_name
          ? `${item.item_name} - ${item.model_name}`
          : item.item_name,
        quantity: item.qty,
        unit_price: item.price,
        discount_percent: 0,
        discount_amount: 0,
        discount_type: 'percent',
        subtotal: item.total,
        total: item.total,
      });
  }

  return true;
}

// --- Customer Logic ---

/**
 * Find or create a customer for a Shopee buyer.
 */
async function findOrCreateShopeeCustomer(
  companyId: string,
  shopeeOrder: ShopeeOrder
): Promise<string> {
  const phone = shopeeOrder.recipient_address?.phone;
  const buyerName = shopeeOrder.recipient_address?.name || shopeeOrder.buyer_username || 'Shopee Buyer';

  // Try to find by phone
  if (phone) {
    const { data: existingByPhone } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('phone', phone)
      .limit(1)
      .single();
    if (existingByPhone) return existingByPhone.id;
  }

  // Generate customer code
  const { data: customerCode } = await supabaseAdmin
    .rpc('generate_customer_code', { p_company_id: companyId });

  // Create new customer
  const { data: newCustomer, error } = await supabaseAdmin
    .from('customers')
    .insert({
      company_id: companyId,
      customer_code: customerCode,
      name: buyerName,
      contact_person: shopeeOrder.recipient_address?.name || null,
      phone: phone || null,
      address: shopeeOrder.recipient_address?.full_address || null,
      province: shopeeOrder.recipient_address?.state || null,
      district: shopeeOrder.recipient_address?.district || null,
      amphoe: shopeeOrder.recipient_address?.city || null,
      postal_code: shopeeOrder.recipient_address?.zipcode || null,
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
  if (shopeeOrder.recipient_address?.full_address) {
    await supabaseAdmin
      .from('shipping_addresses')
      .insert({
        company_id: companyId,
        customer_id: newCustomer.id,
        address_name: 'ที่อยู่ Shopee',
        contact_person: shopeeOrder.recipient_address.name || null,
        phone: phone || null,
        address_line1: shopeeOrder.recipient_address.full_address,
        district: shopeeOrder.recipient_address.district || null,
        amphoe: shopeeOrder.recipient_address.city || null,
        province: shopeeOrder.recipient_address.state || null,
        postal_code: shopeeOrder.recipient_address.zipcode || null,
        is_default: true,
        is_active: true,
      });
  }

  return newCustomer.id;
}
