import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  uploadImageByUrl,
  addItem,
  initTierVariation,
  getShopeeLogistics,
  getShopeeCategoryAttributes,
  ShopeeAccountRow,
  ShopeeCredentials,
} from '@/lib/shopee-api';

// --- Types ---

export interface ExportOptions {
  shopee_category_id: number;
  shopee_category_name?: string;
  weight?: number; // kg, default 0.5
}

export interface ExportProgressEvent {
  phase: 'uploading_images' | 'creating_item' | 'done' | 'error';
  current: number;
  total: number;
  label: string;
  product_name?: string;
  success?: boolean;
  error?: string;
}

export type ExportProgressCallback = (event: ExportProgressEvent) => void;

export interface ExportResult {
  success: boolean;
  item_id?: number;
  error?: string;
  product_name?: string;
}

export interface BulkExportResult {
  total: number;
  success_count: number;
  error_count: number;
  results: ExportResult[];
}

// --- Logistics Cache ---
let logisticsCache: { creds_key: string; channels: { logistics_channel_id: number; enabled: boolean }[]; fetched_at: number } | null = null;

async function getEnabledLogistics(creds: ShopeeCredentials): Promise<number[]> {
  const cacheKey = `${creds.shop_id}`;
  const now = Date.now();

  if (logisticsCache && logisticsCache.creds_key === cacheKey && (now - logisticsCache.fetched_at) < 3600000) {
    return logisticsCache.channels
      .filter(ch => ch.enabled)
      .map(ch => ch.logistics_channel_id);
  }

  const { data, error } = await getShopeeLogistics(creds);
  if (error) {
    console.error('[Shopee Export] Failed to get logistics:', error);
    return [];
  }

  const response = data as { logistics_channel_list?: { logistics_channel_id: number; enabled: boolean }[] };
  const channels = response.logistics_channel_list || [];

  logisticsCache = { creds_key: cacheKey, channels, fetched_at: now };

  return channels.filter(ch => ch.enabled).map(ch => ch.logistics_channel_id);
}

// --- Mandatory Attributes ---

type AttributeEntry = { attribute_id: number; attribute_value_list: Array<{ value_id: number; original_value_name: string }> };

// Memory cache: categoryId → attribute_list that was successfully used in export
const categoryAttributeCache = new Map<number, AttributeEntry[]>();

interface ShopeeAttributeValue {
  value_id: number;
  original_value_name: string;
  display_value_name: string;
}

interface ShopeeAttribute {
  attribute_id: number;
  original_attribute_name: string;
  display_attribute_name: string;
  is_mandatory: boolean;
  input_validation_type: string;
  format_type: string;
  input_type: string;
  attribute_value_list?: ShopeeAttributeValue[];
}

/**
 * Look up stored shopee_attributes from marketplace_product_links for the same category.
 * Returns cached attributes if another product in the same category was previously imported/exported.
 */
async function getStoredCategoryAttributes(
  companyId: string,
  categoryId: number
): Promise<AttributeEntry[] | null> {
  try {
    const { data } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('shopee_attributes')
      .eq('company_id', companyId)
      .eq('shopee_category_id', categoryId)
      .not('shopee_attributes', 'is', null)
      .limit(1)
      .single();

    if (data?.shopee_attributes && Array.isArray(data.shopee_attributes)) {
      console.log(`[Shopee Export] Found stored attributes for category ${categoryId} (${data.shopee_attributes.length} attrs)`);
      return data.shopee_attributes as AttributeEntry[];
    }
  } catch {
    // No stored attributes found
  }
  return null;
}

/**
 * Fetch mandatory attributes for a Shopee category and return default attribute_list.
 * Priority: 1) stored shopee_attributes, 2) memory cache, 3) API call
 */
