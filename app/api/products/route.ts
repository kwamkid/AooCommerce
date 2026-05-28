// Path: app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// Type definitions
interface ProductData {
  code: string;
  name: string;
  description?: string;
  image?: string;
  product_type: 'simple' | 'variation';
  is_active?: boolean;
  selected_variation_types?: string[]; // UUID[] of variation_type IDs
  category_id?: string;
  brand_id?: string;

  // Simple product fields
  variation_label?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
  stock?: number;
  min_stock?: number;

  // Variation product fields
  variations?: VariationData[];
}

interface VariationData {
  id?: string;
  variation_label: string;
  sku?: string;
  barcode?: string;
  default_price: number;
  discount_price?: number;
  cost_price?: number;
  stock?: number;
  min_stock?: number;
  is_active?: boolean;
  attributes?: Record<string, string>; // e.g. {"ความจุ": "250ml", "รูปทรง": "ขวดกลม"}
}

// Helper: compute display name from attributes
function computeDisplayName(attrs: Record<string, string> | null | undefined): string {
  if (!attrs) return '';
  const parts: string[] = [];
  for (const value of Object.values(attrs)) {
    if (value && value.trim()) parts.push(value.trim());
  }
  return parts.join(' / ') || '';
}

// Helper: Check for duplicate SKU/Barcode across all product_variations
// excludeProductId: skip variations belonging to this product (used in PUT/edit)
async function checkDuplicateSkuBarcode(
  companyId: string,
  skus: string[],
  barcodes: string[],
  excludeProductId?: string
): Promise<{ field: string; value: string } | null> {
  // Filter out empty values
  const validSkus = skus.filter(s => s && s.trim());
  const validBarcodes = barcodes.filter(b => b && b.trim());

  if (validSkus.length > 0) {
    let query = supabaseAdmin
      .from('product_variations')
      .select('sku, product_id')
      .eq('company_id', companyId)
      .in('sku', validSkus)
      .is('deleted_at', null); // deleted variations don't block SKU reuse
    if (excludeProductId) {
      query = query.neq('product_id', excludeProductId);
    }
    const { data: existingSkus } = await query;
    if (existingSkus && existingSkus.length > 0) {
      return { field: 'SKU', value: existingSkus[0].sku };
    }
  }

  if (validBarcodes.length > 0) {
    let query = supabaseAdmin
      .from('product_variations')
      .select('barcode, product_id')
      .eq('company_id', companyId)
      .in('barcode', validBarcodes)
      .is('deleted_at', null);
    if (excludeProductId) {
      query = query.neq('product_id', excludeProductId);
    }
    const { data: existingBarcodes } = await query;
    if (existingBarcodes && existingBarcodes.length > 0) {
      return { field: 'Barcode', value: existingBarcodes[0].barcode };
    }
  }

  return null;
}

