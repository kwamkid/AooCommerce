import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// ─── Types ──────────────────────────────────────────────

interface PromotionItemInput {
  variation_id?: string;
  product_id?: string | null;
  role: 'main' | 'component' | 'gift' | 'discounted';
  quantity?: number;
  special_price?: number | null;
  sub_item_limit?: number | null;
  discount_type?: string | null;
  discount_input?: number | null;
  sort_order?: number;
}

interface PromotionTierInput {
  min_qty: number;
  discount_type: 'percent' | 'fixed_price' | 'fixed_discount';
  discount_value: number;
}

interface PromotionPlatformInput {
  platform: string;
  account_id?: string | null;
  bundle_price?: number | null;
  is_enabled?: boolean;
}

interface CreatePromotionBody {
  name: string;
  promotion_type: 'bundle_set' | 'buy_get_free' | 'buy_get_discount' | 'qty_discount';
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  image?: string | null;
  description?: string | null;
  bundle_price?: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  purchase_min_spend?: number | null;
  per_gift_num?: number | null;
  purchase_limit?: number | null;
  items: PromotionItemInput[];
  tiers?: PromotionTierInput[];
  platforms?: PromotionPlatformInput[];
}

// ─── GET /api/promotions ────────────────────────────────

export async function GET(req: NextRequest) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get('search') || '';
  const type = searchParams.get('type') || '';
  const status = searchParams.get('status') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = (page - 1) * limit;

  try {
    // Build query
    let query = supabaseAdmin
      .from('promotions')
      .select('*', { count: 'exact' })
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (type) {
      query = query.eq('promotion_type', type);
    }
    if (status) {
      query = query.eq('status', status);
    } else {
      // Default: don't show inactive
      query = query.neq('status', 'inactive');
    }

    query = query.range(offset, offset + limit - 1);

    const { data: promotions, count, error } = await query;
    if (error) throw error;

    // Fetch items for each promotion
    const promotionIds = (promotions || []).map(p => p.id);
    let itemsMap: Record<string, unknown[]> = {};
    let productNameMap: Record<string, { name: string; code: string; image: string | null; default_price: number; max_price: number }> = {};
    let productVariationMap: Record<string, string> = {};

    if (promotionIds.length > 0) {
      const { data: allItems } = await supabaseAdmin
        .from('promotion_items')
        .select(`
          id, promotion_id, variation_id, product_id, role, quantity, special_price, sub_item_limit, sort_order,
          product_variations(
            id, variation_label, sku, default_price,
            products(id, name, code)
          )
        `)
        .in('promotion_id', promotionIds)
        .order('sort_order');

      // For product-level items (variation_id is null), fetch product name separately
      const productLevelItems = (allItems || []).filter(i => !i.variation_id && i.product_id);
      if (productLevelItems.length > 0) {
        const productIds = [...new Set(productLevelItems.map(i => i.product_id))];
        const { data: products } = await supabaseAdmin
          .from('products')
          .select('id, name, code, image')
          .in('id', productIds);
        // Also fetch min default_price from variations for each product
        const { data: priceData } = await supabaseAdmin
          .from('product_variations')
          .select('id, product_id, default_price, sku')
          .in('product_id', productIds)
          .order('default_price', { ascending: true });
        const priceRangeMap: Record<string, { min: number; max: number }> = {};
        for (const v of priceData || []) {
          if (!v.product_id) continue;
          const price = v.default_price || 0;
          if (!priceRangeMap[v.product_id]) {
            priceRangeMap[v.product_id] = { min: price, max: price };
          } else {
            priceRangeMap[v.product_id].min = Math.min(priceRangeMap[v.product_id].min, price);
            priceRangeMap[v.product_id].max = Math.max(priceRangeMap[v.product_id].max, price);
          }
        }
        // Map product_id → first (cheapest) variation_id
        for (const v of priceData || []) {
          if (v.product_id && !productVariationMap[v.product_id]) {
            productVariationMap[v.product_id] = v.id;
          }
        }
        for (const p of products || []) {
          const range = priceRangeMap[p.id];
          productNameMap[p.id] = {
            name: p.name, code: p.code, image: p.image,
            default_price: range?.min || 0,
            max_price: range?.max || 0,
          };
        }
      }

      for (const item of allItems || []) {
        if (!itemsMap[item.promotion_id]) itemsMap[item.promotion_id] = [];
        const pv = item.product_variations as unknown as {
          id: string; variation_label: string; sku: string; default_price: number;
          products: { id: string; name: string; code: string };
        } | null;
        const productInfo = item.product_id ? productNameMap[item.product_id] : null;
        // Resolve variation_id: use item's own, or fallback to first variation of product
        const resolvedVariationId = item.variation_id
          || (item.product_id ? productVariationMap[item.product_id] : null)
          || null;
        itemsMap[item.promotion_id].push({
          id: item.id,
          variation_id: resolvedVariationId,
          product_id: item.product_id,
          role: item.role,
          quantity: item.quantity,
          special_price: item.special_price,
          sub_item_limit: item.sub_item_limit,
          sort_order: item.sort_order,
          product_name: pv?.products?.name || productInfo?.name || '',
          product_code: pv?.products?.code || productInfo?.code || '',
          variation_label: pv?.variation_label || '',
          sku: pv?.sku || '',
          default_price: pv?.default_price || productInfo?.default_price || 0,
          max_price: productInfo?.max_price || pv?.default_price || 0,
        });
      }
    }

    // Fetch tiers for qty_discount promotions
    const qtyDiscountIds = (promotions || [])
      .filter(p => p.promotion_type === 'qty_discount')
      .map(p => p.id);
    let tiersMap: Record<string, unknown[]> = {};

    if (qtyDiscountIds.length > 0) {
      const { data: allTiers } = await supabaseAdmin
        .from('promotion_tiers')
        .select('*')
        .in('promotion_id', qtyDiscountIds)
        .order('min_qty');

      for (const tier of allTiers || []) {
        if (!tiersMap[tier.promotion_id]) tiersMap[tier.promotion_id] = [];
        tiersMap[tier.promotion_id].push(tier);
      }
    }

    // Fetch fallback images for promotions without image
    // Get first item's variation_id for each imageless promotion
    const imagelessPromos = (promotions || []).filter(p => !p.image);
    let fallbackImageMap: Record<string, string> = {};

    if (imagelessPromos.length > 0) {
      const firstVariationIds: string[] = [];
      for (const p of imagelessPromos) {
        const items = itemsMap[p.id] as { variation_id: string }[];
        if (items && items.length > 0) {
          firstVariationIds.push(items[0].variation_id);
        }
      }

      if (firstVariationIds.length > 0) {
        const { data: images } = await supabaseAdmin
          .from('product_images')
          .select('variation_id, image_url')
          .in('variation_id', firstVariationIds)
          .order('sort_order', { ascending: true });

        // Build variation_id → first image
        const varImageMap: Record<string, string> = {};
        for (const img of images || []) {
          if (img.variation_id && !varImageMap[img.variation_id]) {
            varImageMap[img.variation_id] = img.image_url;
          }
        }

        // Map promotion_id → fallback image
        for (const p of imagelessPromos) {
          const items = itemsMap[p.id] as { variation_id: string; product_id?: string }[];
          if (items && items.length > 0) {
            if (items[0].variation_id && varImageMap[items[0].variation_id]) {
              fallbackImageMap[p.id] = varImageMap[items[0].variation_id];
            } else if (items[0].product_id && productNameMap[items[0].product_id]?.image) {
              fallbackImageMap[p.id] = productNameMap[items[0].product_id].image!;
            }
          }
        }
      }
    }

    // Also fallback for promotions with only product-level items (no variation images found)
    for (const p of imagelessPromos || []) {
      if (fallbackImageMap[p.id]) continue;
      const items = itemsMap[p.id] as { product_id?: string }[];
      if (items && items.length > 0) {
        for (const item of items) {
          if (item.product_id && productNameMap[item.product_id]?.image) {
            fallbackImageMap[p.id] = productNameMap[item.product_id].image!;
            break;
          }
        }
      }
    }

    // Fetch shopee_deals for all promotions (to show sync status) with shop names
    let dealsMap: Record<string, { account_id: string; status: string; shop_name: string; updated_at: string }[]> = {};
    if (promotionIds.length > 0) {
      const { data: allDeals } = await supabaseAdmin
        .from('shopee_deals')
        .select('promotion_id, account_id, status, updated_at, marketplace_accounts(shop_name)')
        .in('promotion_id', promotionIds);

      // Also fetch account names separately as fallback
      const dealAccountIds = [...new Set((allDeals || []).map(d => d.account_id).filter(Boolean))];
      let accountNameMap: Record<string, string> = {};
      if (dealAccountIds.length > 0) {
        const { data: accounts } = await supabaseAdmin
          .from('marketplace_accounts')
          .select('id, shop_name')
          .in('id', dealAccountIds);
        for (const a of accounts || []) {
          if (a.shop_name) accountNameMap[a.id] = a.shop_name;
        }
      }

      for (const deal of allDeals || []) {
        if (!dealsMap[deal.promotion_id]) dealsMap[deal.promotion_id] = [];
        const acc = deal.marketplace_accounts as unknown as { shop_name: string } | null;
        const shopName = acc?.shop_name || accountNameMap[deal.account_id] || 'ไม่ทราบชื่อร้าน';
        dealsMap[deal.promotion_id].push({
          account_id: deal.account_id,
          status: deal.status,
          shop_name: shopName,
          updated_at: deal.updated_at,
        });
      }
    }

    // Fetch item images for all variations (for card layout)
    const allVariationIds = Object.values(itemsMap).flat().map((i: any) => i.variation_id).filter(Boolean);
    let itemImageMap: Record<string, string> = {};
    if (allVariationIds.length > 0) {
      const { data: allImages } = await supabaseAdmin
        .from('product_images')
        .select('variation_id, image_url')
        .in('variation_id', allVariationIds)
        .order('sort_order', { ascending: true });

      for (const img of allImages || []) {
        if (img.variation_id && !itemImageMap[img.variation_id]) {
          itemImageMap[img.variation_id] = img.image_url;
        }
      }
    }

    // Combine
    const result = (promotions || []).map(p => ({
      ...p,
      image: p.image || fallbackImageMap[p.id] || null,
      items: (itemsMap[p.id] || []).map((item: any) => ({
        ...item,
        image: itemImageMap[item.variation_id] || (item.product_id ? productNameMap[item.product_id]?.image : null) || null,
      })),
      tiers: tiersMap[p.id] || [],
      shopee_deals: dealsMap[p.id] || [],
    }));

    return NextResponse.json({
      promotions: result,
      total: count || 0,
      page,
      limit,
    });
  } catch (err) {
    console.error('GET /api/promotions error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// ─── POST /api/promotions ───────────────────────────────

export async function POST(req: NextRequest) {
  const { isAuth, companyId, userId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as CreatePromotionBody;

    // Validate required fields
    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อโปรโมชั่น' }, { status: 400 });
    }
    if (!body.promotion_type) {
      return NextResponse.json({ error: 'กรุณาเลือกประเภทโปรโมชั่น' }, { status: 400 });
    }

    const validTypes = ['bundle_set', 'buy_get_free', 'buy_get_discount', 'qty_discount'];
    if (!validTypes.includes(body.promotion_type)) {
      return NextResponse.json({ error: 'ประเภทโปรโมชั่นไม่ถูกต้อง' }, { status: 400 });
    }

    // Validate items
    if (!body.items || body.items.length === 0) {
      return NextResponse.json({ error: 'กรุณาเพิ่มสินค้า' }, { status: 400 });
    }

    // Type-specific validation
    switch (body.promotion_type) {
      case 'bundle_set':
        if (body.items.length < 2) {
          return NextResponse.json({ error: 'เซ็ตรวมต้องมีสินค้าอย่างน้อย 2 รายการ' }, { status: 400 });
        }
        if (body.discount_type === 'fix_price') {
          if (!body.bundle_price || body.bundle_price <= 0) {
            return NextResponse.json({ error: 'กรุณาระบุราคาเซ็ต' }, { status: 400 });
          }
        } else {
          if (!body.discount_value || body.discount_value <= 0) {
            return NextResponse.json({ error: 'กรุณาระบุส่วนลด' }, { status: 400 });
          }
          if (body.discount_type === 'percent' && body.discount_value > 100) {
            return NextResponse.json({ error: 'ส่วนลดไม่เกิน 100%' }, { status: 400 });
          }
        }
        break;

      case 'buy_get_free': {
        const hasMain = body.items.some(i => i.role === 'main');
        const hasGift = body.items.some(i => i.role === 'gift');
        if (!hasMain || !hasGift) {
          return NextResponse.json({ error: 'ต้องมีสินค้าหลักอย่างน้อย 1 ตัว และของแถมอย่างน้อย 1 ตัว' }, { status: 400 });
        }
        break;
      }

      case 'buy_get_discount': {
        const hasMainD = body.items.some(i => i.role === 'main');
        const hasDisc = body.items.some(i => i.role === 'discounted');
        if (!hasMainD || !hasDisc) {
          return NextResponse.json({ error: 'ต้องมีสินค้าหลักอย่างน้อย 1 ตัว และสินค้าราคาพิเศษอย่างน้อย 1 ตัว' }, { status: 400 });
        }
        // Discounted items must have special_price
        const missingPrice = body.items.filter(i => i.role === 'discounted' && (i.special_price == null || i.special_price < 0));
        if (missingPrice.length > 0) {
          return NextResponse.json({ error: 'สินค้าราคาพิเศษต้องระบุราคา' }, { status: 400 });
        }
        break;
      }

      case 'qty_discount': {
        if (body.items.length !== 1) {
          return NextResponse.json({ error: 'ซื้อเยอะลดเยอะต้องเลือกสินค้า 1 ตัว' }, { status: 400 });
        }
        if (!body.tiers || body.tiers.length === 0) {
          return NextResponse.json({ error: 'กรุณาเพิ่มขั้นส่วนลดอย่างน้อย 1 ขั้น' }, { status: 400 });
        }
        break;
      }
    }

    // Validate items exist — bundle_set uses product_id, others use variation_id
    if (body.promotion_type === 'bundle_set') {
      const productIds = body.items.map(i => i.product_id || i.variation_id).filter(Boolean) as string[];
      if (productIds.length > 0) {
        const { data: prods } = await supabaseAdmin
          .from('products')
          .select('id')
          .in('id', productIds)
          .eq('company_id', companyId);
        const foundIds = new Set((prods || []).map(p => p.id));
        const missing = productIds.filter(id => !foundIds.has(id));
        if (missing.length > 0) {
          return NextResponse.json({ error: 'สินค้าบางรายการไม่พบในระบบ' }, { status: 400 });
        }
      }
    } else {
      const variationIds = body.items.map(i => i.variation_id).filter(Boolean) as string[];
      if (variationIds.length > 0) {
        const { data: variations } = await supabaseAdmin
          .from('product_variations')
          .select('id')
          .in('id', variationIds)
          .eq('company_id', companyId);
        const foundIds = new Set((variations || []).map(v => v.id));
        const missing = variationIds.filter(id => !foundIds.has(id));
        if (missing.length > 0) {
          return NextResponse.json({ error: 'สินค้าบางรายการไม่พบในระบบ' }, { status: 400 });
        }
      }
    }

    // Create promotion
    const { data: promotion, error: promError } = await supabaseAdmin
      .from('promotions')
      .insert({
        company_id: companyId,
        name: body.name.trim(),
        promotion_type: body.promotion_type,
        status: body.status || 'active',
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        image: body.image || null,
        description: body.description || null,
        bundle_price: body.bundle_price || null,
        discount_type: body.discount_type || null,
        discount_value: body.discount_value ?? null,
        purchase_min_spend: body.purchase_min_spend ?? null,
        per_gift_num: body.per_gift_num ?? null,
        purchase_limit: body.purchase_limit ?? null,
        created_by: userId || null,
      })
      .select()
      .single();

    if (promError) throw promError;

    // Rollback helper: delete everything if any sub-insert fails
    const rollback = async (promotionId: string) => {
      console.error(`[POST promotion] rolling back promotion ${promotionId}`);
      await supabaseAdmin.from('promotion_platforms').delete().eq('promotion_id', promotionId);
      await supabaseAdmin.from('promotion_tiers').delete().eq('promotion_id', promotionId);
      await supabaseAdmin.from('promotion_items').delete().eq('promotion_id', promotionId);
      await supabaseAdmin.from('promotions').delete().eq('id', promotionId);
    };

    try {
      // Insert promotion items
      const itemsToInsert = body.items.map((item, idx) => ({
        company_id: companyId,
        promotion_id: promotion.id,
        variation_id: item.variation_id || null,
        product_id: item.product_id || null,
        role: item.role || 'component',
        quantity: item.quantity || 1,
        special_price: item.special_price ?? null,
        sub_item_limit: item.sub_item_limit ?? null,
        discount_type: item.discount_type || null,
        discount_input: item.discount_input ?? null,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('promotion_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;

      // Insert tiers (for qty_discount)
      if (body.tiers && body.tiers.length > 0) {
        const tiersToInsert = body.tiers.map((tier, idx) => ({
          promotion_id: promotion.id,
          min_qty: tier.min_qty,
          discount_type: tier.discount_type,
          discount_value: tier.discount_value,
          sort_order: idx,
        }));

        const { error: tiersError } = await supabaseAdmin
          .from('promotion_tiers')
          .insert(tiersToInsert);

        if (tiersError) throw tiersError;
      }

      // Insert platform pricing
      if (body.platforms && body.platforms.length > 0) {
        const platformsToInsert = body.platforms.map(p => ({
          promotion_id: promotion.id,
          platform: p.platform,
          account_id: p.account_id || null,
          bundle_price: p.bundle_price ?? null,
          is_enabled: p.is_enabled ?? true,
        }));

        const { error: platError } = await supabaseAdmin
          .from('promotion_platforms')
          .insert(platformsToInsert);

        if (platError) throw platError;
      }

      return NextResponse.json({
        success: true,
        promotion: { ...promotion, items: itemsToInsert },
      });
    } catch (subErr) {
      // Rollback: delete promotion + all related data
      await rollback(promotion.id);
      console.error('POST /api/promotions sub-insert error (rolled back):', subErr);
      return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างโปรโมชั่น (ถูก rollback แล้ว)' }, { status: 500 });
    }
  } catch (err) {
    console.error('POST /api/promotions error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างโปรโมชั่น' }, { status: 500 });
  }
}
