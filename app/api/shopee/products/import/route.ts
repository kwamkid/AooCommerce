import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  getItemList,
  getItemFullDetails,
  getShopeeCategories,
  ShopeeAccountRow,
  ShopeeItemFullDetail,
  ShopeeModelDetail,
} from '@/lib/shopee-api';
import { logIntegration } from '@/lib/integration-logger';
import { getCategoryName } from '@/lib/shopee-product-sync';

// GET — List Shopee items (paginated) with linked status
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('account_id');
    const offset = parseInt(searchParams.get('offset') || '0');
    const pageSize = parseInt(searchParams.get('page_size') || '20');

    if (!accountId) {
      return NextResponse.json({ error: 'account_id is required' }, { status: 400 });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
    }

    const creds = await ensureValidToken(account as ShopeeAccountRow);

    // Fetch item list from Shopee
    const page = await getItemList(creds, { offset, pageSize, itemStatus: 'NORMAL' });

    if (page.items.length === 0) {
      return NextResponse.json({ items: [], total: page.totalCount, hasMore: false });
    }

    // Get full details for items on this page
    const itemIds = page.items.map(i => i.item_id);
    const details = await getItemFullDetails(creds, itemIds);

    // Check which items are already linked
    const { data: existingLinks } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('external_item_id, product_id, products!inner(name)')
      .eq('account_id', accountId)
      .in('external_item_id', itemIds.map(String));

    const linkedMap = new Map<string, { product_id: string; product_name: string }>();
    if (existingLinks) {
      for (const link of existingLinks) {
        if (!linkedMap.has(link.external_item_id)) {
          const product = link.products as unknown as { name: string };
          linkedMap.set(link.external_item_id, {
            product_id: link.product_id,
            product_name: product?.name || '',
          });
        }
      }
    }

    // Format items for response
    const items = [];
    for (const itemId of itemIds) {
      const detail = details.get(itemId);
      if (!detail) continue;

      items.push({
        item_id: detail.item_id,
        item_name: detail.item_name,
        item_sku: detail.item_sku,
        item_status: detail.item_status,
        images: detail.images,
        has_model: detail.has_model,
        category_id: detail.category_id,
        weight: detail.weight,
        models: detail.models.map(m => ({
          model_id: m.model_id,
          model_sku: m.model_sku,
          model_name: m.model_name,
          current_price: m.current_price,
          original_price: m.original_price,
          stock: m.stock,
          image_url: m.image_url,
        })),
        tier_variations: detail.tierVariations,
        is_linked: linkedMap.has(String(detail.item_id)),
        linked_product: linkedMap.get(String(detail.item_id)) || null,
      });
    }

    return NextResponse.json({
      items,
      total: page.totalCount,
      hasMore: page.hasMore,
      nextOffset: page.nextOffset,
    });
  } catch (error) {
    console.error('GET shopee import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch items' },
      { status: 500 }
    );
  }
}

// POST — Execute import (SSE streaming)
interface ImportItem {
  item_id: number;
  action: 'create' | 'link';
  link_to_product_id?: string;
  link_to_variation_mappings?: Array<{
    model_id: number;
    variation_id: string;
  }>;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { shopee_account_id, items } = body as {
      shopee_account_id: string;
      items: ImportItem[];
    };

