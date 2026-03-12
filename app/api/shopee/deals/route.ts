import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ensureValidToken, ShopeeAccountRow, getItemFullDetails, updateStock } from '@/lib/shopee/api';
import {
  type BundleDealParams,
  type AddOnDealSubItem,
  getBundleDeal,
  getAddOnDeal,
  createBundleDeal,
  addBundleDealItems,
  deleteBundleDeal,
  deleteBundleDealItems,
  endBundleDeal,
  updateBundleDeal,
  updateBundleDealItems,
  createAddOnDeal,
  addAddOnDealMainItems,
  addAddOnDealSubItems,
  deleteAddOnDeal,
  deleteAddOnDealMainItems,
  deleteAddOnDealSubItems,
  endAddOnDeal,
  updateAddOnDeal,
  updateAddOnDealMainItems,
  updateAddOnDealSubItems,
  getBundleDealItems,
  getAddOnDealMainItems,
  getAddOnDealSubItems,
} from '@/lib/shopee/deals';
import { logIntegration } from '@/lib/integration-logger';
import { exportProductToShopee, type ExportOptions } from '@/lib/shopee/product-export';
import { toShopeeRuleType, fromShopeeTimeStatus, deriveDealStatus, toShopeeDealType, getUnsyncStrategy, toBangkokTimestamp } from '@/lib/promotions/promotion-rules';
import { translateShopeeError, translateShopeeErrorSync } from '@/lib/shopee/errors';

// ─── Types ──────────────────────────────────────────────

interface PushStep {
  step: string;
  status: 'in_progress' | 'success' | 'error';
  message?: string;
  detail?: string;
}

interface CompletedStep {
  type: string;
  dealId?: number;
  itemIds?: number[];
}

// ─── POST /api/shopee/deals — Push promotion to Shopee ──