async function getMandatoryAttributes(
  creds: ShopeeCredentials,
  categoryId: number,
  companyId?: string
): Promise<AttributeEntry[]> {
  // Priority 1: Check stored attributes from DB
  if (companyId) {
    const stored = await getStoredCategoryAttributes(companyId, categoryId);
    if (stored && stored.length > 0) return stored;
  }

  // Priority 2: Check memory cache
  const cached = categoryAttributeCache.get(categoryId);
  if (cached) {
    console.log(`[Shopee Export] Using cached attributes for category ${categoryId} (${cached.length} attrs)`);
    return cached;
  }

  // Priority 3: Fetch from API
  try {
    const { data, error } = await getShopeeCategoryAttributes(creds, categoryId);
    if (error || !data) {
      console.error('[Shopee Export] Failed to get category attributes:', error);
      return [];
    }

    const response = data as { attribute_list?: ShopeeAttribute[] };
    const attributes = response.attribute_list || [];
    const mandatoryAttrs = attributes.filter(a => a.is_mandatory);

    console.log(`[Shopee Export] Category ${categoryId}: ${attributes.length} attributes, ${mandatoryAttrs.length} mandatory`);

    const result: AttributeEntry[] = [];

    for (const attr of mandatoryAttrs) {
      const values = attr.attribute_value_list || [];

      if (values.length > 0) {
        // Has predefined values — pick the first one (often "No Brand", "N/A", etc.)
        result.push({
          attribute_id: attr.attribute_id,
          attribute_value_list: [{ value_id: values[0].value_id, original_value_name: values[0].original_value_name }],
        });
        console.log(`[Shopee Export] Mandatory attr "${attr.original_attribute_name}" → "${values[0].original_value_name}" (value_id=${values[0].value_id})`);
      } else {
        // Free-text — use "N/A"
        result.push({
          attribute_id: attr.attribute_id,
          attribute_value_list: [{ value_id: 0, original_value_name: 'N/A' }],
        });
        console.log(`[Shopee Export] Mandatory attr "${attr.original_attribute_name}" → "N/A" (free-text)`);
      }
    }

    return result;
  } catch (e) {
    console.error('[Shopee Export] getMandatoryAttributes error:', e);
    return [];
  }
}

// --- Image Upload ---

async function uploadProductImages(
  creds: ShopeeCredentials,
  imageUrls: string[]
): Promise<{ image_id_list: string[]; errors: string[] }> {
  const imageIds: string[] = [];
  const errors: string[] = [];

  for (const url of imageUrls.slice(0, 9)) { // Shopee max 9 images
    try {
      const { data, error } = await uploadImageByUrl(creds, url);
      if (error) {
        errors.push(`Image upload failed: ${error}`);
        continue;
      }
      const response = data as { image_info?: { image_id: string } };
      if (response.image_info?.image_id) {
        imageIds.push(response.image_info.image_id);
      }
    } catch (e) {
      errors.push(`Image upload error: ${e instanceof Error ? e.message : 'Unknown'}`);
    }
  }

  return { image_id_list: imageIds, errors };
}

// --- Fetch Product Data ---

interface ProductForExport {
  id: string;
  code: string;
  name: string;
  description: string;
  image: string | null;
  variation_label: string | null;
  variations: {
    id: string;
    variation_label: string;
    sku: string | null;
    default_price: number;
    discount_price: number;
    stock: number;
    attributes: Record<string, string> | null;
    _isVirtual?: boolean; // true when no real variation row exists
  }[];
  images: string[];
}