// POST - Create new product
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const productData: ProductData = await request.json();

    // Validate required fields
    if (!productData.code || !productData.name || !productData.product_type) {
      return NextResponse.json(
        { error: 'Missing required fields: code, name, product_type' },
        { status: 400 }
      );
    }

    // Validate based on product type
    if (productData.product_type === 'simple') {
      if (!productData.variation_label || productData.default_price === undefined) {
        return NextResponse.json(
          { error: 'Simple product requires: variation_label, default_price' },
          { status: 400 }
        );
      }
    } else if (productData.product_type === 'variation') {
      if (!productData.variations || productData.variations.length === 0) {
        return NextResponse.json(
          { error: 'Variation product requires at least one variation' },
          { status: 400 }
        );
      }
    }

    // Check if code already exists within this company
    const { data: existingCode } = await supabaseAdmin
      .from('products')
      .select('id')
      .eq('company_id', auth.companyId)
      .eq('code', productData.code)
      .single();

    if (existingCode) {
      return NextResponse.json(
        { error: 'Product code already exists' },
        { status: 400 }
      );
    }

    // Check for duplicate SKU/Barcode across all products
    const allSkus: string[] = [];
    const allBarcodes: string[] = [];
    if (productData.product_type === 'simple') {
      if (productData.sku) allSkus.push(productData.sku);
      if (productData.barcode) allBarcodes.push(productData.barcode);
    } else if (productData.variations) {
      for (const v of productData.variations) {
        if (v.sku) allSkus.push(v.sku);
        if (v.barcode) allBarcodes.push(v.barcode);
      }
    }
    const dupCheck = await checkDuplicateSkuBarcode(auth.companyId, allSkus, allBarcodes);
    if (dupCheck) {
      return NextResponse.json(
        { error: `${dupCheck.field} "${dupCheck.value}" ถูกใช้งานแล้วในสินค้าอื่น` },
        { status: 400 }
      );
    }

    // Create product (minimal fields only - price/stock go in variations table)
    const productInsert: Record<string, unknown> = {
      company_id: auth.companyId,
      code: productData.code,
      name: productData.name,
      description: productData.description || null,
      image: productData.image || null,
      // For simple products, store variation_label here (used by view to determine product_type)
      variation_label: productData.product_type === 'simple' ? productData.variation_label : null,
      is_active: productData.is_active !== undefined ? productData.is_active : true,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Optional category and brand
    if (productData.category_id) productInsert.category_id = productData.category_id;
    if (productData.brand_id) productInsert.brand_id = productData.brand_id;

    // For variation products, store selected variation type IDs
    if (productData.product_type === 'variation' && productData.selected_variation_types) {
      productInsert.selected_variation_types = productData.selected_variation_types;
    }

    const { data: newProduct, error: productError } = await supabaseAdmin
      .from('products')
      .insert(productInsert)
      .select()
      .single();

    if (productError) {
      console.error('Product creation error:', productError);
      return NextResponse.json(
        { error: productError.message },
        { status: 400 }
      );
    }

    // Create variations for BOTH simple and variation products
    // For simple products: create a single variation row
    // For variation products: create multiple variation rows
    if (productData.product_type === 'simple') {
      // Simple product: create one variation row
      const { error: variationError } = await supabaseAdmin
        .from('product_variations')
        .insert({
          company_id: auth.companyId,
          product_id: newProduct.id,
          variation_label: productData.variation_label,
          sku: productData.sku || null,
          barcode: productData.barcode || null,
          default_price: productData.default_price,
          discount_price: productData.discount_price || 0,
          cost_price: productData.cost_price || 0,
          stock: productData.stock || 0,
          min_stock: productData.min_stock || 0,
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (variationError) {
        // Rollback: delete the product
        await supabaseAdmin
          .from('products')
          .delete()
          .eq('id', newProduct.id)
          .eq('company_id', auth.companyId);

        return NextResponse.json(
          { error: 'Failed to create simple product variation: ' + variationError.message },
          { status: 400 }
        );
      }
    } else if (productData.product_type === 'variation' && productData.variations && productData.variations.length > 0) {
      // Variation product: create multiple variation rows
      const variationsToInsert = productData.variations.map(v => ({
        company_id: auth.companyId,
        product_id: newProduct.id,
        // Auto-generate variation_label from attributes, fallback to provided variation_label
        variation_label: v.attributes ? computeDisplayName(v.attributes) : v.variation_label,
        sku: v.sku || null,
        barcode: v.barcode || null,
        default_price: v.default_price,
        discount_price: v.discount_price || 0,
        cost_price: v.cost_price || 0,
        stock: v.stock || 0,
        min_stock: v.min_stock || 0,
        is_active: v.is_active !== undefined ? v.is_active : true,
        attributes: v.attributes || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { error: variationsError } = await supabaseAdmin
        .from('product_variations')
        .insert(variationsToInsert);

      if (variationsError) {
        // Rollback: delete the product
        await supabaseAdmin
          .from('products')
          .delete()
          .eq('id', newProduct.id)
          .eq('company_id', auth.companyId);

        return NextResponse.json(
          { error: 'Failed to create variations: ' + variationsError.message },
          { status: 400 }
        );
      }
    }

    // Fetch created variations (for staged image upload mapping)
    const { data: createdVariations } = await supabaseAdmin
      .from('product_variations')
      .select('id, variation_label')
      .eq('product_id', newProduct.id)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      success: true,
      product: { ...newProduct, product_id: newProduct.id },
      variations: createdVariations || []
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get products (with joins)
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('id');

    // If ID provided, get single product
    if (productId) {
      const { data, error } = await supabaseAdmin
        .from('products_view')
        .select('*')
        .eq('id', productId)
        .eq('company_id', auth.companyId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { error: 'Product not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({ product: data });
    }

    // Optional filters
    const sourceFilter = searchParams.get('source');
    const categoryFilter = searchParams.get('category_id');
    const brandFilter = searchParams.get('brand_id');
    const searchQuery = searchParams.get('search');
    const shopAccountFilter = searchParams.get('shop_account_id');
    // status filter: '' (default) = active only, 'inactive' = only closed, 'all' = both
    const statusFilter = searchParams.get('status') || '';

    // Pagination params
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const paginate = searchParams.has('page') || searchParams.has('limit');

    // Step 1: Get paginated product IDs from the products table directly.
    //
    // Resolve async pre-filters first so the query builder can be rebuilt on
    // each page (Supabase Cloud enforces a 1000-row cap per response — to
    // return more we have to fire several .range() pages and concatenate).
    let varProductIds: string[] = [];
    if (searchQuery) {
      const { data: varMatches } = await supabaseAdmin
        .from('product_variations')
        .select('product_id')
        .eq('company_id', auth.companyId)
        .or(`sku.ilike.%${searchQuery}%,barcode.ilike.%${searchQuery}%`);
      varProductIds = [...new Set((varMatches || []).map(v => v.product_id).filter(Boolean))];
    }

    let linkedProductIds: string[] = [];
    if (shopAccountFilter) {
      const { data: linkedProducts } = await supabaseAdmin
        .from('marketplace_product_links')
        .select('product_id')
        .eq('account_id', shopAccountFilter);
      linkedProductIds = [...new Set((linkedProducts || []).map(lp => lp.product_id).filter(Boolean))];
      if (linkedProductIds.length === 0) {
        return NextResponse.json({
          products: [],
          ...(paginate ? { total: 0, page, limit } : {}),
          shopOptions: [],
        });
      }
    }

    const buildBaseQuery = () => {
      let q = supabaseAdmin
        .from('products')
        .select('id', { count: 'exact' })
        .eq('company_id', auth.companyId);

      if (statusFilter === 'inactive') q = q.eq('is_active', false);
      else if (statusFilter !== 'all') q = q.eq('is_active', true);

      if (sourceFilter) {
        if (sourceFilter === 'shopee') {
          q = q.in('source', ['shopee', 'shopee_edited']);
        } else {
          q = q.eq('source', sourceFilter);
        }
      }
      if (categoryFilter) q = q.eq('category_id', categoryFilter);
      if (brandFilter) q = q.eq('brand_id', brandFilter);
      if (searchQuery) {
        if (varProductIds.length > 0) {
          q = q.or(`name.ilike.%${searchQuery}%,code.ilike.%${searchQuery}%,id.in.(${varProductIds.join(',')})`);
        } else {
          q = q.or(`name.ilike.%${searchQuery}%,code.ilike.%${searchQuery}%`);
        }
      }
      if (shopAccountFilter) q = q.in('id', linkedProductIds);

      return q.order('name', { ascending: true });
    };

    // Supabase Cloud caps responses at 1000 rows regardless of .range() —
    // fetch the first page (also gets the exact total), then fire additional
    // 1000-row pages in parallel until we have everything the caller asked for.
    const SUPABASE_PAGE_CAP = 1000;
    const desiredOffset = paginate ? (page - 1) * limit : 0;
    const desiredEnd = paginate ? desiredOffset + limit - 1 : Number.MAX_SAFE_INTEGER;

    const firstStart = desiredOffset;
    const firstEnd = Math.min(firstStart + SUPABASE_PAGE_CAP - 1, desiredEnd);
    const firstPageResult = await buildBaseQuery().range(firstStart, firstEnd);

    if (firstPageResult.error) {
      return NextResponse.json(
        { error: firstPageResult.error.message },
        { status: 500 }
      );
    }

    const totalCount = firstPageResult.count || 0;
    let productRows = firstPageResult.data || [];
    const effectiveEnd = Math.min(desiredEnd, totalCount - 1);

    if (productRows.length > 0 && firstEnd < effectiveEnd) {
      const additionalStarts: number[] = [];
      for (let start = firstEnd + 1; start <= effectiveEnd; start += SUPABASE_PAGE_CAP) {
        additionalStarts.push(start);
      }
      const additionalPages = await Promise.all(
        additionalStarts.map(start => {
          const end = Math.min(start + SUPABASE_PAGE_CAP - 1, effectiveEnd);
          return buildBaseQuery().range(start, end);
        })
      );
      for (const r of additionalPages) {
        if (r.data) productRows = productRows.concat(r.data);
      }
    }

    if (!productRows || productRows.length === 0) {
      return NextResponse.json({
        products: [],
        ...(paginate ? { total: totalCount || 0, page, limit } : {})
      });
    }

    const productIds = productRows.map(p => p.id);

    // Step 2: Fetch variations + images + shop options ALL in parallel
    // .in('product_id', [...]) with thousands of UUIDs blows past PostgREST's
    // URL length limit (~8KB) and also Supabase JS's default 1000-row response
    // cap. Chunk into batches of 200 IDs and parallelize so each request stays
    // small enough on both axes.
    const ID_CHUNK = 200;
    const productIdChunks: string[][] = [];
    for (let i = 0; i < productIds.length; i += ID_CHUNK) {
      productIdChunks.push(productIds.slice(i, i + ID_CHUNK));
    }
    const chunkedFetch = async <T>(
      run: (ids: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
    ): Promise<{ data: T[]; error: { message: string } | null }> => {
      const results = await Promise.all(productIdChunks.map(c => Promise.resolve(run(c))));
      const firstError = results.find(r => r.error)?.error ?? null;
      const data = results.flatMap(r => r.data ?? []);
      return { data, error: firstError };
    };

    const includeShopOptions = searchParams.has('include_shop_options');
    const [viewResult, imagesResult, shopLinksResult, shopAccountsResult] = await Promise.all([
      chunkedFetch<any>(ids =>
        supabaseAdmin
          .from('products_with_variations')
          .select('*')
          .in('product_id', ids)
      ),
      chunkedFetch<any>(ids =>
        supabaseAdmin
          .from('product_images')
          .select('product_id, variation_id, image_url, sort_order')
          .in('product_id', ids)
          .order('sort_order', { ascending: true })
      ),
      // Shop options: fetch links + accounts in parallel with product data
      includeShopOptions
        ? supabaseAdmin
            .from('marketplace_product_links')
            .select('account_id, account_name, platform')
            .eq('company_id', auth.companyId)
        : Promise.resolve({ data: null }),
      includeShopOptions
        ? supabaseAdmin
            .from('marketplace_accounts')
            .select('id, shop_name, metadata')
            .eq('company_id', auth.companyId)
        : Promise.resolve({ data: null }),
    ]);

    if (viewResult.error) {
      return NextResponse.json(
        { error: viewResult.error.message },
        { status: 500 }
      );
    }

    // Build image maps
    const productImageMap = new Map<string, string>();
    const variationImageMap = new Map<string, string>();
    if (imagesResult.data) {
      for (const img of imagesResult.data) {
        if (img.variation_id && !variationImageMap.has(img.variation_id)) {
          variationImageMap.set(img.variation_id, img.image_url);
        } else if (img.product_id && !img.variation_id && !productImageMap.has(img.product_id)) {
          productImageMap.set(img.product_id, img.image_url);
        }
      }
    }

    // Group by product_id and aggregate variations.
    // SHOW paused (is_active=false) variations — list renders them with a "ปิด"
    // badge so user can see what they paused and re-enable via toggle.
    // HIDE truly-deleted (deleted_at IS NOT NULL) ones — those are gone from UI
    // (rows linger in DB only for FK history).
    const productMap = new Map<string, any>();
    for (const row of viewResult.data || []) {
      const variationVisible = row.variation_id && !row.variation_deleted_at;
      // For simple-product `simple_*` fields we want the ACTIVE row specifically
      // (paused/deleted rows from prior type-switches would feed stale values).
      const variationActiveAndVisible = variationVisible && row.variation_is_active !== false;

      let existing = productMap.get(row.product_id);
      if (!existing) {
        // Register product on first sighting regardless of variation status —
        // products with no visible variations still need to appear (edit form
        // is how user adds new ones back).
        existing = {
          product_id: row.product_id,
          code: row.code,
          name: row.name,
          description: row.description,
          image: row.image,
          product_type: row.product_type,
          selected_variation_types: row.selected_variation_types,
          source: row.source || 'manual',
          category_id: row.category_id || null,
          brand_id: row.brand_id || null,
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at,
          main_image_url: productImageMap.get(row.product_id) || null,
          variations: [],
        };
        if (row.product_type === 'simple') {
          existing.simple_variation_label = row.simple_variation_label;
        }
        productMap.set(row.product_id, existing);
      }

      if (!variationVisible) continue;

      if (row.product_type === 'simple') {
        // Only the active simple row should drive the displayed price/stock.
        if (variationActiveAndVisible) {
          existing.simple_sku = row.sku;
          existing.simple_barcode = row.barcode;
          existing.simple_default_price = row.simple_default_price;
          existing.simple_discount_price = row.simple_discount_price;
          existing.simple_stock = row.simple_stock;
          existing.simple_min_stock = row.simple_min_stock;
        }
        existing.variations.push({
          variation_id: row.variation_id,
          variation_label: row.simple_variation_label,
          default_price: row.simple_default_price,
          discount_price: row.simple_discount_price,
          cost_price: row.cost_price,
          stock: row.simple_stock,
          min_stock: row.simple_min_stock,
          is_active: row.variation_is_active,
          image_url: variationImageMap.get(row.variation_id) || null,
        });
      } else {
        existing.variations.push({
          variation_id: row.variation_id,
          variation_label: row.variation_label,
          sku: row.sku,
          barcode: row.barcode,
          attributes: row.attributes,
          default_price: row.default_price,
          discount_price: row.discount_price,
          cost_price: row.cost_price,
          stock: row.stock,
          min_stock: row.min_stock,
          is_active: row.variation_is_active,
          image_url: variationImageMap.get(row.variation_id) || null,
        });
      }
    }

    // Maintain the same order as the original query
    const groupedProducts = productIds
      .map(id => productMap.get(id))
      .filter(Boolean);

    // Scrub cost_price for users without can_view_cost
    const canViewCost = auth.canViewCost === true;
    if (!canViewCost) {
      for (const p of groupedProducts) {
        if (Array.isArray(p.variations)) {
          for (const v of p.variations) delete v.cost_price;
        }
      }
    }

    // Build shop options from parallel results (already fetched above)
    let shopOptions: { id: string; name: string; platform: string; icon?: string }[] = [];
    if (includeShopOptions && shopLinksResult.data) {
      const shopMap = new Map<string, { id: string; name: string; platform: string; icon?: string }>();
      for (const link of shopLinksResult.data) {
        if (link.account_id && !shopMap.has(link.account_id)) {
          shopMap.set(link.account_id, {
            id: link.account_id,
            name: link.account_name || link.platform || 'Unknown',
            platform: link.platform || 'shopee',
          });
        }
      }

      // Enrich with shop logos from marketplace_accounts (already fetched in parallel)
      for (const acc of (shopAccountsResult.data || [])) {
        const existing = shopMap.get(acc.id);
        if (existing) {
          if (acc.shop_name) existing.name = acc.shop_name;
          existing.icon = (acc.metadata as any)?.shop_logo || undefined;
        }
      }

      shopOptions = [...shopMap.values()];
    }

    return NextResponse.json({
      products: groupedProducts,
      can_view_cost: canViewCost,
      ...(paginate ? { total: totalCount || 0, page, limit } : {}),
      ...(includeShopOptions ? { shopOptions } : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update product
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      id,
      variations,
      code,
      name,
      description,
      image,
      variation_label,
      is_active,
      selected_variation_types,
      category_id,
      brand_id,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Check if code is being changed and if it already exists
    if (code) {
      const { data: existingCode } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('code', code)
        .neq('id', id)
        .single();

      if (existingCode) {
        return NextResponse.json(
          { error: 'Product code already exists' },
          { status: 400 }
        );
      }
    }

    // Check for duplicate SKU/Barcode across all products (excluding this product)
    const putSkus: string[] = [];
    const putBarcodes: string[] = [];
    if (body.sku) putSkus.push(body.sku);
    if (body.barcode) putBarcodes.push(body.barcode);
    if (variations && Array.isArray(variations)) {
      for (const v of variations) {
        if (v.sku) putSkus.push(v.sku);
        if (v.barcode) putBarcodes.push(v.barcode);
      }
    }
    if (putSkus.length > 0 || putBarcodes.length > 0) {
      const dupCheck = await checkDuplicateSkuBarcode(auth.companyId, putSkus, putBarcodes, id);
      if (dupCheck) {
        return NextResponse.json(
          { error: `${dupCheck.field} "${dupCheck.value}" ถูกใช้งานแล้วในสินค้าอื่น` },
          { status: 400 }
        );
      }
    }

    // Build update object with only valid fields
    const updateData: any = {
      updated_at: new Date().toISOString()
    };

    if (code !== undefined && code !== '') updateData.code = code;
    if (name !== undefined && name !== '') updateData.name = name;
    if (description !== undefined) updateData.description = description || null;
    if (image !== undefined) updateData.image = image || null;
    // For variation_label: empty string should become null (for variation products)
    if (variation_label !== undefined) {
      updateData.variation_label = variation_label === '' ? null : variation_label;
    }
    if (is_active !== undefined) updateData.is_active = is_active;
    if (selected_variation_types !== undefined) updateData.selected_variation_types = selected_variation_types;
    if (category_id !== undefined) updateData.category_id = category_id || null;
    if (brand_id !== undefined) updateData.brand_id = brand_id || null;

    // If product was auto-created from Shopee, mark as edited.
    // Also fetch variation_label so we can detect simple ↔ variation type switch below.
    const { data: currentProduct } = await supabaseAdmin
      .from('products')
      .select('source, variation_label')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (currentProduct?.source === 'shopee') {
      updateData.source = 'shopee_edited';
    }

    // Update main product
    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updateData)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Determine product type from data.variation_label
    // Simple product: has variation_label in products table
    // Variation product: variation_label is null in products table
    const isSimpleProduct = data.variation_label !== null;

    // Detect type switch (simple ↔ variation). currentProduct (fetched earlier
    // for source-change tracking) carries the PREVIOUS variation_label, so
    // comparing against data.variation_label tells us if the user just toggled
    // type in this request. When type switches, we soft-archive ALL existing
    // variation rows — variation_id is FK'd by 19 tables (orders, inventory,
    // reports, snapshots…) so hard-delete would either be rejected by the DB
    // or cascade-wipe historical rows. Soft-archive preserves history.
    const prevWasSimple = currentProduct?.variation_label !== null && currentProduct?.variation_label !== undefined;
    const typeSwitched =
      variation_label !== undefined &&
      ((prevWasSimple && !isSimpleProduct) || (!prevWasSimple && isSimpleProduct));

    if (typeSwitched) {
      // Type-switch: old variations no longer make sense in the new shape.
      // Mark them deleted (not just paused) — the user is replacing them,
      // not "pausing for later" — and we never want them to reappear in UI.
      const now = new Date().toISOString();
      await supabaseAdmin
        .from('product_variations')
        .update({ deleted_at: now, updated_at: now })
        .eq('product_id', id)
        .eq('company_id', auth.companyId)
        .is('deleted_at', null);
    }

    if (isSimpleProduct) {
      // For simple products: update the single variation row
      // Get the variation price/stock data from body
      const { default_price, discount_price, cost_price, stock, min_stock, sku, barcode } = body;

      if (default_price !== undefined || discount_price !== undefined || cost_price !== undefined || stock !== undefined || min_stock !== undefined || sku !== undefined || barcode !== undefined) {
        // After a type switch (variation → simple) all old variations were
        // archived, so there's no "current" simple variation — create one.
        // Otherwise, look up the existing simple variation (the one that's
        // still active) to update in place.
        const { data: existingVariation } = typeSwitched
          ? { data: null as { id: string } | null }
          : await supabaseAdmin
              .from('product_variations')
              .select('id')
              .eq('product_id', id)
              .eq('company_id', auth.companyId)
              .eq('is_active', true)
              .is('deleted_at', null)
              .maybeSingle();

        if (!existingVariation) {
          // Insert fresh simple variation
          await supabaseAdmin
            .from('product_variations')
            .insert({
              company_id: auth.companyId,
              product_id: id,
              variation_label: variation_label || '-',
              sku: sku || null,
              barcode: barcode || null,
              default_price: default_price ?? 0,
              discount_price: discount_price ?? 0,
              cost_price: cost_price ?? 0,
              stock: stock ?? 0,
              min_stock: min_stock ?? 0,
              is_active: true,
              attributes: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
        } else if (existingVariation) {
          // Update existing variation
          const variationUpdate: any = { updated_at: new Date().toISOString() };
          if (default_price !== undefined) variationUpdate.default_price = default_price;
          if (discount_price !== undefined) variationUpdate.discount_price = discount_price;
          if (cost_price !== undefined) variationUpdate.cost_price = cost_price;
          if (stock !== undefined) variationUpdate.stock = stock;
          if (min_stock !== undefined) variationUpdate.min_stock = min_stock;
          if (variation_label !== undefined) variationUpdate.variation_label = variation_label;
          if (sku !== undefined) variationUpdate.sku = sku || null;
          if (barcode !== undefined) variationUpdate.barcode = barcode || null;

          await supabaseAdmin
            .from('product_variations')
            .update(variationUpdate)
            .eq('id', existingVariation.id)
            .eq('company_id', auth.companyId);
        }
      }
    } else {
      // For variation products: update multiple variation rows
      if (variations && Array.isArray(variations)) {
        // Get existing (non-deleted) variations — already-deleted ones are
        // out of scope; never resurrect them just because they're missing
        // from the incoming list.
        const { data: existingVariations } = await supabaseAdmin
          .from('product_variations')
          .select('id, variation_label')
          .eq('product_id', id)
          .eq('company_id', auth.companyId)
          .is('deleted_at', null);

        const existingIds = existingVariations?.map(v => v.id) || [];
        const providedIds = variations.filter(v => v.id).map(v => v.id);

        // Variations missing from the incoming list = user clicked the trash
        // icon. Mark deleted_at (soft-delete) — FK refs on 19 history tables
        // forbid hard-delete; "ปิด" (is_active=false) is a different state
        // that the user keeps visible by sending it in the array with
        // is_active=false.
        const toDelete = existingIds.filter(id => !providedIds.includes(id));
        if (toDelete.length > 0) {
          const now = new Date().toISOString();
          await supabaseAdmin
            .from('product_variations')
            .update({ deleted_at: now, updated_at: now })
            .in('id', toDelete)
            .eq('company_id', auth.companyId);
        }

        // Update or insert variations
        for (const variation of variations) {
          // Auto-generate variation_label from attributes
          const displayName = variation.attributes
            ? computeDisplayName(variation.attributes)
            : variation.variation_label;

          if (variation.id) {
            // Update existing
            await supabaseAdmin
              .from('product_variations')
              .update({
                variation_label: displayName,
                sku: variation.sku || null,
                barcode: variation.barcode || null,
                default_price: variation.default_price,
                discount_price: variation.discount_price || 0,
                cost_price: variation.cost_price || 0,
                stock: variation.stock || 0,
                min_stock: variation.min_stock || 0,
                is_active: variation.is_active !== undefined ? variation.is_active : true,
                attributes: variation.attributes || null,
                updated_at: new Date().toISOString()
              })
              .eq('id', variation.id)
              .eq('company_id', auth.companyId);
          } else {
            // Insert new
            await supabaseAdmin
              .from('product_variations')
              .insert({
                company_id: auth.companyId,
                product_id: id,
                variation_label: displayName,
                sku: variation.sku || null,
                barcode: variation.barcode || null,
                default_price: variation.default_price,
                discount_price: variation.discount_price || 0,
                cost_price: variation.cost_price || 0,
                stock: variation.stock || 0,
                min_stock: variation.min_stock || 0,
                is_active: variation.is_active !== undefined ? variation.is_active : true,
                attributes: variation.attributes || null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });
          }
        }
      }
    }

    // Auto-sync price to Shopee if default_price changed
    if (body.default_price !== undefined || (variations && Array.isArray(variations))) {
      import('@/lib/shopee/auto-sync').then(m => m.triggerShopeePriceSync(id)).catch(() => {});
    }

    // Auto-sync product name to Shopee if name changed
    if (body.name) {
      import('@/lib/shopee/auto-sync').then(m => m.triggerShopeeInfoSync(id, body.name)).catch(() => {});
    }

    // Fetch complete product with variations
    const { data: completeProduct } = await supabaseAdmin
      .from('products_with_variations')
      .select('*')
      .eq('product_id', id)
      .eq('company_id', auth.companyId)
      .single();

    // Also fetch variations for staged image upload mapping
    const { data: updatedVariations } = await supabaseAdmin
      .from('product_variations')
      .select('id, variation_label')
      .eq('product_id', id)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: true });

    return NextResponse.json({
      success: true,
      product: completeProduct || data,
      variations: updatedVariations || []
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Deactivate product (soft delete)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('id');
    const idsParam = searchParams.get('ids'); // comma-separated IDs for bulk delete

    const productIds: string[] = [];
    if (idsParam) {
      productIds.push(...idsParam.split(',').filter(Boolean));
    } else if (productId) {
      productIds.push(productId);
    }

    if (productIds.length === 0) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Soft delete products
    const { error } = await supabaseAdmin
      .from('products')
      .update({ is_active: false, updated_at: now })
      .in('id', productIds)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('Error deactivating products:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Also deactivate all (non-deleted) variations — don't touch already-deleted
    // ones, they should stay deleted even if the product is reactivated later.
    await supabaseAdmin
      .from('product_variations')
      .update({ is_active: false, updated_at: now })
      .in('product_id', productIds)
      .eq('company_id', auth.companyId)
      .is('deleted_at', null);

    return NextResponse.json({ success: true, count: productIds.length });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
