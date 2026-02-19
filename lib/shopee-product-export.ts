import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureValidToken,
  uploadImageByUrl,
  addItem,
  getShopeeLogistics,
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
    stock: number;
    attributes: Record<string, string> | null;
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

  const { data: variations } = await supabaseAdmin
    .from('product_variations')
    .select('id, variation_label, sku, default_price, stock, attributes')
    .eq('product_id', productId)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true });

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

  return {
    ...product,
    description: product.description || product.name,
    variations: (variations || []).map(v => ({
      ...v,
      attributes: v.attributes as Record<string, string> | null,
    })),
    images: imageUrls,
  };
}

// --- Build Shopee Item Payload ---

function buildAddItemPayload(
  product: ProductForExport,
  options: ExportOptions,
  imageIds: string[],
  logisticsIds: number[]
): Record<string, unknown> {
  const isSimple = product.variation_label !== null;
  const weight = options.weight || 0.5;

  const payload: Record<string, unknown> = {
    original_price: isSimple
      ? product.variations[0]?.default_price || 0
      : product.variations[0]?.default_price || 0,
    description: product.description || product.name,
    item_name: product.name.substring(0, 120), // Shopee limit 120 chars
    normal_stock: isSimple ? (product.variations[0]?.stock || 0) : 0,
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
  };

  // Add item SKU if simple product
  if (isSimple && product.variations[0]?.sku) {
    payload.item_sku = product.variations[0].sku;
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

    // 4. Build and send payload
    const payload = buildAddItemPayload(product, options, imageIds, logisticsIds);
    const { data, error } = await addItem(creds, payload);

    if (error) {
      return { success: false, error: `Shopee error: ${error}`, product_name: product.name };
    }

    const response = data as { item_id?: number };
    const itemId = response.item_id;

    if (!itemId) {
      return { success: false, error: 'ไม่ได้รับ item_id จาก Shopee', product_name: product.name };
    }

    // 5. Create marketplace link
    await supabaseAdmin.from('marketplace_product_links').upsert({
      company_id: companyId,
      platform: 'shopee',
      account_id: account.id,
      account_name: account.shop_name || '',
      product_id: product.id,
      variation_id: product.variations[0]?.id || null,
      external_item_id: String(itemId),
      external_model_id: '0',
      external_sku: product.variations[0]?.sku || '',
      external_item_status: 'NORMAL',
      platform_price: product.variations[0]?.default_price || null,
      shopee_category_id: options.shopee_category_id,
      shopee_category_name: options.shopee_category_name || null,
      weight: options.weight || 0.5,
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'account_id,external_item_id,external_model_id' });

    console.log(`[Shopee Export] Successfully exported "${product.name}" → item_id=${itemId}`);

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