    if (!shopee_account_id) {
      return NextResponse.json({ error: 'shopee_account_id is required' }, { status: 400 });
    }
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'items is required' }, { status: 400 });
    }

    const { data: account, error: accErr } = await supabaseAdmin
      .from('shopee_accounts')
      .select('*')
      .eq('id', shopee_account_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (accErr || !account) {
      return NextResponse.json({ error: 'Shopee account not found' }, { status: 404 });
    }

    const companyId = auth.companyId!;
    const accountName = account.shop_name || `Shop ${account.shop_id}`;
    const creds = await ensureValidToken(account as ShopeeAccountRow);

    // SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'started', total: items.length });

        let successCount = 0;
        let errorCount = 0;

        // Collect all item_ids to fetch details in batch
        const allItemIds = items.map(i => i.item_id);
        let allDetails: Map<number, ShopeeItemFullDetail>;

        try {
          allDetails = await getItemFullDetails(creds, allItemIds);
        } catch (e) {
          send({ type: 'error', message: `Failed to fetch item details: ${e instanceof Error ? e.message : 'Unknown'}` });
          controller.close();
          return;
        }

        // Ensure category cache exists for this account (needed for getCategoryName)
        try {
          const { data: existingCache } = await supabaseAdmin
            .from('shopee_category_cache')
            .select('id')
            .eq('account_id', shopee_account_id)
            .single();

          if (!existingCache) {
            const { data: catData } = await getShopeeCategories(creds);
            const catResponse = catData as { category_list?: unknown[] };
            const categoryList = catResponse?.category_list || [];
            if (categoryList.length > 0) {
              await supabaseAdmin
                .from('shopee_category_cache')
                .upsert({
                  account_id: shopee_account_id,
                  company_id: companyId,
                  category_data: categoryList,
                  fetched_at: new Date().toISOString(),
                }, { onConflict: 'account_id' });
            }
          }
        } catch { /* non-critical, continue import */ }

        for (let idx = 0; idx < items.length; idx++) {
          const importItem = items[idx];
          const detail = allDetails.get(importItem.item_id);

          if (!detail) {
            send({ type: 'progress', current: idx + 1, total: items.length, success: false, item_name: `Item #${importItem.item_id}`, error: 'Item not found on Shopee' });
            errorCount++;
            continue;
          }

          try {
            if (importItem.action === 'create') {
              // Create new product in our system from Shopee item
              await importCreateProduct(companyId, account.id, accountName, creds, detail);
              send({ type: 'progress', current: idx + 1, total: items.length, success: true, item_name: detail.item_name });
              successCount++;
            } else if (importItem.action === 'link') {
              // Link to existing product
              if (!importItem.link_to_product_id) {
                send({ type: 'progress', current: idx + 1, total: items.length, success: false, item_name: detail.item_name, error: 'ไม่ได้เลือกสินค้าที่จะผูก' });
                errorCount++;
                continue;
              }
              await importLinkProduct(
                companyId, account.id, accountName,
                detail,
                importItem.link_to_product_id,
                importItem.link_to_variation_mappings
              );
              // Push our stock to Shopee immediately
              const { pushStockToShopee } = await import('@/lib/shopee-product-sync');
              pushStockToShopee(account as ShopeeAccountRow, importItem.link_to_product_id).catch(() => {});
              send({ type: 'progress', current: idx + 1, total: items.length, success: true, item_name: detail.item_name });
              successCount++;
            }
          } catch (e) {
            const errMsg = e instanceof Error ? e.message : 'Unknown error';
            send({ type: 'progress', current: idx + 1, total: items.length, success: false, item_name: detail.item_name, error: errMsg });
            errorCount++;
          }
        }

        // Log integration
        logIntegration({
          company_id: companyId,
          integration: 'shopee',
          account_id: account.id,
          direction: 'incoming',
          action: 'import_products',
          status: errorCount === 0 ? 'success' : 'error',
          response_body: { total: items.length, success: successCount, errors: errorCount },
        });

        send({ type: 'done', total: items.length, success_count: successCount, error_count: errorCount });
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
  } catch (error) {
    console.error('POST shopee import error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    );
  }
}

// --- Import: Create new product from Shopee item ---