async function fetchProductForExport(productId: string, companyId: string): Promise<ProductForExport | null> {
  const { data: product } = await supabaseAdmin
    .from('products')
    .select('id, code, name, description, image, variation_label')
    .eq('id', productId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .single();

  if (!product) return null;

  // Try with company_id first, then without (some old records may not have company_id on variations)
  let { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select('id, variation_label, sku, default_price, discount_price, stock, attributes')
    .eq('product_id', productId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

  console.log(`[Shopee Export] fetchProduct "${product.name}" (${productId}): variations with company_id=${variations?.length || 0}`);

  if (!variations || variations.length === 0) {
    // Retry without company_id filter (fallback for old data)
    const { data: fallbackVariations } = await supabaseAdmin
      .from('product_variations')
      .select('id, variation_label, sku, default_price, discount_price, stock, attributes')
      .eq('product_id', productId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    variations = fallbackVariations;
    console.log(`[Shopee Export] fetchProduct fallback (no company_id filter): variations=${variations?.length || 0}`);
  }

  if (!variations || variations.length === 0) {
    // Last resort: query only by product_id (no is_active, no company_id filter)
    const { data: allVariations } = await supabaseAdmin
      .from('product_variations')
      .select('id, variation_label, sku, default_price, discount_price, stock, attributes, is_active, company_id')
      .eq('product_id', productId);
    console.log(`[Shopee Export] fetchProduct ALL variations (no filter):`, JSON.stringify(allVariations));
    // Use any active variation found, or any variation at all
    if (allVariations && allVariations.length > 0) {
      const activeOnes = allVariations.filter(v => v.is_active);
      variations = (activeOnes.length > 0 ? activeOnes : allVariations).map(v => ({
        id: v.id,
        variation_label: v.variation_label,
        sku: v.sku,
        default_price: v.default_price,
        discount_price: v.discount_price || 0,
        stock: v.stock,
        attributes: v.attributes,
      }));
      console.log(`[Shopee Export] fetchProduct using ALL fallback: ${variations.length} variations`);
    }
  }

  const { data: images } = await supabaseAdmin
    .from('product_images')
    .select('image_url')
    .eq('product_id', productId)
    .eq('company_id', companyId)
    .order('sort_order', { ascending: true });

  const imageUrls = (images || []).map(i => i.image_url).filter(Boolean);
  // Fallback to product.image if no images in product_images
  if (imageUrls.length === 0 && product.image) {
    imageUrls.push(product.image);
  }

  // If still no variations, create a virtual one from product info (simple product without variation row)
  let finalVariations;
  if (variations && variations.length > 0) {
    finalVariations = variations.map(v => ({
      ...v,
      attributes: v.attributes as Record<string, string> | null,
    }));
  } else {
    // Try to get price from marketplace link (from order sync)
    let fallbackPrice = 0;
    const { data: link } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('platform_price')
      .eq('product_id', productId)
      .not('platform_price', 'is', null)
      .limit(1)
      .single();
    if (link?.platform_price) {
      fallbackPrice = link.platform_price;
    }

    finalVariations = [{
      id: product.id,
      variation_label: product.variation_label || product.name,
      sku: product.code || null,
      default_price: fallbackPrice,
      discount_price: 0,
      stock: 0,
      attributes: null as Record<string, string> | null,
      _isVirtual: true,
    }];
  }

  return {
    ...product,
    description: product.description || product.name,
    variations: finalVariations,
    images: imageUrls,
  };
}

// --- Determine product type ---

function isSimpleProduct(product: ProductForExport): boolean {
  // Simple: has variation_label set (single SKU) OR only 1 variation without attributes
  if (product.variation_label !== null) return true;
  if (product.variations.length <= 1) return true;
  // If all variations have no attributes, treat as simple (use first variation)
  return product.variations.every(v => !v.attributes || Object.keys(v.attributes).length === 0);
}

// --- Build Shopee Item Payload ---

function buildAddItemPayload(
  product: ProductForExport,
  options: ExportOptions,
  imageIds: string[],
  logisticsIds: number[],
  simple: boolean,
  attributeList?: Array<{ attribute_id: number; attribute_value_list: Array<{ value_id: number; original_value_name: string }> }>
): Record<string, unknown> {
  const weight = options.weight || 0.5;
  const firstVariation = product.variations[0];

  const stock = simple ? (firstVariation?.stock || 0) : 0;

  // Use discount_price (current selling price) if set, otherwise default_price
  const price = Math.max(
    (firstVariation?.discount_price && firstVariation.discount_price > 0)
      ? firstVariation.discount_price
      : (firstVariation?.default_price || 0),
    1 // Shopee minimum price = 1
  );

  // Ensure description meets Shopee 60-5000 char requirement
  let description = product.description || product.name;
  if (description.length < 60) {
    // Pad with product details to reach 60 chars
    const padding = `\n\nรายละเอียดสินค้า: ${product.name} (${product.code || 'N/A'})`;
    description = description + padding;
    // If still short, pad with spaces
    if (description.length < 60) {
      description = description.padEnd(60, ' ');
    }
  }

  const payload: Record<string, unknown> = {
    original_price: price,
    description,
    item_name: product.name.substring(0, 120), // Shopee limit 120 chars
    seller_stock: [{ stock }],   // Shopee API v2 format
    logistic_info: logisticsIds.map(id => ({
      logistic_id: id,
      enabled: true,
    })),
    weight,
    category_id: options.shopee_category_id,
    image: {
      image_id_list: imageIds,
    },
    item_status: 'NORMAL',
    dimension: {
      package_length: 10,
      package_width: 10,
      package_height: 10,
    },
    condition: 'NEW',
    brand: {
      brand_id: 0,           // 0 = "No Brand" on Shopee
      original_brand_name: '',
    },
  };

  // Add mandatory category attributes
  if (attributeList && attributeList.length > 0) {
    payload.attribute_list = attributeList;
  }

  // Add item SKU if simple product
  if (simple && firstVariation?.sku) {
    payload.item_sku = firstVariation.sku;
  }

  return payload;
}

// --- Export Single Product ---

export async function exportProductToShopee(
  account: ShopeeAccountRow,
  productId: string,
  companyId: string,
  options: ExportOptions,
  onProgress?: ExportProgressCallback
): Promise<ExportResult> {
  try {
    const creds = await ensureValidToken(account);

    // 0. Check if product is already linked to this specific account
    const { data: existingLinks } = await supabaseAdmin
      .from('marketplace_product_links')
      .select('id, external_item_id, account_id')
      .eq('account_id', account.id)
      .eq('product_id', productId);

    if (existingLinks && existingLinks.length > 0) {
      console.log(`[Shopee Export] Product ${productId} already linked to account ${account.id}:`, existingLinks);
      return {
        success: false,
        error: `สินค้านี้เชื่อมกับ Shopee อยู่แล้ว (Item ID: ${existingLinks[0].external_item_id})`,
        product_name: '',
      };
    }

    // 1. Fetch product
    const product = await fetchProductForExport(productId, companyId);
    if (!product) {
      return { success: false, error: 'ไม่พบสินค้า', product_name: '' };
    }

    if (product.variations.length === 0) {
      return { success: false, error: 'สินค้าไม่มี variation', product_name: product.name };
    }

    onProgress?.({
      phase: 'uploading_images',
      current: 0,
      total: 1,
      label: `กำลังอัปโหลดรูปภาพ: ${product.name}`,
      product_name: product.name,
    });

    // 2. Upload images
    let imageIds: string[] = [];
    if (product.images.length > 0) {
      const uploadResult = await uploadProductImages(creds, product.images);
      imageIds = uploadResult.image_id_list;
      if (imageIds.length === 0 && uploadResult.errors.length > 0) {
        console.error('[Shopee Export] All image uploads failed:', uploadResult.errors);
        // Continue without images — Shopee may still accept the item
      }
    }

    // 3. Get logistics
    const logisticsIds = await getEnabledLogistics(creds);
    if (logisticsIds.length === 0) {
      return { success: false, error: 'ไม่พบช่องทางขนส่งที่เปิดใช้งาน', product_name: product.name };
    }

    onProgress?.({
      phase: 'creating_item',
      current: 0,
      total: 1,
      label: `กำลังสร้างสินค้าบน Shopee: ${product.name}`,
      product_name: product.name,
    });

    // 4. Determine simple vs variation
    const simple = isSimpleProduct(product);
    console.log(`[Shopee Export] "${product.name}" — ${simple ? 'simple' : 'variation'} product, ${product.variations.length} variations`);

    // 4.5 Fetch mandatory attributes for the category (checks stored → cache → API)
    let attributeList = await getMandatoryAttributes(creds, options.shopee_category_id, companyId);

    // 5. Build and send add_item payload (with retry on mandatory attribute errors)
    let payload = buildAddItemPayload(product, options, imageIds, logisticsIds, simple, attributeList);
    let addResult = await addItem(creds, payload);

    // Retry loop: if add_item fails with mandatory attribute error, parse attribute_id from debug_message and retry
    let retryCount = 0;
    const maxRetries = 10;
    while (addResult.error && retryCount < maxRetries) {
      const debugMsg = addResult.debug_message || '';
      // Parse attribute_id from debug_message, e.g.:
      // "Attribute is mandatory: id: 100963, name: FDA Registration No."
      const attrIdMatch = debugMsg.match(/Attribute is mandatory:\s*id:\s*(\d+),\s*name:\s*([^"}\]]+)/i);
      if (!attrIdMatch) break; // Not an attribute error, stop retrying

      const missingAttrId = parseInt(attrIdMatch[1]);
      const missingAttrName = attrIdMatch[2].trim();

      // Check if we already added this attribute (prevent infinite loop)
      if (attributeList.some(a => a.attribute_id === missingAttrId)) {
        console.error(`[Shopee Export] Attribute ${missingAttrId} ("${missingAttrName}") already in payload but still rejected`);
        break;
      }

      console.log(`[Shopee Export] Adding missing mandatory attribute: id=${missingAttrId} name="${missingAttrName}" (retry ${retryCount + 1})`);

      // Add the missing attribute with N/A fallback
      attributeList = [
        ...attributeList,
        {
          attribute_id: missingAttrId,
          attribute_value_list: [{ value_id: 0, original_value_name: 'N/A' }],
        },
      ];

      // Rebuild payload with updated attributes and retry
      payload = buildAddItemPayload(product, options, imageIds, logisticsIds, simple, attributeList);
      addResult = await addItem(creds, payload);
      retryCount++;
    }

    const { data, error } = addResult;

    if (error) {
      return { success: false, error: `Shopee error: ${error}`, product_name: product.name };
    }

    // Cache successful attributes for this category (for subsequent exports)
    if (attributeList.length > 0) {
      categoryAttributeCache.set(options.shopee_category_id, attributeList);
    }

    const response = data as { item_id?: number };
    const itemId = response.item_id;

    if (!itemId) {
      return { success: false, error: 'ไม่ได้รับ item_id จาก Shopee', product_name: product.name };
    }

    // 6. For variation products: call init_tier_variation
    if (!simple && product.variations.length > 1) {
      // Build tier variations from variation attributes
      // e.g. variations with attributes { "สี": "แดง", "ขนาด": "S" } → tier_variation: [{ name: "สี", ... }, { name: "ขนาด", ... }]
      const tierNames: string[] = [];
      const tierOptionsMap: Map<string, string[]> = new Map();

      for (const v of product.variations) {
        if (v.attributes) {
          for (const [key, value] of Object.entries(v.attributes)) {
            if (!tierOptionsMap.has(key)) {
              tierNames.push(key);
              tierOptionsMap.set(key, []);
            }
            const options = tierOptionsMap.get(key)!;
            if (!options.includes(value)) {
              options.push(value);
            }
          }
        }
      }

      if (tierNames.length > 0) {
        const tierVariation = tierNames.map(name => ({
          name,
          option_list: (tierOptionsMap.get(name) || []).map(opt => ({ option: opt })),
        }));

        // Build model list — each model maps to a combination of tier options
        const models = product.variations.map(v => {
          const tierIndex = tierNames.map(name => {
            const value = v.attributes?.[name] || '';
            const options = tierOptionsMap.get(name) || [];
            return options.indexOf(value);
          });
          // Use discount_price (current selling price) if set, otherwise default_price
          const modelPrice = (v.discount_price && v.discount_price > 0) ? v.discount_price : (v.default_price || 0);
          return {
            tier_index: tierIndex,
            normal_stock: v.stock || 0,
            original_price: modelPrice,
            model_sku: v.sku || undefined,
          };
        });

        const { error: tierError } = await initTierVariation(creds, itemId, tierVariation, models);
        if (tierError) {
          console.error(`[Shopee Export] init_tier_variation error:`, tierError);
          // Don't fail the whole export — item is already created, just without variations
        } else {
          console.log(`[Shopee Export] init_tier_variation success for item ${itemId}: ${tierNames.join(', ')}`);
        }
      }
    }

    // 7. Create marketplace link(s)
    if (simple) {
      const firstVar = product.variations[0];
      // Use null for variation_id if virtual (no real row in product_variations)
      const variationId = firstVar?._isVirtual ? null : (firstVar?.id || null);
      const linkData = {
        company_id: companyId,
        platform: 'shopee',
        account_id: account.id,
        account_name: account.shop_name || '',
        product_id: product.id,
        variation_id: variationId,
        external_item_id: String(itemId),
        external_model_id: '0',
        external_sku: firstVar?.sku || '',
        external_item_status: 'NORMAL',
        platform_price: (firstVar?.discount_price && firstVar.discount_price > 0) ? firstVar.discount_price : (firstVar?.default_price || null),
        shopee_category_id: options.shopee_category_id,
        shopee_category_name: options.shopee_category_name || null,
        weight: options.weight || 0.5,
        shopee_attributes: attributeList.length > 0 ? attributeList : null,
        last_synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      console.log(`[Shopee Export] Creating marketplace link:`, JSON.stringify(linkData));
      const { error: linkError } = await supabaseAdmin
        .from('marketplace_product_links')
        .upsert(linkData, { onConflict: 'account_id,external_item_id,external_model_id' });
      if (linkError) {
        console.error(`[Shopee Export] Failed to create marketplace link:`, linkError);
      }
    } else {
      // Variation product: one link per variation (model_id=0 for now, will be updated on next sync)
      for (let i = 0; i < product.variations.length; i++) {
        const v = product.variations[i];
        const variationId = v._isVirtual ? null : (v.id || null);
        const linkData = {
          company_id: companyId,
          platform: 'shopee',
          account_id: account.id,
          account_name: account.shop_name || '',
          product_id: product.id,
          variation_id: variationId,
          external_item_id: String(itemId),
          external_model_id: String(i), // temporary index, updated on next product sync
          external_sku: v.sku || '',
          external_item_status: 'NORMAL',
          platform_price: (v.discount_price && v.discount_price > 0) ? v.discount_price : (v.default_price || null),
          shopee_category_id: options.shopee_category_id,
          shopee_category_name: options.shopee_category_name || null,
          weight: options.weight || 0.5,
          shopee_attributes: attributeList.length > 0 ? attributeList : null,
          last_synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        console.log(`[Shopee Export] Creating marketplace link (var ${i}):`, JSON.stringify(linkData));
        const { error: linkError } = await supabaseAdmin
          .from('marketplace_product_links')
          .upsert(linkData, { onConflict: 'account_id,external_item_id,external_model_id' });
        if (linkError) {
          console.error(`[Shopee Export] Failed to create marketplace link (var ${i}):`, linkError);
        }
      }
    }

    console.log(`[Shopee Export] Successfully exported "${product.name}" → item_id=${itemId} (${simple ? 'simple' : 'variation'})`);

    return { success: true, item_id: itemId, product_name: product.name };
  } catch (e) {
    console.error('[Shopee Export] Error:', e);
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
      product_name: '',
    };
  }
}

// --- Export Bulk ---

export async function exportBulkToShopee(
  account: ShopeeAccountRow,
  productIds: string[],
  companyId: string,
  options: ExportOptions,
  onProgress?: ExportProgressCallback,
  perProductOptions?: Record<string, ExportOptions>
): Promise<BulkExportResult> {
  const results: ExportResult[] = [];
  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < productIds.length; i++) {
    const productId = productIds[i];

    onProgress?.({
      phase: 'creating_item',
      current: i,
      total: productIds.length,
      label: `กำลังส่งสินค้า ${i + 1}/${productIds.length}`,
    });

    // Use per-product options if available, fallback to shared options
    const productOptions = perProductOptions?.[productId] || options;
    const result = await exportProductToShopee(account, productId, companyId, productOptions);
    results.push(result);

    if (result.success) {
      successCount++;
    } else {
      errorCount++;
    }

    onProgress?.({
      phase: result.success ? 'done' : 'error',
      current: i + 1,
      total: productIds.length,
      label: result.success
        ? `สำเร็จ: ${result.product_name}`
        : `ผิดพลาด: ${result.product_name} — ${result.error}`,
      product_name: result.product_name,
      success: result.success,
      error: result.error,
    });
  }

  return {
    total: productIds.length,
    success_count: successCount,
    error_count: errorCount,
    results,
  };
}