export async function POST(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { promotion_id, account_id, start_time, end_time } = body;

    if (!promotion_id || !account_id) {
      return NextResponse.json({ error: 'กรุณาเลือกโปรโมชั่นและร้านค้า' }, { status: 400 });
    }
    if (!start_time || !end_time) {
      return NextResponse.json({ error: 'กรุณาระบุวันเริ่มต้นและสิ้นสุด' }, { status: 400 });
    }

    // Fetch promotion with items
    const { data: promotion, error: promErr } = await supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('id', promotion_id)
      .eq('company_id', companyId)
      .single();

    if (promErr || !promotion) {
      return NextResponse.json({ error: 'ไม่พบโปรโมชั่น' }, { status: 404 });
    }

    const { data: items } = await supabaseAdmin
      .from('promotion_items')
      .select(`
        id, variation_id, product_id, role, quantity, special_price, sub_item_limit,
        product_variations(
          id, sku, variation_label, default_price,
          products!inner(id, name)
        )
      `)
      .eq('promotion_id', promotion_id)
      .order('sort_order');

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'โปรโมชั่นไม่มีสินค้า' }, { status: 400 });
    }

    // For product-level items (bundle_set, qty_discount, buy_get_free main): fetch product name if no variation join
    const isBundleSet = promotion.promotion_type === 'bundle_set';
    const isQtyDiscount = promotion.promotion_type === 'qty_discount';
    const isBuyGetFree = promotion.promotion_type === 'buy_get_free';
    const isBuyGetDiscount = promotion.promotion_type === 'buy_get_discount';
    const isAddOnDeal = isBuyGetFree || isBuyGetDiscount;
    if (isBundleSet || isQtyDiscount || isAddOnDeal) {
      for (const item of items) {
        if (!item.product_variations && item.product_id) {
          const { data: prod } = await supabaseAdmin
            .from('products')
            .select('id, name')
            .eq('id', item.product_id)
            .single();
          if (prod) {
            (item as any).product_variations = {
              id: item.product_id,
              default_price: 0,
              products: { id: prod.id, name: prod.name },
            };
          }
        }
      }
    }

    // Fetch account
    const { data: account } = await supabaseAdmin
      .from('marketplace_accounts')
      .select('*')
      .eq('id', account_id)
      .eq('company_id', companyId)
      .eq('platform', 'shopee')
      .single();

    if (!account) {
      return NextResponse.json({ error: 'ไม่พบบัญชี Shopee' }, { status: 404 });
    }

    // Get credentials
    const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);

    // SSE stream for progress
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const completedSteps: CompletedStep[] = [];
        const warnings: string[] = [];
        const startedAt = Date.now();
        let finalDealType = '';
        let finalDealId: number | undefined;

        const send = (step: PushStep) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(step)}\n\n`));
          } catch {
            // stream closed
          }
        };

        try {
          // ─── Step 1: Check products on Shopee (auto-export if missing) ───
          send({ step: 'check_products', status: 'in_progress', message: 'ตรวจสอบสินค้าบน Shopee...' });

          const itemShopeeIds: Map<string, number> = new Map(); // item_key → shopee_item_id

          for (const item of items) {
            const pv = item.product_variations as unknown as {
              id: string; products: { id: string; name: string };
            };
            // For product-level items, use product_id as key
            const isProductLevel = (isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id;
            const itemKey = isProductLevel
              ? item.product_id
              : item.variation_id;

            // Check marketplace_product_links
            // For product-level items: find any link for this product on this account
            let link: { external_item_id: string | null } | null = null;
            if (isProductLevel) {
              const { data: productLink } = await supabaseAdmin
                .from('marketplace_product_links')
                .select('external_item_id')
                .eq('product_id', item.product_id)
                .eq('account_id', account_id)
                .eq('platform', 'shopee')
                .not('external_item_id', 'is', null)
                .limit(1)
                .single();
              link = productLink;
            } else {
              // Try variation_id first
              const { data: varLink } = await supabaseAdmin
                .from('marketplace_product_links')
                .select('external_item_id')
                .eq('variation_id', item.variation_id)
                .eq('account_id', account_id)
                .eq('platform', 'shopee')
                .single();
              link = varLink;
              // Fallback: query by product_id if variation link not found
              if (!link?.external_item_id && item.product_id) {
                const { data: productFallback } = await supabaseAdmin
                  .from('marketplace_product_links')
                  .select('external_item_id')
                  .eq('product_id', item.product_id)
                  .eq('account_id', account_id)
                  .eq('platform', 'shopee')
                  .not('external_item_id', 'is', null)
                  .limit(1)
                  .single();
                link = productFallback;
              }
            }

            if (link?.external_item_id) {
              itemShopeeIds.set(itemKey, parseInt(link.external_item_id));
              send({
                step: 'check_products',
                status: 'success',
                detail: `${pv.products.name} → มีอยู่แล้ว (item_id: ${link.external_item_id})`,
              });
            } else {
              // Product not on Shopee — auto-export
              send({
                step: 'check_products',
                status: 'in_progress',
                message: `${pv.products.name} ยังไม่มีบน Shopee — กำลัง Push สินค้าอัตโนมัติ...`,
              });

              // Find category from sibling variation links or any link for this product
              const { data: siblingLink } = await supabaseAdmin
                .from('marketplace_product_links')
                .select('shopee_category_id, shopee_category_name, weight, platform_data')
                .eq('product_id', pv.products.id)
                .eq('account_id', account_id)
                .eq('platform', 'shopee')
                .not('shopee_category_id', 'is', null)
                .limit(1)
                .single();

              // Fallback: check any link for same product across any account in this company
              let categoryId = siblingLink?.shopee_category_id;
              let categoryName = siblingLink?.shopee_category_name;
              let exportWeight = siblingLink?.weight || 0.5;

              if (!categoryId) {
                const { data: anyLink } = await supabaseAdmin
                  .from('marketplace_product_links')
                  .select('shopee_category_id, shopee_category_name, weight, platform_data')
                  .eq('product_id', pv.products.id)
                  .eq('company_id', companyId)
                  .eq('platform', 'shopee')
                  .not('shopee_category_id', 'is', null)
                  .limit(1)
                  .single();

                if (anyLink?.shopee_category_id) {
                  categoryId = anyLink.shopee_category_id;
                  categoryName = anyLink.shopee_category_name;
                  exportWeight = anyLink.weight || 0.5;
                }
              }

              // If still no category, check marketplace_category_cache for a default
              if (!categoryId) {
                const { data: defaultCat } = await supabaseAdmin
                  .from('marketplace_category_cache')
                  .select('external_category_id, category_name')
                  .eq('company_id', companyId)
                  .eq('platform', 'shopee')
                  .limit(1)
                  .single();

                if (defaultCat?.external_category_id) {
                  categoryId = defaultCat.external_category_id;
                  categoryName = defaultCat.category_name;
                }
              }

              if (!categoryId) {
                send({
                  step: 'check_products',
                  status: 'error',
                  message: `${pv.products.name} — ไม่พบหมวดหมู่ Shopee สำหรับ export อัตโนมัติ กรุณา Push สินค้าจากหน้า Shopee Products ก่อน`,
                });
                throw new Error(`ไม่พบหมวดหมู่ Shopee สำหรับ "${pv.products.name}" — กรุณา Push สินค้าจากหน้า Shopee Products ก่อน`);
              }

              const exportOptions: ExportOptions = {
                shopee_category_id: categoryId,
                shopee_category_name: categoryName || undefined,
                weight: exportWeight,
              };

              const exportStartedAt = Date.now();
              const exportResult = await exportProductToShopee(
                account as unknown as ShopeeAccountRow,
                pv.products.id,
                companyId,
                exportOptions
              );

              if (!exportResult.success) {
                // Log export failure
                logIntegration({
                  company_id: companyId,
                  integration: 'shopee',
                  account_id: account.id,
                  account_name: account.shop_name,
                  direction: 'outgoing',
                  action: 'auto_export_product',
                  method: 'POST',
                  api_path: '/api/v2/product/add_item',
                  request_body: {
                    product_id: pv.products.id,
                    product_name: pv.products.name,
                    category_id: categoryId,
                    trigger: 'push_deal',
                    promotion_id,
                  },
                  response_body: { error: exportResult.error },
                  status: 'error',
                  error_message: exportResult.error || 'Export failed',
                  reference_type: 'product',
                  reference_id: pv.products.id,
                  reference_label: `Auto-export "${pv.products.name}" → ${account.shop_name} (failed)`,
                  duration_ms: Date.now() - exportStartedAt,
                });

                send({
                  step: 'check_products',
                  status: 'error',
                  message: `Push สินค้า "${pv.products.name}" ไม่สำเร็จ: ${exportResult.error}`,
                });
                throw new Error(`Push สินค้า "${pv.products.name}" ไม่สำเร็จ: ${exportResult.error}`);
              }

              // Log export success
              logIntegration({
                company_id: companyId,
                integration: 'shopee',
                account_id: account.id,
                account_name: account.shop_name,
                direction: 'outgoing',
                action: 'auto_export_product',
                method: 'POST',
                api_path: '/api/v2/product/add_item',
                request_body: {
                  product_id: pv.products.id,
                  product_name: pv.products.name,
                  category_id: categoryId,
                  category_name: categoryName,
                  trigger: 'push_deal',
                  promotion_id,
                },
                response_body: {
                  item_id: exportResult.item_id,
                  success: true,
                },
                status: 'success',
                reference_type: 'product',
                reference_id: pv.products.id,
                reference_label: `Auto-export "${pv.products.name}" → ${account.shop_name} (item_id: ${exportResult.item_id})`,
                duration_ms: Date.now() - exportStartedAt,
              });

              // After export, re-query the link to get external_item_id
              // For product-level items, query by product_id
              let newLink: { external_item_id: string | null } | null = null;
              if ((isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id) {
                const { data: nl } = await supabaseAdmin
                  .from('marketplace_product_links')
                  .select('external_item_id')
                  .eq('product_id', item.product_id)
                  .eq('account_id', account_id)
                  .eq('platform', 'shopee')
                  .not('external_item_id', 'is', null)
                  .limit(1)
                  .single();
                newLink = nl;
              } else {
                const { data: nl } = await supabaseAdmin
                  .from('marketplace_product_links')
                  .select('external_item_id')
                  .eq('variation_id', item.variation_id)
                  .eq('account_id', account_id)
                  .eq('platform', 'shopee')
                  .single();
                newLink = nl;
              }

              if (!newLink?.external_item_id) {
                // Fallback: use exported item_id directly (for simple products, all variations share the same item_id)
                if (exportResult.item_id) {
                  itemShopeeIds.set(itemKey, exportResult.item_id);
                  send({
                    step: 'check_products',
                    status: 'success',
                    detail: `${pv.products.name} → Push สำเร็จ (item_id: ${exportResult.item_id})`,
                  });
                } else {
                  send({
                    step: 'check_products',
                    status: 'error',
                    message: `Push สำเร็จ แต่ไม่พบ item_id สำหรับ "${pv.products.name}"`,
                  });
                  throw new Error(`Push สำเร็จ แต่ไม่พบ item_id สำหรับ "${pv.products.name}"`);
                }
              } else {
                itemShopeeIds.set(itemKey, parseInt(newLink.external_item_id));
                send({
                  step: 'check_products',
                  status: 'success',
                  detail: `${pv.products.name} → Push สำเร็จ (item_id: ${newLink.external_item_id})`,
                });
              }
            }
          }

          send({ step: 'check_products', status: 'success', message: 'ตรวจสอบสินค้าสำเร็จ' });

          // Build shopee_item_id → product name map (for error messages)
          const shopeeIdToName = new Map<number, string>();
          for (const item of items) {
            const pv = item.product_variations as unknown as { products: { name: string } };
            const key = ((isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id) ? item.product_id : item.variation_id;
            const sid = itemShopeeIds.get(key);
            if (sid) shopeeIdToName.set(sid, pv?.products?.name || key);
          }

          // ─── Step 1.5: Ensure stock sufficient on Shopee for deal creation ───
          let minStockRequired = 1;
          let itemDetails: Awaited<ReturnType<typeof getItemFullDetails>> = new Map();
          {
            // Determine min stock required: for bundle_set it's the number of items (min_amount),
            // for other types at least 1
            const isBundleType = promotion.promotion_type === 'bundle_set' || promotion.promotion_type === 'qty_discount';
            if (promotion.promotion_type === 'bundle_set') {
              minStockRequired = items.length; // min_amount = number of items in bundle
            } else if (promotion.promotion_type === 'qty_discount') {
              const { data: tiers } = await supabaseAdmin
                .from('promotion_tiers')
                .select('min_qty')
                .eq('promotion_id', promotion_id)
                .order('min_qty')
                .limit(1);
              if (tiers && tiers.length > 0) {
                minStockRequired = tiers[0].min_qty;
              }
            }

            const shopeeItemIds = [...new Set(itemShopeeIds.values())];
            send({ step: 'check_products', status: 'in_progress', message: 'ตรวจสอบสถานะสินค้าบน Shopee...' });

            itemDetails = await getItemFullDetails(creds, shopeeItemIds);

            // ─── Check item status (NORMAL, BANNED, DELETED, UNLIST) ───
            const STATUS_LABELS: Record<string, string> = {
              NORMAL: 'ลงขายอยู่',
              BANNED: 'ถูกแบน',
              DELETED: 'ถูกลบ',
              SELLER_DELETE: 'ถูกลบโดยผู้ขาย',
              UNLIST: 'ยังไม่ลงขาย',
            };
            // ─── Check item status & auto re-export deleted items ───
            const RE_EXPORTABLE_STATUSES = new Set(['DELETED', 'SELLER_DELETE', 'BANNED']);
            const stillAbnormal: { name: string; status: string }[] = [];

            for (const [itemKey, shopeeItemId] of itemShopeeIds) {
              const detail = itemDetails.get(shopeeItemId);
              if (!detail) continue;
              if (detail.item_status === 'NORMAL') continue;

              const statusLabel = STATUS_LABELS[detail.item_status] || detail.item_status;

              // If deleted/banned → auto re-export
              if (RE_EXPORTABLE_STATUSES.has(detail.item_status)) {
                send({
                  step: 'check_products',
                  status: 'in_progress',
                  message: `${detail.item_name} — "${statusLabel}" → กำลัง Push สินค้าขึ้นใหม่...`,
                });

                // Find the original item to get product_id for re-export
                const item = items.find(i => {
                  const k = ((isBundleSet || isQtyDiscount || isAddOnDeal) && i.product_id && !i.variation_id)
                    ? i.product_id : i.variation_id;
                  return k === itemKey;
                });
                const pv = item?.product_variations as unknown as { id: string; products: { id: string; name: string } } | null;
                const productId = pv?.products?.id || item?.product_id;

                if (productId) {
                  // Find category from existing links (before deleting them)
                  const { data: catLink } = await supabaseAdmin
                    .from('marketplace_product_links')
                    .select('shopee_category_id, shopee_category_name, weight')
                    .eq('product_id', productId)
                    .eq('platform', 'shopee')
                    .not('shopee_category_id', 'is', null)
                    .limit(1)
                    .single();

                  const categoryId = catLink?.shopee_category_id;
                  if (categoryId) {
                    // Delete old links pointing to deleted/banned item so exportProductToShopee won't block
                    await supabaseAdmin
                      .from('marketplace_product_links')
                      .delete()
                      .eq('product_id', productId)
                      .eq('account_id', account_id);

                    try {
                      const reExportResult = await exportProductToShopee(
                        account as unknown as ShopeeAccountRow,
                        productId,
                        companyId,
                        {
                          shopee_category_id: categoryId,
                          shopee_category_name: catLink?.shopee_category_name || undefined,
                          weight: catLink?.weight || 0.5,
                        }
                      );

                      if (reExportResult.success && reExportResult.item_id) {
                        // Update itemShopeeIds with new item_id
                        itemShopeeIds.set(itemKey, reExportResult.item_id);
                        shopeeIdToName.set(reExportResult.item_id, detail.item_name);
                        send({
                          step: 'check_products',
                          status: 'success',
                          detail: `${detail.item_name} → Push ขึ้นใหม่สำเร็จ (item_id: ${reExportResult.item_id})`,
                        });
                        continue; // Skip adding to stillAbnormal
                      } else {
                        send({
                          step: 'check_products',
                          status: 'error',
                          detail: `${detail.item_name} — Push ขึ้นใหม่ไม่สำเร็จ: ${reExportResult.error}`,
                        });
                      }
                    } catch (reExportErr) {
                      send({
                        step: 'check_products',
                        status: 'error',
                        detail: `${detail.item_name} — Push ขึ้นใหม่ไม่สำเร็จ: ${reExportErr instanceof Error ? reExportErr.message : 'Unknown'}`,
                      });
                    }
                  }
                }
              }

              // Not re-exportable or re-export failed
              stillAbnormal.push({ name: detail.item_name, status: statusLabel });
              send({
                step: 'check_products',
                status: 'error',
                detail: `${detail.item_name} — สถานะ: "${statusLabel}" (ต้องเป็น "ลงขายอยู่" ถึงจะเพิ่มเข้า Deal ได้)`,
              });
            }
            if (stillAbnormal.length > 0) {
              const names = stillAbnormal.map(i => `"${i.name}" (${i.status})`).join(', ');
              throw new Error(`สินค้า ${stillAbnormal.length} รายการสถานะไม่พร้อม: ${names} — กรุณาลงขายสินค้าบน Shopee ก่อน`);
            }

            send({ step: 'check_products', status: 'success', message: 'สินค้าทุกรายการสถานะปกติ' });

            // Re-fetch item details if any items were re-exported (item_ids changed)
            const refreshedShopeeItemIds = [...new Set(itemShopeeIds.values())];
            const refreshedItemDetails = refreshedShopeeItemIds.some(id => !itemDetails.has(id))
              ? await getItemFullDetails(creds, refreshedShopeeItemIds)
              : itemDetails;

            for (const [, shopeeItemId] of itemShopeeIds) {
              const detail = refreshedItemDetails.get(shopeeItemId);
              if (!detail) continue;

              // Check if any model has insufficient stock → bump to minStockRequired
              const lowStockModels = detail.models.filter(m => m.stock < minStockRequired);
              if (lowStockModels.length > 0) {
                send({
                  step: 'check_products',
                  status: 'in_progress',
                  message: `${detail.item_name} — stock ไม่พอ (ต้องการ ≥ ${minStockRequired}), เพิ่ม stock ชั่วคราว...`,
                });

                const stockList = lowStockModels.map(m => ({
                  model_id: m.model_id,
                  seller_stock: [{ stock: minStockRequired }],
                }));

                const stockResult = await updateStock(creds, shopeeItemId, stockList);
                if (stockResult.error) {
                  // If stock update fails, warn and retry once after a short delay
                  send({
                    step: 'check_products',
                    status: 'in_progress',
                    detail: `เพิ่ม stock ไม่สำเร็จ: ${stockResult.error} — รอ 2 วิแล้วลองใหม่...`,
                  });
                  await new Promise(r => setTimeout(r, 2000));
                  const retryResult = await updateStock(creds, shopeeItemId, stockList);
                  if (retryResult.error) {
                    throw new Error(`เพิ่ม stock สินค้า "${detail.item_name}" ไม่สำเร็จ: ${retryResult.error} — กรุณาตรวจสอบสินค้าบน Shopee`);
                  }
                  send({
                    step: 'check_products',
                    status: 'in_progress',
                    detail: `${detail.item_name} — เพิ่ม stock เป็น ${minStockRequired} สำเร็จ (retry)`,
                  });
                } else {
                  send({
                    step: 'check_products',
                    status: 'in_progress',
                    detail: `${detail.item_name} — เพิ่ม stock เป็น ${minStockRequired} สำเร็จ (${lowStockModels.length} model)`,
                  });
                }
              }
            }
          }

          const nowTs = Math.floor(Date.now() / 1000);
          let startTs = toBangkokTimestamp(start_time, true);
          const endTs = toBangkokTimestamp(end_time, false);

          // Shopee requires start_time at least 1 hour in the future — auto-adjust if past
          if (startTs <= nowTs + 3600) {
            startTs = nowTs + 3900; // +1 ชั่วโมง 5 นาที (buffer)
            send({ step: 'create_deal', status: 'in_progress', message: 'วันเริ่มต้นน้อยกว่า 1 ชม. — ปรับเป็นอีก ~1 ชั่วโมง' });
          }

          // ─── Step 2: Create deal on Shopee ───
          send({ step: 'create_deal', status: 'in_progress', message: 'สร้างโปรโมชั่นบน Shopee...' });

          // Fetch per-shop override value
          const { data: createPlatformPrice } = await supabaseAdmin
            .from('promotion_platforms')
            .select('bundle_price')
            .eq('promotion_id', promotion_id)
            .eq('account_id', account_id)
            .eq('platform', 'shopee')
            .single();

          let externalDealId: number;
          let dealType: string;

          if (promotion.promotion_type === 'bundle_set' || promotion.promotion_type === 'qty_discount') {
            // Bundle Deal
            dealType = 'bundle_deal';

            let fixPrice: number | undefined;
            let discountPercentage: number | undefined;
            let discountValue: number | undefined;
            let minAmount = 2;
            let additionalTiers: { min_amount: number; fix_price?: number; discount_percentage?: number; discount_value?: number }[] | undefined;

            if (promotion.promotion_type === 'bundle_set') {
              minAmount = items.length;
              const shopOverride = createPlatformPrice?.bundle_price;
              const discountType = promotion.discount_type || 'fix_price';
              if (discountType === 'fix_price') {
                fixPrice = shopOverride || promotion.bundle_price;
              } else if (discountType === 'percent') {
                discountPercentage = shopOverride || promotion.discount_value;
              } else if (discountType === 'fixed_discount') {
                discountValue = shopOverride || promotion.discount_value;
              }
            } else {
              // qty_discount — fetch tiers
              const { data: tiers } = await supabaseAdmin
                .from('promotion_tiers')
                .select('*')
                .eq('promotion_id', promotion_id)
                .order('min_qty');

              if (!tiers || tiers.length === 0) {
                throw new Error('ไม่มีขั้นส่วนลด');
              }

              const firstTier = tiers[0];
              minAmount = firstTier.min_qty;

              const tierDiscountType = firstTier.discount_type || 'percent';
              if (tierDiscountType === 'percent') {
                discountPercentage = firstTier.discount_value;
              } else if (tierDiscountType === 'fixed_discount') {
                discountValue = firstTier.discount_value;
              } else {
                fixPrice = firstTier.discount_value;
              }

              // Additional tiers (max 2 — Shopee limit)
              if (tiers.length > 1) {
                additionalTiers = tiers.slice(1, 3).map(t => {
                  const obj: { min_amount: number; fix_price?: number; discount_percentage?: number; discount_value?: number } = {
                    min_amount: t.min_qty,
                  };
                  const dt = t.discount_type || tierDiscountType;
                  if (dt === 'percent') obj.discount_percentage = t.discount_value;
                  else if (dt === 'fixed_discount') obj.discount_value = t.discount_value;
                  else obj.fix_price = t.discount_value;
                  return obj;
                });
              }
            }

            // Derive rule_type from discount fields using shared mapping
            const ruleType = fixPrice != null
              ? toShopeeRuleType('fix_price')
              : discountPercentage != null
                ? toShopeeRuleType('percent')
                : toShopeeRuleType('fixed_discount');

            // Shopee bundle deal name limit = 25 characters
            const dealName = promotion.name.trim().slice(0, 25) || 'Bundle Deal';

            const createParams: BundleDealParams = {
              name: dealName,
              rule_type: ruleType,
              fix_price: fixPrice,
              discount_percentage: discountPercentage,
              discount_value: discountValue,
              min_amount: minAmount,
              start_time: startTs,
              end_time: endTs,
              purchase_limit: 1,
            };
            if (additionalTiers && additionalTiers.length > 0) {
              createParams.additional_tiers = additionalTiers;
            }

            console.log('[Shopee Deal] createBundleDeal params:', JSON.stringify(createParams, null, 2));

            const result = await createBundleDeal(creds, createParams);

            externalDealId = result.bundle_deal_id;
            completedSteps.push({ type: 'deal_created', dealId: externalDealId });

            send({
              step: 'create_deal',
              status: 'success',
              message: `สร้าง Bundle Deal สำเร็จ (deal_id: ${externalDealId})`,
            });

            // ─── Step 3: Add items to Bundle Deal ───
            send({ step: 'add_items', status: 'in_progress', message: 'เพิ่มสินค้าเข้า Bundle Deal...' });

            // De-duplicate: multiple variations may share the same Shopee item_id
            const uniqueItemIds = [...new Set(items.map(item => {
              const key = ((isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id)
                ? item.product_id
                : item.variation_id;
              return itemShopeeIds.get(key)!;
            }))];
            const bundleItems = uniqueItemIds.map(id => ({
              item_id: id,
              status: 1 as const,
            }));

            // Add items one-by-one to handle partial failures gracefully
            const failedItems: { item_id: number; fail_message: string }[] = [];
            const succeededItems: number[] = [];

            for (const item of bundleItems) {
              try {
                let addResult = await addBundleDealItems(creds, externalDealId, [item]);

                // Auto-retry on stock error: bump stock and retry once
                if (addResult.failed_list.length > 0 && addResult.failed_list[0].fail_error?.includes('stock_error')) {
                  const itemName = shopeeIdToName.get(item.item_id) || `item_id ${item.item_id}`;
                  send({ step: 'add_items', status: 'in_progress', detail: `${itemName}: stock ไม่พอ — กำลังเพิ่ม stock แล้วลองใหม่...` });

                  // Fetch item details to get model_ids
                  const retryDetails = await getItemFullDetails(creds, [item.item_id]);
                  const retryDetail = retryDetails.get(item.item_id);
                  if (retryDetail) {
                    const minStock = Math.max(minStockRequired, 2);
                    const stockList = retryDetail.models.map(m => ({
                      model_id: m.model_id,
                      seller_stock: [{ stock: minStock }],
                    }));
                    await updateStock(creds, item.item_id, stockList);
                    await new Promise(r => setTimeout(r, 1500));
                    addResult = await addBundleDealItems(creds, externalDealId, [item]);
                  }
                }

                if (addResult.failed_list.length > 0) {
                  const f = addResult.failed_list[0];
                  const msg = await translateShopeeError(f.fail_error || f.fail_message || 'Unknown');
                  const itemName = shopeeIdToName.get(f.item_id) || `item_id ${f.item_id}`;
                  failedItems.push({ item_id: f.item_id, fail_message: msg });
                  send({ step: 'add_items', status: 'in_progress', detail: `${itemName}: ${msg}` });
                } else {
                  const itemName = shopeeIdToName.get(item.item_id) || `item_id ${item.item_id}`;
                  succeededItems.push(item.item_id);
                  send({ step: 'add_items', status: 'in_progress', detail: `${itemName} เพิ่มสำเร็จ` });
                }
              } catch (addErr) {
                const msg = addErr instanceof Error ? addErr.message : 'Unknown error';
                const itemName = shopeeIdToName.get(item.item_id) || `item_id ${item.item_id}`;
                failedItems.push({ item_id: item.item_id, fail_message: msg });
                send({ step: 'add_items', status: 'in_progress', detail: `${itemName}: ${msg}` });
              }
            }

            completedSteps.push({ type: 'items_added', itemIds: succeededItems });

            if (failedItems.length > 0) {
              const failList = failedItems.map((f, i) => {
                const name = shopeeIdToName.get(f.item_id) || `item_id ${f.item_id}`;
                return `${i + 1}. ${name}`;
              }).join('\n');
              // Group by error type for cleaner message
              const reasons = [...new Set(failedItems.map(f => f.fail_message))];
              const reasonText = reasons.join(' / ');
              const errorMsg = `สร้าง Bundle Deal ไม่สำเร็จ เพราะ${reasonText}:\n${failList}`;
              // Rollback ทั้งหมดถ้าเพิ่มสินค้าไม่ครบ
              send({ step: 'add_items', status: 'error', message: errorMsg });
              throw new Error(errorMsg);
            } else {
              send({ step: 'add_items', status: 'success', message: `เพิ่มสินค้า ${succeededItems.length} รายการสำเร็จ` });
            }

          } else {
            // Add-on Deal (buy_get_free / buy_get_discount)
            dealType = 'add_on_deal';

            const promotionType = promotion.promotion_type === 'buy_get_free' ? 1 : 0;

            // promotion_purchase_limit = 100 (Shopee ไม่รับ 0, ใช้ค่าสูงสุดแทน)
            // ratio 1:1 — ซื้อสินค้าหลัก N ชิ้น = ซื้อสินค้าเสริมได้ N ชิ้น
            // ใช้ sub_item_limit ต่อ SKU เป็นตัวควบคุมจำนวนจริง
            const addOnParams: Parameters<typeof createAddOnDeal>[1] = {
              add_on_deal_name: promotion.name.trim().slice(0, 25) || 'Add-on Deal',
              start_time: startTs,
              end_time: endTs,
              promotion_type: promotionType as 0 | 1,
              promotion_purchase_limit: 100,
            };

            // For gift_with_min_spend (type=1): always send purchase_min_spend and per_gift_num
            if (promotionType === 1) {
              addOnParams.purchase_min_spend = Math.max(promotion.purchase_min_spend ?? 0, 1);
              if (promotion.per_gift_num != null && promotion.per_gift_num > 0) {
                addOnParams.per_gift_num = promotion.per_gift_num;
              }
            }

            // For add_on_discount (type=0): send purchase_min_spend if set
            if (promotionType === 0 && promotion.purchase_min_spend) {
              addOnParams.purchase_min_spend = promotion.purchase_min_spend;
            }

            const result = await createAddOnDeal(creds, addOnParams);

            externalDealId = result.add_on_deal_id;
            completedSteps.push({ type: 'deal_created', dealId: externalDealId });

            send({
              step: 'create_deal',
              status: 'success',
              message: `สร้าง Add-on Deal สำเร็จ (deal_id: ${externalDealId})`,
            });

            // ─── Step 3: Add main items ───
            send({ step: 'add_main_items', status: 'in_progress', message: 'เพิ่มสินค้าหลัก...' });

            const mainItems = items
              .filter(i => i.role === 'main')
              .map(i => {
                const key = ((isBundleSet || isQtyDiscount || isAddOnDeal) && i.product_id && !i.variation_id)
                  ? i.product_id : i.variation_id;
                return { item_id: itemShopeeIds.get(key)!, status: 1 as const };
              });

            if (mainItems.length > 0) {
              let mainResult = await addAddOnDealMainItems(creds, externalDealId, mainItems);
              let failedMain = mainResult.main_item_list.filter(i => i.fail_error);
              let succeededMain = mainResult.main_item_list.filter(i => !i.fail_error);

              // Auto-retry on no_stock: bump stock and retry
              const noStockItems = failedMain.filter(f => f.fail_error?.includes('no_stock') || f.fail_message?.toLowerCase().includes('no stock'));
              if (noStockItems.length > 0) {
                send({ step: 'add_main_items', status: 'in_progress', message: 'สินค้าสต็อก 0 — กำลังเพิ่มสต็อกอัตโนมัติ...' });
                for (const ns of noStockItems) {
                  try {
                    const detailsMap = await getItemFullDetails(creds, [ns.item_id]);
                    const detail = detailsMap.get(ns.item_id);
                    if (detail && detail.models.length > 0) {
                      const stockList = detail.models.map(m => ({
                        model_id: m.model_id,
                        seller_stock: [{ stock: Math.max(minStockRequired, 2) }],
                      }));
                      await updateStock(creds, ns.item_id, stockList);
                    } else {
                      await updateStock(creds, ns.item_id, [{ model_id: 0, seller_stock: [{ stock: Math.max(minStockRequired, 2) }] }]);
                    }
                  } catch {
                    // skip stock bump error
                  }
                }
                // Wait for Shopee to process stock update
                await new Promise(r => setTimeout(r, 2000));
                send({ step: 'add_main_items', status: 'in_progress', message: 'ลองเพิ่มสินค้าหลักอีกครั้ง...' });
                mainResult = await addAddOnDealMainItems(creds, externalDealId, mainItems);
                failedMain = mainResult.main_item_list.filter(i => i.fail_error);
                succeededMain = mainResult.main_item_list.filter(i => !i.fail_error);
              }

              for (const f of failedMain) {
                const name = shopeeIdToName.get(f.item_id) || `item_id: ${f.item_id}`;
                const msg = await translateShopeeError(f.fail_message || f.fail_error || 'Unknown error');
                warnings.push(`${name}: ${msg}`);
                send({ step: 'add_main_items', status: 'error', detail: `${name} — ${msg}` });
              }

              if (succeededMain.length === 0 && mainItems.length > 0) {
                const translatedErrors = await Promise.all(
                  failedMain.map(f => translateShopeeError(f.fail_message || f.fail_error || ''))
                );
                throw new Error(`ไม่สามารถเพิ่มสินค้าหลักได้: ${translatedErrors.join(', ')}`);
              }

              completedSteps.push({ type: 'main_items_added', itemIds: succeededMain.map(i => i.item_id) });
            }

            send({ step: 'add_main_items', status: 'success', message: `เพิ่มสินค้าหลัก ${mainItems.length} รายการสำเร็จ` });

            // ─── Step 4: Add sub items (gift/discounted) — must include model_id ───
            send({ step: 'add_sub_items', status: 'in_progress', message: 'เพิ่มของแถม/สินค้าราคาพิเศษ...' });

            // Match sub item variations → Shopee model_id via SKU or model_name
            const subItems = items
              .filter(i => i.role === 'gift' || i.role === 'discounted')
              .map(i => {
                const shopeeItemId = itemShopeeIds.get(i.variation_id)!;
                const detail = itemDetails.get(shopeeItemId);
                const pv = i.product_variations as unknown as {
                  id: string; sku: string | null; variation_label: string | null;
                  products: { id: string; name: string };
                };

                let modelId: number | undefined;

                if (detail && detail.models.length > 0) {
                  // Simple product (1 model with model_id=0) → send model_id: 0
                  if (detail.models.length === 1 && detail.models[0].model_id === 0) {
                    modelId = 0;
                  } else {
                    // Match by SKU first
                    const sku = pv.sku || '';
                    if (sku) {
                      const match = detail.models.find((m: { model_sku: string }) => m.model_sku === sku);
                      if (match) modelId = match.model_id;
                    }
                    // Fallback: match by variation_label → model_name
                    if (modelId === undefined && pv.variation_label) {
                      const match = detail.models.find((m: { model_name: string }) =>
                        m.model_name.toLowerCase() === pv.variation_label!.toLowerCase()
                      );
                      if (match) modelId = match.model_id;
                    }
                    // Fallback: try marketplace_product_links
                    if (modelId === undefined && i.variation_id) {
                      // Will be resolved below
                    }
                  }
                }

                return {
                  item_id: shopeeItemId,
                  model_id: modelId,
                  status: 1 as const,
                  sub_item_input_price: i.role === 'gift' ? 0 : (i.special_price || 0),
                  sub_item_limit: i.sub_item_limit ?? 1,
                  _variation_id: i.variation_id, // temp for fallback lookup
                };
              });

            // Fallback: fetch model_ids from marketplace_product_links for unmatched variations
            const unmatchedVarIds = subItems
              .filter(s => s.model_id === undefined && s._variation_id)
              .map(s => s._variation_id!);

            if (unmatchedVarIds.length > 0) {
              const { data: links } = await supabaseAdmin
                .from('marketplace_product_links')
                .select('variation_id, external_model_id')
                .eq('account_id', account_id)
                .eq('platform', 'shopee')
                .in('variation_id', unmatchedVarIds);

              const linkMap = new Map<string, number>();
              for (const link of links || []) {
                if (link.variation_id && link.external_model_id) {
                  linkMap.set(link.variation_id, parseInt(link.external_model_id));
                }
              }

              for (const s of subItems) {
                if (s.model_id === undefined && s._variation_id && linkMap.has(s._variation_id)) {
                  s.model_id = linkMap.get(s._variation_id);
                }
              }
            }

            // Filter out items that couldn't be matched (no model_id for multi-variation products)
            // Always send model_id (Shopee requires it) — 0 for simple products
            const validSubItems = subItems
              .filter(s => {
                const detail = itemDetails.get(s.item_id);
                // Multi-variation without model_id → skip
                if (detail && detail.models.length > 1 && s.model_id === undefined) {
                  console.warn(`[Shopee Deal] Skipping sub item ${s.item_id} — could not match model_id`);
                  return false;
                }
                return true;
              })
              .map(({ _variation_id, model_id, ...rest }) => {
                // Simple products (model_id=0): omit model_id entirely — Shopee rejects model_id:0
                // Multi-variation products: must include the matched model_id
                if (model_id !== undefined && model_id !== 0) {
                  return { ...rest, model_id };
                }
                return rest;
              }) as AddOnDealSubItem[];

            console.log('[Shopee Deal] validSubItems payload:', JSON.stringify(validSubItems, null, 2));

            if (validSubItems.length > 0) {
              const subResult = await addAddOnDealSubItems(creds, externalDealId, validSubItems);
              completedSteps.push({ type: 'sub_items_added' });

              // Check for failures — rollback ทั้งหมดถ้าเพิ่มไม่ครบ
              const failures = subResult.sub_item_list.filter(s => s.fail_error);
              if (failures.length > 0) {
                const reasons = [...new Set(failures.map(f => translateShopeeErrorSync(f.fail_error || f.fail_message || 'Unknown')))];
                const failList = failures.map((f, i) => {
                  const name = shopeeIdToName.get(f.item_id) || `item_id ${f.item_id}`;
                  return `${i + 1}. ${name}`;
                }).join('\n');
                const errorMsg = `สร้าง Deal ไม่สำเร็จ เพราะ${reasons.join(' / ')}:\n${failList}`;
                send({ step: 'add_sub_items', status: 'error', message: errorMsg });
                throw new Error(errorMsg);
              } else {
                send({ step: 'add_sub_items', status: 'success', message: `เพิ่มของแถม/ราคาพิเศษ ${subItems.length} รายการสำเร็จ` });
              }
            } else {
              send({ step: 'add_sub_items', status: 'success', message: 'ไม่มีของแถม/สินค้าราคาพิเศษ' });
            }
          }

          // ─── Step 5: Save to DB ───
          send({ step: 'save_db', status: 'in_progress', message: 'บันทึกข้อมูล...' });

          await supabaseAdmin.from('shopee_deals').insert({
            company_id: companyId,
            promotion_id: promotion_id,
            account_id: account_id,
            deal_type: dealType,
            external_deal_id: externalDealId,
            status: 'upcoming',
            start_time: start_time,
            end_time: end_time,
            shopee_data: { items: Array.from(itemShopeeIds.entries()) },
          });

          // Ensure platform is_enabled = true after successful push
          await supabaseAdmin
            .from('promotion_platforms')
            .update({ is_enabled: true })
            .eq('promotion_id', promotion_id)
            .eq('account_id', account_id);

          send({ step: 'save_db', status: 'success', message: 'บันทึกสำเร็จ' });

          finalDealType = dealType;
          finalDealId = externalDealId;

          // ─── Complete ───
          if (warnings.length > 0) {
            send({ step: 'complete', status: 'success', message: `Push สำเร็จ (บางรายการล้มเหลว)`, detail: warnings.join('; ') });
          } else {
            send({ step: 'complete', status: 'success', message: 'Push สำเร็จ!' });
          }

          // Log success
          logIntegration({
            company_id: companyId,
            integration: 'shopee',
            account_id: account.id,
            account_name: account.shop_name,
            direction: 'outgoing',
            action: 'push_deal',
            method: 'POST',
            api_path: finalDealType === 'bundle_deal'
              ? '/api/v2/bundle_deal/add_bundle_deal'
              : '/api/v2/add_on_deal/add_add_on_deal',
            request_body: {
              promotion_id, promotion_name: promotion.name,
              deal_type: finalDealType, items_count: items.length,
              start_time, end_time,
            },
            response_body: {
              external_deal_id: finalDealId,
              steps: completedSteps,
            },
            status: 'success',
            reference_type: 'promotion',
            reference_id: promotion_id,
            reference_label: `Push ${promotion.name} → ${account.shop_name} (deal_id: ${finalDealId})`,
            duration_ms: Date.now() - startedAt,
          });

        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
          send({ step: 'error', status: 'error', message: errMsg });

          // ─── Rollback ───
          send({ step: 'rollback', status: 'in_progress', message: 'กำลัง rollback...' });

          for (const step of completedSteps.reverse()) {
            try {
              switch (step.type) {
                case 'deal_created':
                  if (step.dealId) {
                    if (promotion.promotion_type === 'bundle_set' || promotion.promotion_type === 'qty_discount') {
                      await deleteBundleDeal(creds, step.dealId);
                    } else {
                      await deleteAddOnDeal(creds, step.dealId);
                    }
                    send({ step: 'rollback', status: 'success', detail: `ลบ deal ${step.dealId} สำเร็จ` });
                  }
                  break;
                case 'main_items_added':
                  // Main items are deleted when deal is deleted
                  break;
                case 'items_added':
                  // Bundle items are deleted when deal is deleted
                  break;
              }
            } catch (rollbackErr) {
              send({
                step: 'rollback',
                status: 'error',
                detail: `Rollback ไม่สำเร็จ: ${rollbackErr instanceof Error ? rollbackErr.message : 'unknown'}`,
              });
            }
          }

          send({ step: 'rollback', status: 'success', message: 'Rollback เสร็จสิ้น' });

          // Log error
          logIntegration({
            company_id: companyId,
            integration: 'shopee',
            account_id: account.id,
            account_name: account.shop_name,
            direction: 'outgoing',
            action: 'push_deal',
            method: 'POST',
            api_path: '/api/shopee/deals',
            request_body: {
              promotion_id, promotion_name: promotion.name,
              items_count: items.length,
              start_time, end_time,
            },
            response_body: { completed_steps: completedSteps },
            status: 'error',
            error_message: errMsg,
            reference_type: 'promotion',
            reference_id: promotion_id,
            reference_label: `Push ${promotion.name} → ${account.shop_name} (failed)`,
            duration_ms: Date.now() - startedAt,
          });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (err) {
    console.error('POST /api/shopee/deals error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// ─── GET /api/shopee/deals — List deals for a promotion ──

export async function GET(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const promotionId = req.nextUrl.searchParams.get('promotion_id');
  if (!promotionId) {
    return NextResponse.json({ error: 'promotion_id required' }, { status: 400 });
  }

  try {
    const { data: deals, error } = await supabaseAdmin
      .from('shopee_deals')
      .select(`
        *,
        marketplace_accounts(shop_name, shop_id)
      `)
      .eq('promotion_id', promotionId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ deals: deals || [] });
  } catch (err) {
    console.error('GET /api/shopee/deals error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// ─── PATCH /api/shopee/deals — Update existing deals on Shopee ──
// Called after saving promotion locally. Updates all synced shops.

export async function PATCH(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { promotion_id } = body;

    if (!promotion_id) {
      return NextResponse.json({ error: 'promotion_id required' }, { status: 400 });
    }

    // Get promotion with items
    const { data: promotion } = await supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('id', promotion_id)
      .eq('company_id', companyId)
      .single();

    if (!promotion) {
      return NextResponse.json({ error: 'ไม่พบโปรโมชั่น' }, { status: 404 });
    }

    const { data: items } = await supabaseAdmin
      .from('promotion_items')
      .select(`
        id, variation_id, product_id, role, quantity, special_price, sub_item_limit,
        product_variations(
          id, default_price,
          products!inner(id, name)
        )
      `)
      .eq('promotion_id', promotion_id)
      .order('sort_order');

    const isBundleSet = promotion.promotion_type === 'bundle_set';
    const isQtyDiscount = promotion.promotion_type === 'qty_discount';
    const isBuyGetFree = promotion.promotion_type === 'buy_get_free';
    const isBuyGetDiscount = promotion.promotion_type === 'buy_get_discount';
    const isAddOnDeal = isBuyGetFree || isBuyGetDiscount;

    // For product-level items: fetch product name if no variation join
    if ((isBundleSet || isQtyDiscount || isAddOnDeal) && items) {
      for (const item of items) {
        if (!item.product_variations && item.product_id) {
          const { data: prod } = await supabaseAdmin
            .from('products')
            .select('id, name')
            .eq('id', item.product_id)
            .single();
          if (prod) {
            (item as any).product_variations = {
              id: item.product_id,
              default_price: 0,
              products: { id: prod.id, name: prod.name },
            };
          }
        }
      }
    }

    // Get all existing shopee_deals for this promotion
    const { data: existingDeals } = await supabaseAdmin
      .from('shopee_deals')
      .select('*, marketplace_accounts(shop_name)')
      .eq('promotion_id', promotion_id)
      .eq('company_id', companyId)
      .in('status', ['upcoming', 'ongoing']);

    if (!existingDeals || existingDeals.length === 0) {
      return NextResponse.json({ error: 'ไม่มี deal ที่ sync อยู่', updated: 0 });
    }

    const results: { account_id: string; shop_name: string; success: boolean; error?: string; details?: string[] }[] = [];

    for (const deal of existingDeals) {
      const acc = deal.marketplace_accounts as unknown as { shop_name: string };
      const shopName = acc?.shop_name || 'ไม่ทราบ';
      const details: string[] = [];

      try {
        // Get credentials
        const { data: account } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('id', deal.account_id)
          .single();

        if (!account) {
          results.push({ account_id: deal.account_id, shop_name: shopName, success: false, error: 'ไม่พบบัญชี' });
          continue;
        }

        const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);
        const externalDealId = deal.external_deal_id;

        if (!externalDealId) {
          results.push({ account_id: deal.account_id, shop_name: shopName, success: false, error: 'ไม่มี external_deal_id' });
          continue;
        }

        // Get platform-specific price and enabled status
        const { data: platformPrice } = await supabaseAdmin
          .from('promotion_platforms')
          .select('bundle_price, is_enabled')
          .eq('promotion_id', promotion_id)
          .eq('account_id', deal.account_id)
          .eq('platform', 'shopee')
          .single();

        // If platform was disabled (toggled OFF) → unsync deal from Shopee
        if (!platformPrice || platformPrice.is_enabled === false) {
          const dealDetail = deal.deal_type === 'bundle_deal'
            ? await getBundleDeal(creds, externalDealId)
            : await getAddOnDeal(creds, externalDealId);
          const realStatus = deriveDealStatus(dealDetail as { start_time?: number; end_time?: number; time_status?: number } | null);
          const strategy = getUnsyncStrategy(realStatus);

          if (strategy === 'end') {
            if (deal.deal_type === 'bundle_deal') await endBundleDeal(creds, externalDealId);
            else await endAddOnDeal(creds, externalDealId);
            details.push('ปิด deal (ongoing → expired)');
          } else if (strategy === 'delete') {
            if (deal.deal_type === 'bundle_deal') await deleteBundleDeal(creds, externalDealId);
            else await deleteAddOnDeal(creds, externalDealId);
            details.push('ลบ deal (upcoming → deleted)');
          } else {
            details.push('deal หมดอายุแล้ว');
          }

          // Remove deal record — no longer synced
          await supabaseAdmin.from('shopee_deals')
            .delete()
            .eq('id', deal.id);

          results.push({ account_id: deal.account_id, shop_name: shopName, success: true, details });
          continue;
        }

        const bundlePrice = platformPrice?.bundle_price ?? promotion.bundle_price;

        // Build shopee item_id map + track which items exist vs missing
        const itemShopeeIds = new Map<string, number>();
        for (const item of items || []) {
          const pv = item.product_variations as unknown as {
            id: string; products: { id: string; name: string };
          };
          const itemKey = ((isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id)
            ? item.product_id
            : item.variation_id;
          const productName = pv?.products?.name || itemKey;

          // For product-level items: find any link for this product
          let link: { external_item_id: string | null } | null = null;
          if ((isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id) {
            const { data: productLink } = await supabaseAdmin
              .from('marketplace_product_links')
              .select('external_item_id')
              .eq('product_id', item.product_id)
              .eq('account_id', deal.account_id)
              .eq('platform', 'shopee')
              .not('external_item_id', 'is', null)
              .limit(1)
              .single();
            link = productLink;
          } else {
            const { data: varLink } = await supabaseAdmin
              .from('marketplace_product_links')
              .select('external_item_id')
              .eq('variation_id', item.variation_id)
              .eq('account_id', deal.account_id)
              .eq('platform', 'shopee')
              .single();
            link = varLink;
          }

          if (link?.external_item_id) {
            itemShopeeIds.set(itemKey, parseInt(link.external_item_id));
            details.push(`✓ ${productName} — มีอยู่แล้ว (item_id: ${link.external_item_id})`);
          } else {
            details.push(`✗ ${productName} — ไม่พบบน Shopee ร้านนี้ (ข้ามไป)`);
          }
        }

        // Reverse map: shopee_item_id → product name (for error messages)
        const shopeeIdToName = new Map<number, string>();
        for (const item of items || []) {
          const pv = item.product_variations as unknown as { products: { name: string } };
          const itemKey = ((isBundleSet || isQtyDiscount || isAddOnDeal) && item.product_id && !item.variation_id) ? item.product_id : item.variation_id;
          const shopeeId = itemShopeeIds.get(itemKey);
          if (shopeeId) shopeeIdToName.set(shopeeId, pv?.products?.name || itemKey);
        }

        if (deal.deal_type === 'bundle_deal') {
          // ─── Update Bundle Deal ───
          // Fetch real status from Shopee API (DB status may be stale)
          const dealDetail = await getBundleDeal(creds, externalDealId);
          const realStatus = deriveDealStatus(dealDetail as { start_time?: number; end_time?: number; time_status?: number } | null);
          const isOngoing = realStatus === 'ongoing';

          // Update DB status to match Shopee
          if (deal.status !== realStatus && realStatus !== 'no_deal') {
            await supabaseAdmin.from('shopee_deals').update({ status: realStatus }).eq('id', deal.id);
          }

          // 1. Update deal settings
          const nowTs = Math.floor(Date.now() / 1000);
          const rawStartTime = promotion.start_date
            ? toBangkokTimestamp(promotion.start_date, true)
            : undefined;

          const updatePayload: Partial<BundleDealParams> = {
            name: promotion.name,
          };

          if (isOngoing) {
            // Deal กำลัง run อยู่ — แก้ได้แค่ชื่อ, end_time, เพิ่ม/ลบสินค้า
            const endTime = promotion.end_date
              ? toBangkokTimestamp(promotion.end_date, false)
              : undefined;
            if (endTime != null) updatePayload.end_time = endTime;

            await updateBundleDeal(creds, externalDealId, updatePayload);
            details.push(`อัพเดต Deal (ongoing): ชื่อ="${promotion.name}" (ราคา/start_time แก้ไม่ได้)`);
          } else {
            const skipStartTime = rawStartTime != null && rawStartTime <= nowTs;
            const startTime = skipStartTime ? undefined : rawStartTime;
            const endTime = promotion.end_date
              ? toBangkokTimestamp(promotion.end_date, false)
              : undefined;

            if (startTime != null) updatePayload.start_time = startTime;
            if (endTime != null) updatePayload.end_time = endTime;

            if (isQtyDiscount) {
              // qty_discount — discount/tiers come from promotion_tiers table
              const { data: tiers } = await supabaseAdmin
                .from('promotion_tiers')
                .select('*')
                .eq('promotion_id', promotion_id)
                .order('min_qty');

              if (tiers && tiers.length > 0) {
                const firstTier = tiers[0];
                updatePayload.min_amount = firstTier.min_qty;

                const tierDiscountType = firstTier.discount_type || 'percent';
                if (tierDiscountType === 'percent') {
                  updatePayload.discount_percentage = firstTier.discount_value;
                } else if (tierDiscountType === 'fixed_discount') {
                  updatePayload.discount_value = firstTier.discount_value;
                } else {
                  updatePayload.fix_price = firstTier.discount_value;
                }

                // Additional tiers (max 2)
                if (tiers.length > 1) {
                  updatePayload.additional_tiers = tiers.slice(1, 3).map(t => {
                    const obj: { min_amount: number; fix_price?: number; discount_percentage?: number; discount_value?: number } = {
                      min_amount: t.min_qty,
                    };
                    const dt = t.discount_type || tierDiscountType;
                    if (dt === 'percent') obj.discount_percentage = t.discount_value;
                    else if (dt === 'fixed_discount') obj.discount_value = t.discount_value;
                    else obj.fix_price = t.discount_value;
                    return obj;
                  });
                }
              }

              details.push(`อัพเดต Deal (qty_discount): ชื่อ="${promotion.name}", ${tiers?.length || 0} ขั้น${skipStartTime ? ' (ข้าม start_time เพราะเริ่มไปแล้ว)' : ''}`);
            } else {
              // bundle_set — discount from promotion level
              if (promotion.discount_type === 'fix_price') {
                updatePayload.fix_price = bundlePrice || promotion.bundle_price;
              } else if (promotion.discount_type === 'percent') {
                const shopDiscount = platformPrice?.bundle_price ?? promotion.discount_value;
                updatePayload.discount_percentage = shopDiscount;
              } else if (promotion.discount_type === 'fixed_discount') {
                const shopDiscount = platformPrice?.bundle_price ?? promotion.discount_value;
                updatePayload.discount_value = shopDiscount;
              } else if (bundlePrice) {
                updatePayload.fix_price = bundlePrice;
              }

              const discountLabel = promotion.discount_type === 'percent'
                ? `ลด ${promotion.discount_value}%`
                : promotion.discount_type === 'fixed_discount'
                  ? `ลด ฿${promotion.discount_value}`
                  : bundlePrice ? `ราคา=${bundlePrice}` : '';
              details.push(`อัพเดต Deal: ชื่อ="${promotion.name}"${discountLabel ? `, ${discountLabel}` : ''}${skipStartTime ? ' (ข้าม start_time เพราะเริ่มไปแล้ว)' : ''}`);
            }

            console.log('[Shopee Deal] updateBundleDeal payload:', JSON.stringify(updatePayload, null, 2));
            await updateBundleDeal(creds, externalDealId, updatePayload);
          }

          // 2. Get current items on Shopee
          const { item_list: currentItems } = await getBundleDealItems(creds, externalDealId);
          const currentItemIds = new Set(currentItems.map(i => i.item_id));
          const newItemIds = new Set(Array.from(itemShopeeIds.values()));

          // 3. Add new items (ensure stock is sufficient first)
          const toAdd = Array.from(newItemIds).filter(id => !currentItemIds.has(id));
          if (toAdd.length > 0) {
            // Check and bump stock for new items
            let minStockRequired = (items || []).length; // bundle min_amount
            if (isQtyDiscount) {
              // For qty_discount, min stock = first tier's min_qty
              const { data: syncTiers } = await supabaseAdmin
                .from('promotion_tiers')
                .select('min_qty')
                .eq('promotion_id', promotion_id)
                .order('min_qty')
                .limit(1);
              if (syncTiers && syncTiers.length > 0) minStockRequired = syncTiers[0].min_qty;
            }
            const newItemDetails = await getItemFullDetails(creds, toAdd);
            for (const itemId of toAdd) {
              const detail = newItemDetails.get(itemId);
              if (!detail) continue;
              const lowStockModels = detail.models.filter(m => m.stock < minStockRequired);
              if (lowStockModels.length > 0) {
                const stockList = lowStockModels.map(m => ({
                  model_id: m.model_id,
                  seller_stock: [{ stock: minStockRequired }],
                }));
                await updateStock(creds, itemId, stockList);
                details.push(`เพิ่ม stock item_id ${itemId} เป็น ${minStockRequired} (ต่ำกว่าขั้นต่ำ)`);
              }
            }
            const addResult = await addBundleDealItems(creds, externalDealId, toAdd.map(id => ({ item_id: id, status: 1 as const })));
            if (addResult.failed_list && addResult.failed_list.length > 0) {
              const reasons = [...new Set(addResult.failed_list.map((f: { fail_error?: string; fail_message?: string }) => translateShopeeErrorSync(f.fail_error || f.fail_message || 'Unknown')))];
              const failList = addResult.failed_list.map((f: { item_id: number }, i: number) => {
                const name = shopeeIdToName.get(f.item_id) || `item_id ${f.item_id}`;
                return `${i + 1}. ${name}`;
              });
              details.push(`เพิ่มสินค้าไม่สำเร็จ เพราะ${reasons.join(' / ')}:\n${failList.join('\n')}`);
            } else {
              details.push(`เพิ่มสินค้าใหม่ ${toAdd.length} ตัว เข้า Bundle Deal`);
            }
          }

          // 4. Remove items no longer in promotion
          const toRemove = Array.from(currentItemIds).filter(id => !newItemIds.has(id));
          if (toRemove.length > 0) {
            await deleteBundleDealItems(creds, externalDealId, toRemove);
            details.push(`ลบสินค้า ${toRemove.length} ตัว ออกจาก Bundle Deal`);
          }

          if (toAdd.length === 0 && toRemove.length === 0) {
            details.push(`สินค้าใน Deal ไม่เปลี่ยนแปลง (${currentItemIds.size} ตัว)`);
          }

        } else {
          // ─── Update Add-on Deal ───
          // Fetch real status from Shopee API
          const addonDetail = await getAddOnDeal(creds, externalDealId);
          const realStatus = deriveDealStatus(addonDetail as { start_time?: number; end_time?: number; time_status?: number } | null);
          const isOngoing = realStatus === 'ongoing';

          // Update DB status to match Shopee
          if (deal.status !== realStatus && realStatus !== 'no_deal') {
            await supabaseAdmin.from('shopee_deals').update({ status: realStatus }).eq('id', deal.id);
          }

          if (isOngoing) {
            // Deal กำลัง run อยู่ — แก้ได้แค่ชื่อ, end_time, เพิ่ม/ลบสินค้า
            const endTime = promotion.end_date
              ? toBangkokTimestamp(promotion.end_date, false)
              : undefined;

            await updateAddOnDeal(creds, externalDealId, {
              add_on_deal_name: promotion.name,
              ...(endTime != null ? { end_time: endTime } : {}),
            });
            details.push(`อัพเดต Add-on Deal (ongoing): ชื่อ="${promotion.name}" (ราคา/start_time แก้ไม่ได้)`);
          } else {
            const nowTsAddon = Math.floor(Date.now() / 1000);
            const rawStartTimeAddon = promotion.start_date
              ? toBangkokTimestamp(promotion.start_date, true)
              : undefined;
            const skipStartTimeAddon = rawStartTimeAddon != null && rawStartTimeAddon <= nowTsAddon;
            const startTime = skipStartTimeAddon ? undefined : rawStartTimeAddon;
            const endTime = promotion.end_date
              ? toBangkokTimestamp(promotion.end_date, false)
              : undefined;

            await updateAddOnDeal(creds, externalDealId, {
              add_on_deal_name: promotion.name,
              start_time: startTime,
              end_time: endTime,
              purchase_min_spend: promotion.purchase_min_spend || undefined,
              per_gift_num: promotion.per_gift_num || undefined,
            });
            details.push(`อัพเดต Add-on Deal: ชื่อ="${promotion.name}"`);
          }

          // Update main items
          const mainItems = (items || []).filter(i => i.role === 'main');
          const mainShopeeIds = mainItems
            .map(i => itemShopeeIds.get(i.variation_id))
            .filter((id): id is number => !!id);

          const { main_item_list: currentMainItems } = await getAddOnDealMainItems(creds, externalDealId);
          const currentMainIds = new Set(currentMainItems.map(i => i.item_id));
          const newMainIds = new Set(mainShopeeIds);

          // Add new main items
          const mainToAdd = Array.from(newMainIds).filter(id => !currentMainIds.has(id));
          if (mainToAdd.length > 0) {
            await addAddOnDealMainItems(creds, externalDealId, mainToAdd.map(id => ({ item_id: id, status: 1 as const })));
          }

          // Remove old main items
          const mainToRemove = Array.from(currentMainIds).filter(id => !newMainIds.has(id));
          if (mainToRemove.length > 0) {
            await deleteAddOnDealMainItems(creds, externalDealId, mainToRemove);
          }

          // Update sub items (gifts/discounted)
          const subItems = (items || []).filter(i => i.role === 'gift' || i.role === 'discounted');
          if (subItems.length > 0) {
            // Get model_ids
            const subVariationIds = subItems.map(i => i.variation_id);
            const { data: links } = await supabaseAdmin
              .from('marketplace_product_links')
              .select('variation_id, external_model_id')
              .eq('account_id', deal.account_id)
              .eq('platform', 'shopee')
              .in('variation_id', subVariationIds);

            const modelIdMap = new Map<string, number>();
            for (const link of links || []) {
              if (link.variation_id && link.external_model_id) {
                modelIdMap.set(link.variation_id, parseInt(link.external_model_id) || 0);
              }
            }

            const { sub_item_list: currentSubItems } = await getAddOnDealSubItems(creds, externalDealId);
            const currentSubKeys = new Set(currentSubItems.map(i => `${i.item_id}:${i.model_id}`));

            const newSubList = subItems.map(i => ({
              item_id: itemShopeeIds.get(i.variation_id)!,
              model_id: modelIdMap.get(i.variation_id) || undefined,
              status: 1 as const,
              sub_item_input_price: i.role === 'gift' ? 0 : (i.special_price || 0),
              sub_item_limit: i.sub_item_limit ?? 1,
            })).filter(i => i.item_id);

            const newSubKeys = new Set(newSubList.map(i => `${i.item_id}:${i.model_id || 0}`));

            // Add new sub items
            const subToAdd = newSubList.filter(i => !currentSubKeys.has(`${i.item_id}:${i.model_id || 0}`));
            if (subToAdd.length > 0) {
              await addAddOnDealSubItems(creds, externalDealId, subToAdd);
            }

            // Remove old sub items
            const subToRemove = currentSubItems.filter(i => !newSubKeys.has(`${i.item_id}:${i.model_id}`));
            if (subToRemove.length > 0) {
              await deleteAddOnDealSubItems(creds, externalDealId, subToRemove.map(i => ({
                item_id: i.item_id,
                model_id: i.model_id,
              })));
            }

            // Update existing sub items (price changes)
            const subToUpdate = newSubList.filter(i => currentSubKeys.has(`${i.item_id}:${i.model_id || 0}`));
            if (subToUpdate.length > 0) {
              await updateAddOnDealSubItems(creds, externalDealId, subToUpdate);
            }
          }
        }

        // Update DB record
        await supabaseAdmin
          .from('shopee_deals')
          .update({
            start_time: promotion.start_date,
            end_time: promotion.end_date,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deal.id);

        results.push({ account_id: deal.account_id, shop_name: shopName, success: true, details });

        logIntegration({
          company_id: companyId,
          integration: 'shopee',
          account_id: account.id,
          account_name: shopName,
          direction: 'outgoing',
          action: 'update_deal',
          method: 'PATCH',
          api_path: deal.deal_type === 'bundle_deal'
            ? '/api/v2/bundle_deal/update_bundle_deal'
            : '/api/v2/add_on_deal/update_add_on_deal',
          request_body: { promotion_id, promotion_name: promotion.name, external_deal_id: externalDealId },
          response_body: { success: true },
          status: 'success',
          reference_type: 'promotion',
          reference_id: promotion_id,
          reference_label: `Update ${promotion.name} → ${shopName}`,
        });

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        results.push({ account_id: deal.account_id, shop_name: shopName, success: false, error: errMsg, details });

        logIntegration({
          company_id: companyId,
          integration: 'shopee',
          account_id: deal.account_id,
          account_name: shopName,
          direction: 'outgoing',
          action: 'update_deal',
          method: 'PATCH',
          api_path: '/api/shopee/deals',
          request_body: { promotion_id, promotion_name: promotion.name },
          status: 'error',
          error_message: errMsg,
          reference_type: 'promotion',
          reference_id: promotion_id,
          reference_label: `Update ${promotion.name} → ${shopName} (failed)`,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return NextResponse.json({
      success: successCount > 0,
      updated: successCount,
      total: results.length,
      results,
    });

  } catch (err) {
    console.error('PATCH /api/shopee/deals error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// ─── DELETE /api/shopee/deals — Delete Shopee deals for a promotion ──
// Called when user deletes a promotion and confirms Shopee deletion.

export async function DELETE(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = req.nextUrl;
    const promotionId = searchParams.get('promotion_id');

    if (!promotionId) {
      return NextResponse.json({ error: 'promotion_id required' }, { status: 400 });
    }

    // Get all shopee_deals for this promotion
    const { data: deals } = await supabaseAdmin
      .from('shopee_deals')
      .select('*, marketplace_accounts(shop_name)')
      .eq('promotion_id', promotionId)
      .eq('company_id', companyId);

    if (!deals || deals.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, total: 0, results: [] });
    }

    const results: { account_id: string; shop_name: string; success: boolean; error?: string }[] = [];

    for (const deal of deals) {
      const acc = deal.marketplace_accounts as unknown as { shop_name: string };
      const shopName = acc?.shop_name || 'ไม่ทราบ';

      try {
        const { data: account } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('*')
          .eq('id', deal.account_id)
          .single();

        if (!account) {
          // No account found — just clean up DB record
          await supabaseAdmin.from('shopee_deals').delete().eq('id', deal.id);
          results.push({ account_id: deal.account_id, shop_name: shopName, success: true });
          continue;
        }

        const creds = await ensureValidToken(account as unknown as ShopeeAccountRow);
        const externalDealId = deal.external_deal_id;

        if (externalDealId) {
          // Get real status from Shopee API (DB status may be stale)
          const dealDetail = deal.deal_type === 'bundle_deal'
            ? await getBundleDeal(creds, externalDealId)
            : await getAddOnDeal(creds, externalDealId);
          const realStatus = deriveDealStatus(dealDetail as { start_time?: number; end_time?: number; time_status?: number } | null);
          const strategy = getUnsyncStrategy(realStatus);

          if (strategy === 'delete') {
            try {
              if (deal.deal_type === 'bundle_deal') await deleteBundleDeal(creds, externalDealId);
              else await deleteAddOnDeal(creds, externalDealId);
            } catch (delErr) {
              // If delete fails (maybe status changed to ongoing), try end instead
              console.warn(`[DELETE shopee deal] delete failed, trying end: ${delErr instanceof Error ? delErr.message : 'Unknown'}`);
              try {
                if (deal.deal_type === 'bundle_deal') await endBundleDeal(creds, externalDealId);
                else await endAddOnDeal(creds, externalDealId);
              } catch (endErr) {
                console.warn(`[DELETE shopee deal] end also failed: ${endErr instanceof Error ? endErr.message : 'Unknown'}`);
              }
            }
          } else if (strategy === 'end') {
            try {
              if (deal.deal_type === 'bundle_deal') await endBundleDeal(creds, externalDealId);
              else await endAddOnDeal(creds, externalDealId);
            } catch (endErr) {
              console.warn(`[DELETE shopee deal] Could not end ${deal.deal_type} ${externalDealId}: ${endErr instanceof Error ? endErr.message : 'Unknown'}`);
            }
          }
          // strategy === 'skip' → expired, already ended on Shopee
        }

        // Remove DB record
        await supabaseAdmin.from('shopee_deals').delete().eq('id', deal.id);

        results.push({ account_id: deal.account_id, shop_name: shopName, success: true });

        logIntegration({
          company_id: companyId,
          integration: 'shopee',
          account_id: account.id,
          account_name: shopName,
          direction: 'outgoing',
          action: 'delete_deal',
          method: 'DELETE',
          api_path: deal.deal_type === 'bundle_deal'
            ? '/api/v2/bundle_deal/delete_bundle_deal'
            : '/api/v2/add_on_deal/delete_add_on_deal',
          request_body: { promotion_id: promotionId, external_deal_id: externalDealId },
          response_body: { success: true },
          status: 'success',
          reference_type: 'promotion',
          reference_id: promotionId,
          reference_label: `Delete deal → ${shopName}`,
        });

      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'เกิดข้อผิดพลาด';
        results.push({ account_id: deal.account_id, shop_name: shopName, success: false, error: errMsg });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return NextResponse.json({
      success: successCount > 0,
      deleted: successCount,
      total: results.length,
      results,
    });

  } catch (err) {
    console.error('DELETE /api/shopee/deals error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}