async function importCreateProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  creds: Awaited<ReturnType<typeof ensureValidToken>>,
  item: ShopeeItemFullDetail
) {
  const primaryImage = item.images[0] || null;

  if (item.has_model && item.models.length > 1) {
    // Variation product
    const parentCode = item.item_sku || `SP-${item.item_id}`;

    // Check if product already exists
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', parentCode)
      .eq('is_active', true)
      .single();

    let parentProductId: string;

    if (existing) {
      parentProductId = existing.id;
    } else {
      // Create variation type IDs
      const tierNames = item.tierVariations.length > 0 ? item.tierVariations : ['ตัวเลือกสินค้า'];
      const variationTypeIds: string[] = [];
      for (const name of tierNames) {
        const { data: vt } = await supabaseAdmin
          .from('variation_types')
          .select('id')
          .eq('company_id', companyId)
          .eq('name', name)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (vt) {
          variationTypeIds.push(vt.id);
        } else {
          const { data: newVt } = await supabaseAdmin
            .from('variation_types')
            .insert({ company_id: companyId, name, sort_order: 0 })
            .select('id')
            .single();
          if (newVt) variationTypeIds.push(newVt.id);
        }
      }

      const { data: newParent, error } = await supabaseAdmin
        .from('products')
        .insert({
          company_id: companyId,
          code: parentCode,
          name: item.item_name,
          variation_label: null,
          image: primaryImage,
          source: 'shopee',
          selected_variation_types: variationTypeIds,
          description: `นำเข้าจาก Shopee Item #${item.item_id}`,
          is_active: true,
        })
        .select('id')
        .single();

      if (error || !newParent) throw new Error(`Failed to create product: ${error?.message}`);
      parentProductId = newParent.id;

      // Insert images (preserve Shopee order)
      for (let i = 0; i < item.images.length; i++) {
        await upsertImage(companyId, parentProductId, null, item.images[i], i);
      }
    }

    // Create variations + links
    for (const model of item.models) {
      const sku = model.model_sku || `SP-${item.item_id}-${model.model_id}`;
      const attributes = buildAttributes(item.tierVariations, model.model_name);

      // Check if variation already exists
      const { data: existingVar } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('product_id', parentProductId)
        .eq('company_id', companyId)
        .eq('sku', sku)
        .single();

      let variationId: string;
      if (existingVar) {
        variationId = existingVar.id;
      } else {
        const { data: newVar, error: varErr } = await supabaseAdmin
          .from('product_variations')
          .insert({
            company_id: companyId,
            product_id: parentProductId,
            variation_label: model.model_name || sku,
            sku,
            attributes,
            default_price: model.current_price,
            stock: 0,
            is_active: true,
          })
          .select('id')
          .single();

        if (varErr || !newVar) continue;
        variationId = newVar.id;

        if (model.image_url) {
          await upsertImage(companyId, null, variationId, model.image_url);
        }
      }

      // Import stock from Shopee to default warehouse
      if (model.stock > 0) {
        await importStockFromShopee(companyId, variationId, model.stock);
      }

      // Create marketplace link
      await createImportLink(companyId, accountId, accountName, parentProductId, variationId, item, model);
    }
  } else {
    // Simple product
    const model = item.models[0];
    const sku = model?.model_sku || item.item_sku || '';
    const productCode = sku || `SP-${item.item_id}`;
    const simpleLabel = sku || item.item_name;

    // Check if product exists
    const { data: existing } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', companyId)
      .eq('code', productCode)
      .eq('is_active', true)
      .single();

    let productId: string;
    let variationId: string | null = null;

    if (existing) {
      productId = existing.id;
      const { data: existingVar } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('product_id', productId)
        .eq('is_active', true)
        .limit(1)
        .single();
      variationId = existingVar?.id || null;
    } else {
      const { data: product, error: prodErr } = await supabaseAdmin
        .from('products')
        .insert({
          company_id: companyId,
          code: productCode,
          name: item.item_name,
          variation_label: simpleLabel,
          image: primaryImage,
          source: 'shopee',
          is_active: true,
        })
        .select('id')
        .single();

      if (prodErr || !product) throw new Error(`Failed to create product: ${prodErr?.message}`);
      productId = product.id;

      for (let i = 0; i < item.images.length; i++) {
        await upsertImage(companyId, productId, null, item.images[i], i);
      }

      const { data: newVar } = await supabaseAdmin
        .from('product_variations')
        .insert({
          company_id: companyId,
          product_id: productId,
          variation_label: simpleLabel,
          sku: sku || null,
          default_price: model?.current_price || 0,
          stock: 0,
          is_active: true,
        })
        .select('id')
        .single();

      variationId = newVar?.id || null;
    }

    // Import stock from Shopee
    if (model && model.stock > 0 && variationId) {
      await importStockFromShopee(companyId, variationId, model.stock);
    }

    // Create marketplace link
    await createImportLink(companyId, accountId, accountName, productId, variationId, item, model || { model_id: 0, model_sku: '', model_name: '', current_price: 0, original_price: 0, stock: 0, tier_index: [] });
  }
}

// --- Import: Link to existing product ---

