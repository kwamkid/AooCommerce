import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ensureValidToken, ShopeeAccountRow, getItemFullDetails, updateStock } from '@/lib/shopee/api';
import {
  createBundleDeal,
  addBundleDealItems,
  deleteBundleDeal,
  createAddOnDeal,
  addAddOnDealMainItems,
  addAddOnDealSubItems,
  deleteAddOnDeal,
  deleteAddOnDealMainItems,
} from '@/lib/shopee/deals';
import { logIntegration } from '@/lib/integration-logger';
import { exportProductToShopee, type ExportOptions } from '@/lib/shopee/product-export';

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
        id, variation_id, role, quantity, special_price,
        product_variations!inner(
          id, default_price,
          products!inner(id, name)
        )
      `)
      .eq('promotion_id', promotion_id)
      .order('sort_order');

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'โปรโมชั่นไม่มีสินค้า' }, { status: 400 });
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

          const itemShopeeIds: Map<string, number> = new Map(); // variation_id → shopee_item_id

          for (const item of items) {
            const pv = item.product_variations as unknown as {
              id: string; products: { id: string; name: string };
            };

            // Check marketplace_product_links
            const { data: link } = await supabaseAdmin
              .from('marketplace_product_links')
              .select('external_item_id')
              .eq('variation_id', item.variation_id)
              .eq('account_id', account_id)
              .eq('platform', 'shopee')
              .single();

            if (link?.external_item_id) {
              itemShopeeIds.set(item.variation_id, parseInt(link.external_item_id));
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
              const { data: newLink } = await supabaseAdmin
                .from('marketplace_product_links')
                .select('external_item_id')
                .eq('variation_id', item.variation_id)
                .eq('account_id', account_id)
                .eq('platform', 'shopee')
                .single();

              if (!newLink?.external_item_id) {
                // Fallback: use exported item_id directly (for simple products, all variations share the same item_id)
                if (exportResult.item_id) {
                  itemShopeeIds.set(item.variation_id, exportResult.item_id);
                  send({
                    step: 'check_products',
                    status: 'success',
                    detail: `${pv.products.name} → Push สำเร็จ (item_id: ${exportResult.item_id})`,
                  });
                } else {
                  send({
                    step: 'check_products',
                    status: 'error',
                    message: `Push สำเร็จ แต่ไม่พบ item_id สำหรับ variation ของ "${pv.products.name}"`,
                  });
                  throw new Error(`Push สำเร็จ แต่ไม่พบ item_id สำหรับ variation ของ "${pv.products.name}"`);
                }
              } else {
                itemShopeeIds.set(item.variation_id, parseInt(newLink.external_item_id));
                send({
                  step: 'check_products',
                  status: 'success',
                  detail: `${pv.products.name} → Push สำเร็จ (item_id: ${newLink.external_item_id})`,
                });
              }
            }
          }

          send({ step: 'check_products', status: 'success', message: 'ตรวจสอบสินค้าสำเร็จ' });

          // ─── Step 1.5: Ensure stock >= 1 on Shopee (temp bump for deal creation) ───
          {
            const shopeeItemIds = [...new Set(itemShopeeIds.values())];
            send({ step: 'check_products', status: 'in_progress', message: 'ตรวจสอบ stock บน Shopee...' });

            const itemDetails = await getItemFullDetails(creds, shopeeItemIds);

            for (const [, shopeeItemId] of itemShopeeIds) {
              const detail = itemDetails.get(shopeeItemId);
              if (!detail) continue;

              // Check if any model has 0 stock → bump to 1
              const zeroStockModels = detail.models.filter(m => m.stock === 0);
              if (zeroStockModels.length > 0) {
                send({
                  step: 'check_products',
                  status: 'in_progress',
                  message: `${detail.item_name} — stock = 0 บน Shopee, เพิ่มเป็น 1 ชั่วคราว...`,
                });

                const stockList = zeroStockModels.map(m => ({
                  model_id: m.model_id,
                  seller_stock: [{ stock: 1 }],
                }));

                const stockResult = await updateStock(creds, shopeeItemId, stockList);
                if (stockResult.error) {
                  send({
                    step: 'check_products',
                    status: 'in_progress',
                    detail: `เพิ่ม stock ไม่สำเร็จ: ${stockResult.error} (อาจทำให้ add item ล้มเหลว)`,
                  });
                } else {
                  send({
                    step: 'check_products',
                    status: 'in_progress',
                    detail: `${detail.item_name} — เพิ่ม stock เป็น 1 สำเร็จ (${zeroStockModels.length} model)`,
                  });
                }
              }
            }
          }

          const nowTs = Math.floor(Date.now() / 1000);
          let startTs = Math.floor(new Date(start_time).getTime() / 1000);
          const endTs = Math.floor(new Date(end_time).getTime() / 1000);

          // Shopee requires start_time in the future — auto-adjust if past
          if (startTs <= nowTs) {
            startTs = nowTs + 600; // +10 minutes
            send({ step: 'create_deal', status: 'in_progress', message: 'วันเริ่มต้นผ่านไปแล้ว — ปรับเป็น +10 นาที' });
          }

          // ─── Step 2: Create deal on Shopee ───
          send({ step: 'create_deal', status: 'in_progress', message: 'สร้างโปรโมชั่นบน Shopee...' });

          let externalDealId: number;
          let dealType: string;

          if (promotion.promotion_type === 'bundle_set' || promotion.promotion_type === 'qty_discount') {
            // Bundle Deal
            dealType = 'bundle_deal';

            let ruleType: 1 | 2 | 3 = 1;
            let fixPrice: number | undefined;
            let discountPercentage: number | undefined;
            let discountValue: number | undefined;
            let minAmount = 2;

            if (promotion.promotion_type === 'bundle_set') {
              ruleType = 1; // FIX_PRICE
              fixPrice = promotion.bundle_price;
              minAmount = items.length;
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

              if (firstTier.discount_type === 'percent') {
                ruleType = 2;
                discountPercentage = firstTier.discount_value;
              } else if (firstTier.discount_type === 'fixed_discount') {
                ruleType = 3;
                discountValue = firstTier.discount_value;
              } else {
                ruleType = 1;
                fixPrice = firstTier.discount_value;
              }
            }

            // Shopee bundle deal name limit = 25 characters
            const dealName = promotion.name.trim().slice(0, 25) || 'Bundle Deal';

            const result = await createBundleDeal(creds, {
              name: dealName,
              rule_type: ruleType,
              fix_price: fixPrice,
              discount_percentage: discountPercentage,
              discount_value: discountValue,
              min_amount: minAmount,
              start_time: startTs,
              end_time: endTs,
              purchase_limit: 1,
            });

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
            const uniqueItemIds = [...new Set(items.map(item => itemShopeeIds.get(item.variation_id)!))];
            const bundleItems = uniqueItemIds.map(id => ({
              item_id: id,
              status: 1 as const,
            }));

            // Add items one-by-one to handle partial failures gracefully
            const failedItems: { item_id: number; fail_message: string }[] = [];
            const succeededItems: number[] = [];

            for (const item of bundleItems) {
              try {
                const addResult = await addBundleDealItems(creds, externalDealId, [item]);
                if (addResult.failed_list.length > 0) {
                  const f = addResult.failed_list[0];
                  failedItems.push({ item_id: f.item_id, fail_message: f.fail_message || f.fail_error });
                  send({ step: 'add_items', status: 'in_progress', detail: `item_id ${f.item_id}: ${f.fail_message || f.fail_error}` });
                } else {
                  succeededItems.push(item.item_id);
                  send({ step: 'add_items', status: 'in_progress', detail: `item_id ${item.item_id} เพิ่มสำเร็จ` });
                }
              } catch (addErr) {
                const msg = addErr instanceof Error ? addErr.message : 'Unknown error';
                failedItems.push({ item_id: item.item_id, fail_message: msg });
                send({ step: 'add_items', status: 'in_progress', detail: `item_id ${item.item_id}: ${msg}` });
              }
            }

            completedSteps.push({ type: 'items_added', itemIds: succeededItems });

            if (failedItems.length > 0) {
              const failDetails = failedItems.map(f => `item_id ${f.item_id}: ${f.fail_message}`).join(', ');

              if (succeededItems.length === 0) {
                throw new Error(`เพิ่มสินค้าไม่สำเร็จทุกรายการ: ${failDetails}`);
              }
              warnings.push(`สินค้า ${failedItems.length} รายการเพิ่มไม่สำเร็จ: ${failDetails}`);
              send({ step: 'add_items', status: 'success', message: `เพิ่มสินค้าได้ ${succeededItems.length}/${bundleItems.length} รายการ (${failedItems.length} รายการล้มเหลว)` });
            } else {
              send({ step: 'add_items', status: 'success', message: `เพิ่มสินค้า ${succeededItems.length} รายการสำเร็จ` });
            }

          } else {
            // Add-on Deal (buy_get_free / buy_get_discount)
            dealType = 'add_on_deal';

            const promotionType = promotion.promotion_type === 'buy_get_free' ? 1 : 0;

            const addOnParams: Parameters<typeof createAddOnDeal>[1] = {
              add_on_deal_name: promotion.name.trim().slice(0, 25) || 'Add-on Deal',
              start_time: startTs,
              end_time: endTs,
              promotion_type: promotionType as 0 | 1,
            };

            // For gift_with_min_spend (type=1): send purchase_min_spend and per_gift_num
            if (promotionType === 1) {
              if (promotion.purchase_min_spend != null && promotion.purchase_min_spend > 0) {
                addOnParams.purchase_min_spend = promotion.purchase_min_spend;
              }
              if (promotion.per_gift_num != null && promotion.per_gift_num > 0) {
                addOnParams.per_gift_num = promotion.per_gift_num;
              }
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
              .map(i => ({
                item_id: itemShopeeIds.get(i.variation_id)!,
                status: 1 as const,
              }));

            if (mainItems.length > 0) {
              await addAddOnDealMainItems(creds, externalDealId, mainItems);
              completedSteps.push({ type: 'main_items_added', itemIds: mainItems.map(i => i.item_id) });
            }

            send({ step: 'add_main_items', status: 'success', message: `เพิ่มสินค้าหลัก ${mainItems.length} รายการสำเร็จ` });

            // ─── Step 4: Add sub items (gift/discounted) — must include model_id ───
            send({ step: 'add_sub_items', status: 'in_progress', message: 'เพิ่มของแถม/สินค้าราคาพิเศษ...' });

            // Fetch model_ids from marketplace_product_links for sub item variations
            const subItemVariationIds = items
              .filter(i => i.role === 'gift' || i.role === 'discounted')
              .map(i => i.variation_id);

            const modelIdMap = new Map<string, number>(); // variation_id → model_id
            if (subItemVariationIds.length > 0) {
              const { data: links } = await supabaseAdmin
                .from('marketplace_product_links')
                .select('variation_id, external_model_id')
                .eq('account_id', account_id)
                .eq('platform', 'shopee')
                .in('variation_id', subItemVariationIds);

              for (const link of links || []) {
                if (link.variation_id && link.external_model_id) {
                  modelIdMap.set(link.variation_id, parseInt(link.external_model_id) || 0);
                }
              }
            }

            const subItems = items
              .filter(i => i.role === 'gift' || i.role === 'discounted')
              .map(i => ({
                item_id: itemShopeeIds.get(i.variation_id)!,
                model_id: modelIdMap.get(i.variation_id) || undefined,
                status: 1 as const,
                sub_item_input_price: i.role === 'gift' ? 0 : (i.special_price || 0),
                sub_item_limit: 1,
              }));

            if (subItems.length > 0) {
              const subResult = await addAddOnDealSubItems(creds, externalDealId, subItems);
              completedSteps.push({ type: 'sub_items_added' });

              // Check for failures
              const failures = subResult.sub_item_list.filter(s => s.fail_error);
              if (failures.length > 0) {
                const failDetails = failures.map(f => `item_id ${f.item_id}: ${f.fail_message || f.fail_error}`).join(', ');
                send({ step: 'add_sub_items', status: 'in_progress', detail: `บางรายการเพิ่มไม่สำเร็จ: ${failDetails}` });

                const subSuccessCount = subItems.length - failures.length;
                if (subSuccessCount === 0) {
                  throw new Error(`เพิ่มของแถมไม่สำเร็จทุกรายการ: ${failDetails}`);
                }
                warnings.push(`ของแถม ${failures.length} รายการเพิ่มไม่สำเร็จ: ${failDetails}`);
                send({ step: 'add_sub_items', status: 'success', message: `เพิ่มของแถม/ราคาพิเศษ ${subSuccessCount}/${subItems.length} รายการ (${failures.length} รายการล้มเหลว)` });
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
