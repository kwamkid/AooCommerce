import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// ─── Types ──────────────────────────────────────────────

interface PromotionItemInput {
  variation_id: string;
  role: 'main' | 'component' | 'gift' | 'discounted';
  quantity?: number;
  special_price?: number | null;
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

    if (promotionIds.length > 0) {
      const { data: allItems } = await supabaseAdmin
        .from('promotion_items')
        .select(`
          id, promotion_id, variation_id, role, quantity, special_price, sort_order,
          product_variations!inner(
            id, variation_label, sku, default_price,
            products!inner(id, name, code)
          )
        `)
        .in('promotion_id', promotionIds)
        .order('sort_order');

      for (const item of allItems || []) {
        if (!itemsMap[item.promotion_id]) itemsMap[item.promotion_id] = [];
        const pv = item.product_variations as unknown as {
          id: string; variation_label: string; sku: string; default_price: number;
          products: { id: string; name: string; code: string };
        };
        itemsMap[item.promotion_id].push({
          id: item.id,
          variation_id: item.variation_id,
          role: item.role,
          quantity: item.quantity,
          special_price: item.special_price,
          sort_order: item.sort_order,
          product_name: pv?.products?.name || '',
          product_code: pv?.products?.code || '',
          variation_label: pv?.variation_label || '',
          sku: pv?.sku || '',
          default_price: pv?.default_price || 0,
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
          const items = itemsMap[p.id] as { variation_id: string }[];
          if (items && items.length > 0 && varImageMap[items[0].variation_id]) {
            fallbackImageMap[p.id] = varImageMap[items[0].variation_id];
          }
        }
      }
    }

    // Combine
    const result = (promotions || []).map(p => ({
      ...p,
      image: p.image || fallbackImageMap[p.id] || null,
      items: itemsMap[p.id] || [],
      tiers: tiersMap[p.id] || [],
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
        if (!body.bundle_price || body.bundle_price <= 0) {
          return NextResponse.json({ error: 'กรุณาระบุราคาเซ็ต' }, { status: 400 });
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

    // Validate variation_ids exist
    const variationIds = body.items.map(i => i.variation_id);
    const { data: variations } = await supabaseAdmin
      .from('product_variations')
      .select('id')
      .in('id', variationIds)
      .eq('company_id', companyId);

    const foundIds = new Set((variations || []).map(v => v.id));
    const missing = variationIds.filter(id => !foundIds.has(id));
    if (missing.length > 0) {
      return NextResponse.json({ error: `สินค้าบางรายการไม่พบในระบบ` }, { status: 400 });
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
        purchase_min_spend: body.purchase_min_spend ?? null,
        per_gift_num: body.per_gift_num ?? null,
        purchase_limit: body.purchase_limit ?? null,
        created_by: userId || null,
      })
      .select()
      .single();

    if (promError) throw promError;

    // Insert promotion items
    const itemsToInsert = body.items.map((item, idx) => ({
      company_id: companyId,
      promotion_id: promotion.id,
      variation_id: item.variation_id,
      role: item.role || 'component',
      quantity: item.quantity || 1,
      special_price: item.special_price ?? null,
      sort_order: item.sort_order ?? idx,
    }));

    console.log(`[POST promotion] inserting ${itemsToInsert.length} items for promotion ${promotion.id}`);

    const { error: itemsError } = await supabaseAdmin
      .from('promotion_items')
      .insert(itemsToInsert);

    if (itemsError) {
      console.error('[POST promotion] items insert error:', itemsError);
      throw itemsError;
    }
    console.log(`[POST promotion] items inserted successfully`);

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
  } catch (err) {
    console.error('POST /api/promotions error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการสร้างโปรโมชั่น' }, { status: 500 });
  }
}
