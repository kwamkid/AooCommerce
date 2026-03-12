/**
 * Shopee Deal API Wrapper
 * - Bundle Deal APIs (for bundle_set + qty_discount)
 * - Add-on Deal APIs (for buy_get_free + buy_get_discount)
 *
 * NOTE: shopeeApiRequest() already unwraps `data.response`, so `result.data`
 * is the inner response object directly.
 *
 * All mutation + read APIs use POST with JSON body.
 */

import { ShopeeCredentials, shopeeApiRequest } from './api';

// ─── Types ──────────────────────────────────────────────

export interface BundleDealParams {
  name: string;
  rule_type: 1 | 2 | 3; // FIX_PRICE=1, DISCOUNT_PERCENTAGE=2, DISCOUNT_VALUE=3
  fix_price?: number;
  discount_percentage?: number;
  discount_value?: number;
  min_amount: number;
  start_time: number; // unix timestamp
  end_time: number;
  purchase_limit?: number;
  additional_tiers?: {
    min_amount: number;
    fix_price?: number;
    discount_percentage?: number;
    discount_value?: number;
  }[];
}

export interface AddOnDealParams {
  add_on_deal_name: string;
  start_time: number;
  end_time: number;
  promotion_type: 0 | 1; // 0=add_on_discount, 1=gift_with_min_spend
  purchase_min_spend?: number;
  per_gift_num?: number;
  promotion_purchase_limit?: number;
}

export interface BundleDealItem {
  item_id: number;
  status: 0 | 1; // 0=disable, 1=enable
}

export interface AddOnDealMainItem {
  item_id: number;
  status: 1 | 2; // 1=enable, 2=disable
}

export interface AddOnDealSubItem {
  item_id: number;
  model_id?: number;
  status: 1 | 2;
  sub_item_input_price?: number;
  sub_item_limit?: number;
}

// ─── Bundle Deal APIs ───────────────────────────────────

/**
 * Create a Bundle Deal.
 * rule_type: 1=FIX_PRICE, 2=DISCOUNT_PERCENTAGE, 3=DISCOUNT_VALUE
 * Max 3 tiers (1 base + 2 additional), max 1000 items.
 */
