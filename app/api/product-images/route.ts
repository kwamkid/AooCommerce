import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return { isAuth: false };
    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !user) return { isAuth: false };
    return { isAuth: true, userId: user.id };
  } catch {
    return { isAuth: false };
  }
}

// GET - Fetch images for a product or variation
// Supports: ?product_id=X (product images only)
//           ?product_id=X&include_variations=true (product + all variation images in one call)
//           ?variation_id=X (single variation images)
export async function GET(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const productId = searchParams.get('product_id');
    const variationId = searchParams.get('variation_id');
    const includeVariations = searchParams.get('include_variations') === 'true';

    if (!productId && !variationId) {
      return NextResponse.json({ error: 'product_id or variation_id is required' }, { status: 400 });
    }

    // Bulk fetch: product images + all variation images in one query
    if (productId && includeVariations) {
      // Get variation IDs for this product
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('product_id', productId);

      const variationIds = (variations || []).map(v => v.id);

      // Fetch product images
      const { data: prodImages, error: prodErr } = await supabaseAdmin
        .from('product_images')
        .select('*')
        .eq('product_id', productId)
        .order('sort_order', { ascending: true });

      if (prodErr) {
        return NextResponse.json({ error: prodErr.message }, { status: 500 });
      }

      // Fetch all variation images in one query
      let varImages: typeof prodImages = [];
      if (variationIds.length > 0) {
        const { data: vImgs, error: varErr } = await supabaseAdmin
          .from('product_images')
          .select('*')
          .in('variation_id', variationIds)
          .order('sort_order', { ascending: true });

        if (varErr) {
          return NextResponse.json({ error: varErr.message }, { status: 500 });
        }
        varImages = vImgs || [];
      }

      // Group variation images by variation_id
      const variationImagesMap: Record<string, typeof prodImages> = {};
      for (const img of varImages || []) {
        const vid = img.variation_id;
        if (vid) {
          if (!variationImagesMap[vid]) variationImagesMap[vid] = [];
          variationImagesMap[vid].push(img);
        }
      }

      return NextResponse.json({
        images: prodImages || [],
        variation_images: variationImagesMap
      });
    }

    // Single query mode (original behavior)
    let query = supabaseAdmin
      .from('product_images')
      .select('*')
      .order('sort_order', { ascending: true });

    if (productId) {
      query = query.eq('product_id', productId);
    } else if (variationId) {
      query = query.eq('variation_id', variationId);
    }

    const { data: images, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ images: images || [] });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Save image metadata (client uploads file to Storage directly)
export async function POST(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { product_id, variation_id, image_url, storage_path, sort_order } = body;

    if (!product_id && !variation_id) {
      return NextResponse.json({ error: 'product_id or variation_id is required' }, { status: 400 });
    }

    if (!image_url || !storage_path) {
      return NextResponse.json({ error: 'image_url and storage_path are required' }, { status: 400 });
    }

    const { data: image, error } = await supabaseAdmin
      .from('product_images')
      .insert({
        product_id: product_id || null,
        variation_id: variation_id || null,
        image_url,
        storage_path,
        sort_order: sort_order ?? 0
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ image });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT - Update sort order for images
export async function PUT(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { images } = body;

    if (!images || !Array.isArray(images)) {
      return NextResponse.json({ error: 'images array is required' }, { status: 400 });
    }

    for (const img of images) {
      const { error } = await supabaseAdmin
        .from('product_images')
        .update({ sort_order: img.sort_order })
        .eq('id', img.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE - Delete an image from DB and Storage
export async function DELETE(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);
    if (!isAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get('id');

    if (!imageId) {
      return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    // Get image record to find storage_path
    const { data: image, error: fetchError } = await supabaseAdmin
      .from('product_images')
      .select('storage_path')
      .eq('id', imageId)
      .single();

    if (fetchError || !image) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 });
    }

    // Delete from Storage
    if (image.storage_path) {
      await supabaseAdmin.storage
        .from('product-images')
        .remove([image.storage_path]);
    }

    // Delete from DB
    const { error: deleteError } = await supabaseAdmin
      .from('product_images')
      .delete()
      .eq('id', imageId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
