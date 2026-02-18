// Path: app/api/pos/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET — Fetch products with per-warehouse stock for POS grid
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouse_id'); // optional — null = no stock tracking
    const search = searchParams.get('search');
    const categoryId = searchParams.get('category_id');
    const barcode = searchParams.get('barcode');

    // Barcode lookup — exact match
    if (barcode) {
      const { data: variation } = await supabaseAdmin
        .from('product_variations')
        .select(`
          id,
          product_id,
          variation_label,
          sku,
          barcode,
          default_price,
          discount_price,
          is_active,
          product:products!inner(
            id, code, name, image, category_id, is_active
          )
        `)
        .eq('company_id', auth.companyId)
        .eq('barcode', barcode)
        .eq('is_active', true)
        .single();

      if (!variation) {
        return NextResponse.json({ products: [], message: 'ไม่พบสินค้าจากบาร์โค้ดนี้' });
      }

      // Get stock only if warehouse is specified
      let stock = -1; // -1 = unlimited (no warehouse)
      if (warehouseId) {
        const { data: inv } = await supabaseAdmin
          .from('inventory')
          .select('quantity, reserved_quantity')
          .eq('warehouse_id', warehouseId)
          .eq('variation_id', variation.id)
          .eq('company_id', auth.companyId)
          .single();
        stock = inv ? Number(inv.quantity || 0) - Number(inv.reserved_quantity || 0) : 0;
      }

      const product = variation.product as any;
      const price = Number(variation.discount_price || 0) > 0
        ? Number(variation.discount_price)
        : Number(variation.default_price || 0);

      return NextResponse.json({
        products: [{
          variation_id: variation.id,
          product_id: product.id,
          product_code: product.code,
          product_name: product.name,
          variation_label: variation.variation_label || '',
          barcode: variation.barcode,
          price,
          original_price: Number(variation.default_price || 0),
          stock,
          category_id: product.category_id,
          image_url: product.image,
        }]
      });
    }

    // Regular product list query
    let query = supabaseAdmin
      .from('product_variations')
      .select(`
        id,
        product_id,
        variation_label,
        sku,
        barcode,
        default_price,
        discount_price,
        is_active,
        product:products!inner(
          id, code, name, image, category_id, is_active
        )
      `)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .eq('products.is_active', true);

    if (categoryId) {
      query = query.eq('products.category_id', categoryId);
    }

    if (search) {
      // Supabase PostgREST doesn't support cross-table columns in .or()
      // So we first find matching product IDs by name/code, then filter variations
      const { data: matchingProducts } = await supabaseAdmin
        .from('products')
        .select('id')
        .eq('company_id', auth.companyId)
        .eq('is_active', true)
        .or(`name.ilike.%${search}%,code.ilike.%${search}%`);

      const matchingProductIds = (matchingProducts || []).map(p => p.id);

      // Search in variation fields (sku, barcode) OR product matches
      if (matchingProductIds.length > 0) {
        query = query.or(`sku.ilike.%${search}%,barcode.ilike.%${search}%,product_id.in.(${matchingProductIds.join(',')})`);
      } else {
        query = query.or(`sku.ilike.%${search}%,barcode.ilike.%${search}%`);
      }
    }

    const { data: variations, error } = await query.order('product_id').limit(200);

    if (error) {
      console.error('[POS Products] Query error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!variations || variations.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Fetch inventory only if warehouse is specified
    const stockMap = new Map<string, number>();
    if (warehouseId) {
      const variationIds = variations.map(v => v.id);
      const { data: inventoryData } = await supabaseAdmin
        .from('inventory')
        .select('variation_id, quantity, reserved_quantity')
        .eq('warehouse_id', warehouseId)
        .eq('company_id', auth.companyId)
        .in('variation_id', variationIds);

      for (const inv of (inventoryData || [])) {
        stockMap.set(inv.variation_id, Number(inv.quantity || 0) - Number(inv.reserved_quantity || 0));
      }
    }

    // Build flat product list
    const products = variations.map(v => {
      const product = v.product as any;
      const price = Number(v.discount_price || 0) > 0
        ? Number(v.discount_price)
        : Number(v.default_price || 0);

      return {
        variation_id: v.id,
        product_id: product.id,
        product_code: product.code || '',
        product_name: product.name,
        variation_label: v.variation_label || '',
        barcode: v.barcode,
        price,
        original_price: Number(v.default_price || 0),
        stock: warehouseId ? (stockMap.get(v.id) || 0) : -1, // -1 = unlimited
        category_id: product.category_id,
        image_url: product.image,
      };
    });

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