export async function createBundleDeal(
  creds: ShopeeCredentials,
  params: BundleDealParams,
): Promise<{ bundle_deal_id: number }> {
  const body: Record<string, unknown> = {
    name: params.name,
    rule_type: params.rule_type,
    min_amount: params.min_amount,
    start_time: params.start_time,
    end_time: params.end_time,
    purchase_limit: params.purchase_limit || 1,
  };

  if (params.rule_type === 1 && params.fix_price != null) {
    body.fix_price = params.fix_price;
  }
  if (params.rule_type === 2 && params.discount_percentage != null) {
    body.discount_percentage = params.discount_percentage;
  }
  if (params.rule_type === 3 && params.discount_value != null) {
    body.discount_value = params.discount_value;
  }

  if (params.additional_tiers && params.additional_tiers.length > 0) {
    body.additional_tiers = params.additional_tiers;
  }

  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/add_bundle_deal', {}, body,
  );

  if (error) {
    throw new Error(`Shopee createBundleDeal: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { bundle_deal_id?: number } | null;
  return { bundle_deal_id: resp?.bundle_deal_id || 0 };
}

/**
 * Add items to a Bundle Deal.
 * status: 1=enable, 0=disable. Max 1000 items per deal.
 */
export async function addBundleDealItems(
  creds: ShopeeCredentials,
  bundleDealId: number,
  items: BundleDealItem[],
): Promise<{ failed_list: { item_id: number; fail_error: string; fail_message: string }[] }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/add_bundle_deal_item',
    {}, {
      bundle_deal_id: bundleDealId,
      item_list: items,
    },
  );

  if (error) {
    throw new Error(`Shopee addBundleDealItems: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { failed_list?: { item_id: number; fail_error: string; fail_message: string }[] } | null;
  return { failed_list: resp?.failed_list || [] };
}

/**
 * Get Bundle Deal list.
 * time_status: 1=all, 2=upcoming, 3=ongoing, 4=expired
 */
export async function getBundleDealList(
  creds: ShopeeCredentials,
  timeStatus: 1 | 2 | 3 | 4 = 1,
  pageNo: number = 1,
  pageSize: number = 100,
): Promise<{ bundle_deal_list: { bundle_deal_id: number; name: string; start_time: number; end_time: number }[]; more: boolean }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/bundle_deal/get_bundle_deal_list',
    { time_status: timeStatus, page_no: pageNo, page_size: pageSize },
  );

  if (error) {
    throw new Error(`Shopee getBundleDealList: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { bundle_deal_list?: unknown[]; more?: boolean } | null;
  return {
    bundle_deal_list: (resp?.bundle_deal_list || []) as { bundle_deal_id: number; name: string; start_time: number; end_time: number }[],
    more: resp?.more || false,
  };
}

/**
 * Get Bundle Deal detail.
 */
export async function getBundleDeal(
  creds: ShopeeCredentials,
  bundleDealId: number,
): Promise<unknown> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/bundle_deal/get_bundle_deal',
    { bundle_deal_id: bundleDealId },
  );

  if (error) {
    throw new Error(`Shopee getBundleDeal: ${error} — ${debug_message || ''}`);
  }

  return data;
}

/**
 * Get items in a Bundle Deal.
 */
export async function getBundleDealItems(
  creds: ShopeeCredentials,
  bundleDealId: number,
): Promise<{ item_list: { item_id: number; status: number }[]; total_count: number }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/bundle_deal/get_bundle_deal_item',
    { bundle_deal_id: bundleDealId },
  );

  if (error) {
    throw new Error(`Shopee getBundleDealItems: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { item_list?: { item_id: number; status: number }[]; total_count?: number } | null;
  return {
    item_list: resp?.item_list || [],
    total_count: resp?.total_count || 0,
  };
}

/**
 * Update Bundle Deal settings.
 * Cannot change rule_type/pricing if deal has enabled items (ongoing).
 */
export async function updateBundleDeal(
  creds: ShopeeCredentials,
  bundleDealId: number,
  updates: Partial<BundleDealParams>,
): Promise<void> {
  const body: Record<string, unknown> = {
    bundle_deal_id: bundleDealId,
  };
  if (updates.name != null) body.name = updates.name;
  if (updates.start_time != null) body.start_time = updates.start_time;
  if (updates.end_time != null) body.end_time = updates.end_time;
  if (updates.purchase_limit != null) body.purchase_limit = updates.purchase_limit;
  if (updates.fix_price != null) body.fix_price = updates.fix_price;
  if (updates.discount_percentage != null) body.discount_percentage = updates.discount_percentage;
  if (updates.discount_value != null) body.discount_value = updates.discount_value;
  if (updates.min_amount != null) body.min_amount = updates.min_amount;
  if (updates.additional_tiers) body.additional_tiers = updates.additional_tiers;

  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/update_bundle_deal', {}, body,
  );

  if (error) {
    throw new Error(`Shopee updateBundleDeal: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Update items in a Bundle Deal (enable/disable).
 */
export async function updateBundleDealItems(
  creds: ShopeeCredentials,
  bundleDealId: number,
  items: BundleDealItem[],
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/update_bundle_deal_item',
    {}, {
      bundle_deal_id: bundleDealId,
      item_list: items,
    },
  );

  if (error) {
    throw new Error(`Shopee updateBundleDealItems: ${error} — ${debug_message || ''}`);
  }
}

/**
 * End an ongoing Bundle Deal (makes it expired).
 */
export async function endBundleDeal(
  creds: ShopeeCredentials,
  bundleDealId: number,
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/end_bundle_deal',
    {}, { bundle_deal_id: bundleDealId },
  );

  if (error) {
    throw new Error(`Shopee endBundleDeal: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Delete an upcoming Bundle Deal.
 * Only upcoming (not yet started) deals can be deleted.
 */
export async function deleteBundleDeal(
  creds: ShopeeCredentials,
  bundleDealId: number,
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/delete_bundle_deal',
    {}, { bundle_deal_id: bundleDealId },
  );

  if (error) {
    throw new Error(`Shopee deleteBundleDeal: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Remove items from a Bundle Deal.
 */
export async function deleteBundleDealItems(
  creds: ShopeeCredentials,
  bundleDealId: number,
  itemIds: number[],
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/bundle_deal/delete_bundle_deal_item',
    {}, {
      bundle_deal_id: bundleDealId,
      item_list: itemIds.map(id => ({ item_id: id })),
    },
  );

  if (error) {
    throw new Error(`Shopee deleteBundleDealItems: ${error} — ${debug_message || ''}`);
  }
}

// ─── Add-on Deal APIs ───────────────────────────────────

/**
 * Create an Add-on Deal.
 * promotion_type: 0=add-on discount, 1=gift with min spend
 */
export async function createAddOnDeal(
  creds: ShopeeCredentials,
  params: AddOnDealParams,
): Promise<{ add_on_deal_id: number }> {
  const body: Record<string, unknown> = {
    add_on_deal_name: params.add_on_deal_name,
    start_time: params.start_time,
    end_time: params.end_time,
    promotion_type: params.promotion_type,
  };

  if (params.purchase_min_spend != null) {
    body.purchase_min_spend = params.purchase_min_spend;
  }
  if (params.per_gift_num != null) {
    body.per_gift_num = params.per_gift_num;
  }
  if (params.promotion_purchase_limit != null) {
    body.promotion_purchase_limit = params.promotion_purchase_limit;
  }

  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/add_add_on_deal', {}, body,
  );

  if (error) {
    throw new Error(`Shopee createAddOnDeal: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { add_on_deal_id?: number } | null;
  return { add_on_deal_id: resp?.add_on_deal_id || 0 };
}

/**
 * Add main items (trigger items) to an Add-on Deal.
 * status: 1=enable, 2=disable. Max 1000 main items.
 */
export async function addAddOnDealMainItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
  items: AddOnDealMainItem[],
): Promise<{ main_item_list: Array<{ item_id: number; status: number | null; fail_error: string | null; fail_message: string | null }> }> {
  const { error, debug_message, data } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/add_add_on_deal_main_item',
    {}, {
      add_on_deal_id: addOnDealId,
      main_item_list: items,
    },
  );

  if (error) {
    throw new Error(`Shopee addAddOnDealMainItems: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { main_item_list?: Array<{ item_id: number; status: number | null; fail_error: string | null; fail_message: string | null }> } | null;
  return { main_item_list: resp?.main_item_list || [] };
}

/**
 * Add sub items (gifts/discounted) to an Add-on Deal.
 * Requires model_id + fixed price. Max 100 sub items.
 */
export async function addAddOnDealSubItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
  items: AddOnDealSubItem[],
): Promise<{ sub_item_list: { item_id: number; status: number; fail_error?: string; fail_message?: string }[] }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/add_add_on_deal_sub_item',
    {}, {
      add_on_deal_id: addOnDealId,
      sub_item_list: items,
    },
  );

  if (error) {
    throw new Error(`Shopee addAddOnDealSubItems: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { sub_item_list?: unknown[] } | null;
  return {
    sub_item_list: (resp?.sub_item_list || []) as { item_id: number; status: number; fail_error?: string; fail_message?: string }[],
  };
}

/**
 * Update Add-on Deal settings.
 * end_time can only be moved earlier for ongoing deals.
 */
export async function updateAddOnDeal(
  creds: ShopeeCredentials,
  addOnDealId: number,
  updates: Partial<AddOnDealParams>,
): Promise<void> {
  const body: Record<string, unknown> = {
    add_on_deal_id: addOnDealId,
  };
  if (updates.add_on_deal_name != null) body.add_on_deal_name = updates.add_on_deal_name;
  if (updates.start_time != null) body.start_time = updates.start_time;
  if (updates.end_time != null) body.end_time = updates.end_time;
  if (updates.purchase_min_spend != null) body.purchase_min_spend = updates.purchase_min_spend;
  if (updates.per_gift_num != null) body.per_gift_num = updates.per_gift_num;
  if (updates.promotion_purchase_limit != null) body.promotion_purchase_limit = updates.promotion_purchase_limit;

  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/update_add_on_deal', {}, body,
  );

  if (error) {
    throw new Error(`Shopee updateAddOnDeal: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Get Add-on Deal list.
 * promotion_status: "all" | "ongoing" | "upcoming" | "expired"
 */
export async function getAddOnDealList(
  creds: ShopeeCredentials,
  promotionStatus: string = 'all',
  pageNo: number = 1,
  pageSize: number = 100,
): Promise<{ add_on_deal_list: unknown[]; more: boolean }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/add_on_deal/get_add_on_deal_list',
    { promotion_status: promotionStatus, page_no: pageNo, page_size: pageSize },
  );

  if (error) {
    throw new Error(`Shopee getAddOnDealList: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { add_on_deal_list?: unknown[]; more?: boolean } | null;
  return {
    add_on_deal_list: resp?.add_on_deal_list || [],
    more: resp?.more || false,
  };
}

/**
 * Get Add-on Deal detail.
 */
export async function getAddOnDeal(
  creds: ShopeeCredentials,
  addOnDealId: number,
): Promise<unknown> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/add_on_deal/get_add_on_deal',
    { add_on_deal_id: addOnDealId },
  );

  if (error) {
    throw new Error(`Shopee getAddOnDeal: ${error} — ${debug_message || ''}`);
  }

  return data;
}

/**
 * Get main items in an Add-on Deal.
 */
export async function getAddOnDealMainItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
): Promise<{ main_item_list: { item_id: number; status: number }[] }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/add_on_deal/get_add_on_deal_main_item',
    { add_on_deal_id: addOnDealId },
  );

  if (error) {
    throw new Error(`Shopee getAddOnDealMainItems: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { main_item_list?: { item_id: number; status: number }[] } | null;
  return { main_item_list: resp?.main_item_list || [] };
}

/**
 * Get sub items in an Add-on Deal.
 */
export async function getAddOnDealSubItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
): Promise<{ sub_item_list: { item_id: number; model_id: number; status: number; sub_item_input_price: number; sub_item_limit: number }[] }> {
  const { data, error, debug_message } = await shopeeApiRequest(
    creds, 'GET', '/api/v2/add_on_deal/get_add_on_deal_sub_item',
    { add_on_deal_id: addOnDealId },
  );

  if (error) {
    throw new Error(`Shopee getAddOnDealSubItems: ${error} — ${debug_message || ''}`);
  }

  const resp = data as { sub_item_list?: unknown[] } | null;
  return {
    sub_item_list: (resp?.sub_item_list || []) as { item_id: number; model_id: number; status: number; sub_item_input_price: number; sub_item_limit: number }[],
  };
}

/**
 * Update main items in an Add-on Deal (enable/disable).
 */
export async function updateAddOnDealMainItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
  items: AddOnDealMainItem[],
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/update_add_on_deal_main_item',
    {}, {
      add_on_deal_id: addOnDealId,
      main_item_list: items,
    },
  );

  if (error) {
    throw new Error(`Shopee updateAddOnDealMainItems: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Update sub items in an Add-on Deal (price, limit, enable/disable).
 */
export async function updateAddOnDealSubItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
  items: AddOnDealSubItem[],
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/update_add_on_deal_sub_item',
    {}, {
      add_on_deal_id: addOnDealId,
      sub_item_list: items,
    },
  );

  if (error) {
    throw new Error(`Shopee updateAddOnDealSubItems: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Delete an Add-on Deal.
 * Only upcoming (not yet started) deals can be deleted.
 */
export async function deleteAddOnDeal(
  creds: ShopeeCredentials,
  addOnDealId: number,
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/delete_add_on_deal',
    {}, { add_on_deal_id: addOnDealId },
  );

  if (error) {
    throw new Error(`Shopee deleteAddOnDeal: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Delete main items from an Add-on Deal.
 * API requires main_item_list as array of { item_id, status } objects.
 */
export async function deleteAddOnDealMainItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
  itemIds: number[],
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/delete_add_on_deal_main_item',
    {}, {
      add_on_deal_id: addOnDealId,
      main_item_list: itemIds.map(id => ({ item_id: id, status: 2 })),
    },
  );

  if (error) {
    throw new Error(`Shopee deleteAddOnDealMainItems: ${error} — ${debug_message || ''}`);
  }
}

/**
 * Delete sub items from an Add-on Deal.
 * Requires item_id + model_id pairs.
 */
export async function deleteAddOnDealSubItems(
  creds: ShopeeCredentials,
  addOnDealId: number,
  subItems: { item_id: number; model_id: number }[],
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/delete_add_on_deal_sub_item',
    {}, {
      add_on_deal_id: addOnDealId,
      sub_item_list: subItems,
    },
  );

  if (error) {
    throw new Error(`Shopee deleteAddOnDealSubItems: ${error} — ${debug_message || ''}`);
  }
}

/**
 * End an ongoing Add-on Deal (makes it expired).
 */
export async function endAddOnDeal(
  creds: ShopeeCredentials,
  addOnDealId: number,
): Promise<void> {
  const { error, debug_message } = await shopeeApiRequest(
    creds, 'POST', '/api/v2/add_on_deal/end_add_on_deal',
    {}, { add_on_deal_id: addOnDealId },
  );

  if (error) {
    throw new Error(`Shopee endAddOnDeal: ${error} — ${debug_message || ''}`);
  }
}
