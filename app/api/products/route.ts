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

  // Simple product fields
  bottle_size?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  stock?: number;
  min_stock?: number;

  // Variation product fields
  variations?: VariationData[];
}

interface VariationData {
  id?: string;
  bottle_size: string;
  sku?: string;
  barcode?: string;
  default_price: number;
  discount_price?: number;
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
      .in('sku', validSkus);
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
      .in('barcode', validBarcodes);
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
      if (!productData.bottle_size || productData.default_price === undefined) {
        return NextResponse.json(
          { error: 'Simple product requires: bottle_size, default_price' },
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
      // For simple products, store bottle_size here (used by view to determine product_type)
      bottle_size: productData.product_type === 'simple' ? productData.bottle_size : null,
      is_active: productData.is_active !== undefined ? productData.is_active : true,
      created_by: auth.userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

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
          bottle_size: productData.bottle_size,
          sku: productData.sku || null,
          barcode: productData.barcode || null,
          default_price: productData.default_price,
          discount_price: productData.discount_price || 0,
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
        // Auto-generate bottle_size from attributes, fallback to provided bottle_size
        bottle_size: v.attributes ? computeDisplayName(v.attributes) : v.bottle_size,
        sku: v.sku || null,
        barcode: v.barcode || null,
        default_price: v.default_price,
        discount_price: v.discount_price || 0,
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
      .select('id, bottle_size')
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

    // Run products + images queries in parallel
    const [productsResult, imagesResult] = await Promise.all([
      supabaseAdmin
        .from('products_with_variations')
        .select('*')
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .order('name', { ascending: true }),
      supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url, sort_order')
        .eq('company_id', auth.companyId)
        .order('sort_order', { ascending: true }),
    ]);

    if (productsResult.error) {
      return NextResponse.json(
        { error: productsResult.error.message },
        { status: 500 }
      );
    }

    // Build image maps from single query
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

    // Group by product_id and aggregate variations
    const productMap = new Map<string, any>();
    for (const row of productsResult.data || []) {
      const existing = productMap.get(row.product_id);

      if (existing) {
        if (row.variation_id) {
          existing.variations.push({
            variation_id: row.variation_id,
            bottle_size: row.bottle_size,
            sku: row.sku,
            barcode: row.barcode,
            attributes: row.attributes,
            default_price: row.default_price,
            discount_price: row.discount_price,
            stock: row.stock,
            min_stock: row.min_stock,
            is_active: row.variation_is_active,
            image_url: variationImageMap.get(row.variation_id) || null,
          });
        }
      } else {
        const newProduct: any = {
          product_id: row.product_id,
          code: row.code,
          name: row.name,
          description: row.description,
          image: row.image,
          product_type: row.product_type,
          selected_variation_types: row.selected_variation_types,
          is_active: row.is_active,
          created_at: row.created_at,
          updated_at: row.updated_at,
          main_image_url: productImageMap.get(row.product_id) || null,
        };

        if (row.product_type === 'simple') {
          newProduct.simple_bottle_size = row.simple_bottle_size;
          newProduct.simple_sku = row.sku;
          newProduct.simple_barcode = row.barcode;
          newProduct.simple_default_price = row.simple_default_price;
          newProduct.simple_discount_price = row.simple_discount_price;
          newProduct.simple_stock = row.simple_stock;
          newProduct.simple_min_stock = row.simple_min_stock;
          newProduct.variations = row.variation_id ? [{
            variation_id: row.variation_id,
            bottle_size: row.simple_bottle_size,
            default_price: row.simple_default_price,
            discount_price: row.simple_discount_price,
            stock: row.simple_stock,
            min_stock: row.simple_min_stock,
            is_active: row.variation_is_active,
            image_url: variationImageMap.get(row.variation_id) || null,
          }] : [];
        } else {
          newProduct.variations = row.variation_id ? [{
            variation_id: row.variation_id,
            bottle_size: row.bottle_size,
            sku: row.sku,
            barcode: row.barcode,
            attributes: row.attributes,
            default_price: row.default_price,
            discount_price: row.discount_price,
            stock: row.stock,
            min_stock: row.min_stock,
            is_active: row.variation_is_active,
            image_url: variationImageMap.get(row.variation_id) || null,
          }] : [];
        }

        productMap.set(row.product_id, newProduct);
      }
    }

    const groupedProducts = Array.from(productMap.values());

    return NextResponse.json({ products: groupedProducts });
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
      bottle_size,
      is_active,
      selected_variation_types,
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
    // For bottle_size: empty string should become null (for variation products)
    if (bottle_size !== undefined) {
      updateData.bottle_size = bottle_size === '' ? null : bottle_size;
    }
    if (is_active !== undefined) updateData.is_active = is_active;
    if (selected_variation_types !== undefined) updateData.selected_variation_types = selected_variation_types;

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

    // Determine product type from data.bottle_size
    // Simple product: has bottle_size in products table
    // Variation product: bottle_size is null in products table
    const isSimpleProduct = data.bottle_size !== null;

    if (isSimpleProduct) {
      // For simple products: update the single variation row
      // Get the variation price/stock data from body
      const { default_price, discount_price, stock, min_stock, sku, barcode } = body;

      if (default_price !== undefined || discount_price !== undefined || stock !== undefined || min_stock !== undefined || sku !== undefined || barcode !== undefined) {
        // Find the existing variation for this simple product
        const { data: existingVariation } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .eq('product_id', id)
          .eq('company_id', auth.companyId)
          .single();

        if (existingVariation) {
          // Update existing variation
          const variationUpdate: any = { updated_at: new Date().toISOString() };
          if (default_price !== undefined) variationUpdate.default_price = default_price;
          if (discount_price !== undefined) variationUpdate.discount_price = discount_price;
          if (stock !== undefined) variationUpdate.stock = stock;
          if (min_stock !== undefined) variationUpdate.min_stock = min_stock;
          if (bottle_size !== undefined) variationUpdate.bottle_size = bottle_size;
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
        // Get existing variations
        const { data: existingVariations } = await supabaseAdmin
          .from('product_variations')
          .select('id, bottle_size')
          .eq('product_id', id)
          .eq('company_id', auth.companyId);

        const existingIds = existingVariations?.map(v => v.id) || [];
        const providedIds = variations.filter(v => v.id).map(v => v.id);

        // Delete variations that are no longer in the list
        const toDelete = existingIds.filter(id => !providedIds.includes(id));
        if (toDelete.length > 0) {
          await supabaseAdmin
            .from('product_variations')
            .delete()
            .in('id', toDelete)
            .eq('company_id', auth.companyId);
        }

        // Update or insert variations
        for (const variation of variations) {
          // Auto-generate bottle_size from attributes
          const displayName = variation.attributes
            ? computeDisplayName(variation.attributes)
            : variation.bottle_size;

          if (variation.id) {
            // Update existing
            await supabaseAdmin
              .from('product_variations')
              .update({
                bottle_size: displayName,
                sku: variation.sku || null,
                barcode: variation.barcode || null,
                default_price: variation.default_price,
                discount_price: variation.discount_price || 0,
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
                bottle_size: displayName,
                sku: variation.sku || null,
                barcode: variation.barcode || null,
                default_price: variation.default_price,
                discount_price: variation.discount_price || 0,
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

    // Fetch complete product with variations
    const { data: completeProduct } = await supabaseAdmin
      .from('products_with_variations')
      .select('*')
      .eq('product_id', id)
      .eq('company_id', auth.companyId)
      .single();

    return NextResponse.json({
      success: true,
      product: completeProduct || data
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

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      );
    }

    // Instead of deleting, deactivate the product (soft delete)
    const { error } = await supabaseAdmin
      .from('products')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', productId)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('Error deactivating product:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Also deactivate all variations
    await supabaseAdmin
      .from('product_variations')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('product_id', productId)
      .eq('company_id', auth.companyId);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
