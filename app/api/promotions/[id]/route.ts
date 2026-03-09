import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// ─── Types ──────────────────────────────────────────────

interface PromotionItemInput {
  id?: string;
  variation_id: string;
  role: 'main' | 'component' | 'gift' | 'discounted';
  quantity?: number;
  special_price?: number | null;
  sort_order?: number;
}

interface PromotionTierInput {
  id?: string;
  min_qty: number;
  discount_type: 'percent' | 'fixed_price' | 'fixed_discount';
  discount_value: number;
}

interface PromotionPlatformInput {
  id?: string;
  platform: string;
  account_id?: string | null;
  bundle_price?: number | null;
  is_enabled?: boolean;
}

interface UpdatePromotionBody {
  name?: string;
  promotion_type?: string;
  status?: string;
  start_date?: string | null;
  end_date?: string | null;
  image?: string | null;
  description?: string | null;
  bundle_price?: number | null;
  purchase_min_spend?: number | null;
  per_gift_num?: number | null;
  purchase_limit?: number | null;
  items?: PromotionItemInput[];
  tiers?: PromotionTierInput[];
  platforms?: PromotionPlatformInput[];
}

// ─── GET /api/promotions/[id] ───────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Get promotion
    const { data: promotion, error } = await supabaseAdmin
      .from('promotions')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (error || !promotion) {
      return NextResponse.json({ error: 'ไม่พบโปรโมชั่น' }, { status: 404 });
    }

    // Get items with product info
    const { data: items } = await supabaseAdmin
      .from('promotion_items')
      .select(`
        id, promotion_id, variation_id, role, quantity, special_price, sort_order,
        product_variations!inner(
          id, variation_label, sku, barcode, default_price,
          products!inner(id, name, code, image)
        )
      `)
      .eq('promotion_id', id)
      .order('sort_order');

    // Fetch variation images from product_images table
    const variationIds = (items || []).map(i => i.variation_id);
    const variationImageMap = new Map<string, string>();
    if (variationIds.length > 0) {
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('variation_id, image_url')
        .in('variation_id', variationIds)
        .order('sort_order');
      for (const img of images || []) {
        if (img.variation_id && !variationImageMap.has(img.variation_id)) {
          variationImageMap.set(img.variation_id, img.image_url);
        }
      }
    }

    const mappedItems = (items || []).map(item => {
      const pv = item.product_variations as unknown as {
        id: string; variation_label: string; sku: string; barcode: string;
        default_price: number;
        products: { id: string; name: string; code: string; image: string };
      };
      return {
        id: item.id,
        variation_id: item.variation_id,
        role: item.role,
        quantity: item.quantity,
        special_price: item.special_price,
        sort_order: item.sort_order,
        product_id: pv?.products?.id || '',
        product_name: pv?.products?.name || '',
        product_code: pv?.products?.code || '',
        variation_label: pv?.variation_label || '',
        sku: pv?.sku || '',
        barcode: pv?.barcode || '',
        default_price: pv?.default_price || 0,
        image: variationImageMap.get(item.variation_id) || pv?.products?.image || '',
      };
    });

    // Get tiers
    const { data: tiers } = await supabaseAdmin
      .from('promotion_tiers')
      .select('*')
      .eq('promotion_id', id)
      .order('min_qty');

    // Get platforms
    const { data: platforms } = await supabaseAdmin
      .from('promotion_platforms')
      .select('*')
      .eq('promotion_id', id);

    // Get shopee deals
    const { data: shopeDeals } = await supabaseAdmin
      .from('shopee_deals')
      .select('*')
      .eq('promotion_id', id);

    return NextResponse.json({
      ...promotion,
      items: mappedItems,
      tiers: tiers || [],
      platforms: platforms || [],
      shopee_deals: shopeDeals || [],
    });
  } catch (err) {
    console.error('GET /api/promotions/[id] error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// ─── PUT /api/promotions/[id] ───────────────────────────

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify promotion exists and belongs to company
    const { data: existing } = await supabaseAdmin
      .from('promotions')
      .select('id, promotion_type')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบโปรโมชั่น' }, { status: 404 });
    }

    const body = (await req.json()) as UpdatePromotionBody;
    const promotionType = body.promotion_type || existing.promotion_type;

    // Validate items if provided
    if (body.items) {
      if (body.items.length === 0) {
        return NextResponse.json({ error: 'กรุณาเพิ่มสินค้า' }, { status: 400 });
      }

      switch (promotionType) {
        case 'bundle_set':
          if (body.items.length < 2) {
            return NextResponse.json({ error: 'เซ็ตรวมต้องมีสินค้าอย่างน้อย 2 รายการ' }, { status: 400 });
          }
          break;
        case 'buy_get_free': {
          const hasMain = body.items.some(i => i.role === 'main');
          const hasGift = body.items.some(i => i.role === 'gift');
          if (!hasMain || !hasGift) {
            return NextResponse.json({ error: 'ต้องมีสินค้าหลักและของแถมอย่างน้อยอย่างละ 1 ตัว' }, { status: 400 });
          }
          break;
        }
        case 'buy_get_discount': {
          const hasMainD = body.items.some(i => i.role === 'main');
          const hasDisc = body.items.some(i => i.role === 'discounted');
          if (!hasMainD || !hasDisc) {
            return NextResponse.json({ error: 'ต้องมีสินค้าหลักและสินค้าราคาพิเศษอย่างน้อยอย่างละ 1 ตัว' }, { status: 400 });
          }
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
          break;
        }
      }

      // Validate variation_ids
      const variationIds = body.items.map(i => i.variation_id);
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .in('id', variationIds)
        .eq('company_id', companyId);

      const foundIds = new Set((variations || []).map(v => v.id));
      const missing = variationIds.filter(vid => !foundIds.has(vid));
      if (missing.length > 0) {
        return NextResponse.json({ error: 'สินค้าบางรายการไม่พบในระบบ' }, { status: 400 });
      }
    }

    // Validate tiers if provided for qty_discount
    if (promotionType === 'qty_discount' && body.tiers !== undefined) {
      if (!body.tiers || body.tiers.length === 0) {
        return NextResponse.json({ error: 'กรุณาเพิ่มขั้นส่วนลดอย่างน้อย 1 ขั้น' }, { status: 400 });
      }
    }

    // Update promotion header
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.status !== undefined) updateData.status = body.status;
    if (body.start_date !== undefined) updateData.start_date = body.start_date;
    if (body.end_date !== undefined) updateData.end_date = body.end_date;
    if (body.image !== undefined) updateData.image = body.image;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.bundle_price !== undefined) updateData.bundle_price = body.bundle_price;
    if (body.purchase_min_spend !== undefined) updateData.purchase_min_spend = body.purchase_min_spend;
    if (body.per_gift_num !== undefined) updateData.per_gift_num = body.per_gift_num;
    if (body.purchase_limit !== undefined) updateData.purchase_limit = body.purchase_limit;

    const { error: updateError } = await supabaseAdmin
      .from('promotions')
      .update(updateData)
      .eq('id', id);

    if (updateError) throw updateError;

    // Replace items if provided (delete all + re-insert)
    if (body.items) {
      await supabaseAdmin
        .from('promotion_items')
        .delete()
        .eq('promotion_id', id);

      const itemsToInsert = body.items.map((item, idx) => ({
        company_id: companyId,
        promotion_id: id,
        variation_id: item.variation_id,
        role: item.role || 'component',
        quantity: item.quantity || 1,
        special_price: item.special_price ?? null,
        sort_order: item.sort_order ?? idx,
      }));

      const { error: itemsError } = await supabaseAdmin
        .from('promotion_items')
        .insert(itemsToInsert);

      if (itemsError) throw itemsError;
    }

    // Replace tiers if provided
    if (body.tiers !== undefined) {
      await supabaseAdmin
        .from('promotion_tiers')
        .delete()
        .eq('promotion_id', id);

      if (body.tiers && body.tiers.length > 0) {
        const tiersToInsert = body.tiers.map((tier, idx) => ({
          promotion_id: id,
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
    }

    // Replace platforms if provided
    if (body.platforms !== undefined) {
      await supabaseAdmin
        .from('promotion_platforms')
        .delete()
        .eq('promotion_id', id);

      if (body.platforms && body.platforms.length > 0) {
        const platformsToInsert = body.platforms.map(p => ({
          promotion_id: id,
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
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('PUT /api/promotions/[id] error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการแก้ไขโปรโมชั่น' }, { status: 500 });
  }
}

// ─── DELETE /api/promotions/[id] ────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { isAuth, companyId } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    // Verify promotion exists and belongs to company
    const { data: existing } = await supabaseAdmin
      .from('promotions')
      .select('id')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'ไม่พบโปรโมชั่น' }, { status: 404 });
    }

    // Soft delete — set status to inactive
    const { error } = await supabaseAdmin
      .from('promotions')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/promotions/[id] error:', err);
    return NextResponse.json({ error: 'เกิดข้อผิดพลาดในการลบโปรโมชั่น' }, { status: 500 });
  }
}