async function importLinkProduct(
  companyId: string,
  accountId: string,
  accountName: string,
  item: ShopeeItemFullDetail,
  productId: string,
  variationMappings?: Array<{ model_id: number; variation_id: string }>
) {
  if (item.has_model && item.models.length > 1 && variationMappings) {
    // Map each Shopee model to a local variation
    for (const mapping of variationMappings) {
      const model = item.models.find(m => m.model_id === mapping.model_id);
      if (!model) continue;

      await createImportLink(companyId, accountId, accountName, productId, mapping.variation_id, item, model);
    }
  } else {
    // Simple product or single model — link to first variation
    const model = item.models[0];
    const { data: variation } = await supabaseAdmin
      .from('product_variations')
      .select('id')
      .eq('product_id', productId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .limit(1)
      .single();

    await createImportLink(
      companyId, accountId, accountName,
      productId,
      variation?.id || null,
      item,
      model || { model_id: 0, model_sku: '', model_name: '', current_price: 0, original_price: 0, stock: 0, tier_index: [] }
    );
  }
}

// --- Helpers ---

async function createImportLink(
  companyId: string,
  accountId: string,
  accountName: string,
  productId: string,
  variationId: string | null,
  item: ShopeeItemFullDetail,
  model: ShopeeModelDetail
) {
  const categoryName = item.category_id
    ? await getCategoryName(accountId, item.category_id)
    : '';

  await supabaseAdmin.from('marketplace_product_links').upsert({
    company_id: companyId,
    platform: 'shopee',
    account_id: accountId,
    account_name: accountName,
    product_id: productId,
    variation_id: variationId,
    external_item_id: String(item.item_id),
    external_model_id: String(model.model_id),
    external_sku: model.model_sku || item.item_sku || '',
    external_item_status: item.item_status,
    platform_price: model.current_price || null,
    platform_product_name: item.item_name,
    platform_primary_image: item.images[0] || null,
    shopee_category_id: item.category_id ? String(item.category_id) : null,
    shopee_category_name: categoryName || null,
    weight: item.weight || null,
    sync_enabled: true,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'account_id,external_item_id,external_model_id' });
}

async function importStockFromShopee(companyId: string, variationId: string, shopeeStock: number) {
  if (shopeeStock <= 0) return;

  // Find default warehouse
  const { data: warehouse } = await supabaseAdmin
    .from('warehouses')
    .select('id')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .single();

  if (!warehouse) return;

  // Check if inventory exists
  const { data: inv } = await supabaseAdmin
    .from('inventory')
    .select('id, quantity')
    .eq('warehouse_id', warehouse.id)
    .eq('variation_id', variationId)
    .eq('company_id', companyId)
    .single();

  if (inv) {
    // Only import if current stock is 0
    if (inv.quantity === 0) {
      await supabaseAdmin
        .from('inventory')
        .update({ quantity: shopeeStock, updated_at: new Date().toISOString() })
        .eq('id', inv.id);
    }
  } else {
    await supabaseAdmin
      .from('inventory')
      .insert({
        company_id: companyId,
        warehouse_id: warehouse.id,
        variation_id: variationId,
        quantity: shopeeStock,
        reserved_quantity: 0,
      });
  }
}

async function upsertImage(companyId: string, productId: string | null, variationId: string | null, imageUrl: string, sortOrder: number = 0) {
  if (!imageUrl) return;
  try {
    let query = supabaseAdmin.from('product_images').select('id, sort_order').eq('image_url', imageUrl).eq('company_id', companyId);
    if (productId) query = query.eq('product_id', productId);
    if (variationId) query = query.eq('variation_id', variationId);
    const { data: existing } = await query.limit(1).single();
    if (existing) {
      if (existing.sort_order !== sortOrder) {
        await supabaseAdmin.from('product_images').update({ sort_order: sortOrder }).eq('id', existing.id);
      }
      return;
    }

    await supabaseAdmin.from('product_images').insert({
      company_id: companyId,
      product_id: productId,
      variation_id: variationId,
      image_url: imageUrl,
      storage_path: 'shopee-external',
      sort_order: sortOrder,
    });
  } catch {
    // ignore duplicate
  }
}

function buildAttributes(tierVariationNames: string[], modelName: string): Record<string, string> {
  if (!modelName) return {};
  if (tierVariationNames.length === 0) return { 'ตัวเลือกสินค้า': modelName };

  const values = modelName.split(',').map(v => v.trim());
  const attributes: Record<string, string> = {};
  for (let i = 0; i < tierVariationNames.length; i++) {
    attributes[tierVariationNames[i]] = values[i] || modelName;
  }
  return attributes;
}
