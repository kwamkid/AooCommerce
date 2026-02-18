// Path: app/api/products/merge/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

interface VariationMapping {
  source_variation_id: string;
  target_variation_id: string | null; // null = move as-is (don't merge)
}

interface MergeRequest {
  target_product_id: string;  // Master — will be kept
  source_product_id: string;  // Will be soft-deleted after merge
  variation_mapping: VariationMapping[];
  use_source_fields?: string[]; // e.g. ["name", "code", "image", "description", "category_id", "brand_id"]
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: MergeRequest = await request.json();
    const { target_product_id, source_product_id, variation_mapping, use_source_fields } = body;

    if (!target_product_id || !source_product_id) {
      return NextResponse.json({ error: 'Missing target_product_id or source_product_id' }, { status: 400 });
    }
    if (target_product_id === source_product_id) {
      return NextResponse.json({ error: 'Cannot merge a product with itself' }, { status: 400 });
    }

    // Verify both products exist and belong to this company
    const [{ data: target }, { data: source }] = await Promise.all([
      supabaseAdmin.from('products').select('*').eq('id', target_product_id).eq('company_id', auth.companyId).single(),
      supabaseAdmin.from('products').select('*').eq('id', source_product_id).eq('company_id', auth.companyId).single(),
    ]);

    if (!target || !source) {
      return NextResponse.json({ error: 'One or both products not found' }, { status: 404 });
    }

    const now = new Date().toISOString();

    // --- Step 1: Apply source fields to target ---
    if (use_source_fields && use_source_fields.length > 0) {
      const allowedFields = ['name', 'code', 'description', 'image', 'category_id', 'brand_id'];
      const updateData: Record<string, unknown> = { updated_at: now };
      for (const field of use_source_fields) {
        if (allowedFields.includes(field)) {
          updateData[field] = (source as Record<string, unknown>)[field];
        }
      }
      await supabaseAdmin.from('products').update(updateData).eq('id', target_product_id);
    }

    // --- Step 2: Process variation mapping ---
    for (const mapping of variation_mapping || []) {
      const { source_variation_id, target_variation_id } = mapping;

      if (target_variation_id) {
        // Matched pair: merge source variation → target variation
        await mergeVariation(source_variation_id, target_variation_id, target_product_id, now);
      } else {
        // Unmatched: move source variation to target product
        await moveVariation(source_variation_id, target_product_id, now);
      }
    }

    // --- Step 3: Move remaining product-level data ---
    // Product images (product-level, not variation-level)
    await supabaseAdmin
      .from('product_images')
      .update({ product_id: target_product_id })
      .eq('product_id', source_product_id)
      .is('variation_id', null);

    // Remaining marketplace links
    await supabaseAdmin
      .from('marketplace_product_links')
      .update({ product_id: target_product_id, updated_at: now })
      .eq('product_id', source_product_id);

    // Remaining order_items
    await supabaseAdmin
      .from('order_items')
      .update({ product_id: target_product_id })
      .eq('product_id', source_product_id);

    // --- Step 4: Soft-delete source product ---
    await supabaseAdmin
      .from('products')
      .update({ is_active: false, updated_at: now })
      .eq('id', source_product_id);

    await supabaseAdmin
      .from('product_variations')
      .update({ is_active: false, updated_at: now })
      .eq('product_id', source_product_id);

    return NextResponse.json({
      success: true,
      target_product_id,
      source_product_id,
      message: 'Products merged successfully',
    });
  } catch (error) {
    console.error('Product merge error:', error);
    return NextResponse.json({ error: 'Failed to merge products' }, { status: 500 });
  }
}

/**
 * Merge source variation into target variation:
 * - Reassign order_items, inventory (sum qty), inventory_transactions,
 *   transfer/receive/issue items, marketplace links, product images
 * - Soft-delete source variation
 */
async function mergeVariation(
  sourceVarId: string,
  targetVarId: string,
  targetProductId: string,
  now: string
) {
  // 1. order_items: reassign variation_id + product_id
  await supabaseAdmin
    .from('order_items')
    .update({ variation_id: targetVarId, product_id: targetProductId })
    .eq('variation_id', sourceVarId);

  // 2. inventory: merge quantities per warehouse
  const { data: sourceInventory } = await supabaseAdmin
    .from('inventory')
    .select('id, warehouse_id, quantity, reserved_quantity')
    .eq('variation_id', sourceVarId);

  for (const srcInv of sourceInventory || []) {
    const { data: targetInv } = await supabaseAdmin
      .from('inventory')
      .select('id, quantity, reserved_quantity')
      .eq('variation_id', targetVarId)
      .eq('warehouse_id', srcInv.warehouse_id)
      .single();

    if (targetInv) {
      // Target has inventory in same warehouse — sum quantities
      await supabaseAdmin
        .from('inventory')
        .update({
          quantity: Number(targetInv.quantity) + Number(srcInv.quantity),
          reserved_quantity: Number(targetInv.reserved_quantity) + Number(srcInv.reserved_quantity),
          updated_at: now,
        })
        .eq('id', targetInv.id);
      // Delete source inventory record
      await supabaseAdmin.from('inventory').delete().eq('id', srcInv.id);
    } else {
      // Target doesn't have inventory in this warehouse — reassign
      await supabaseAdmin
        .from('inventory')
        .update({ variation_id: targetVarId, updated_at: now })
        .eq('id', srcInv.id);
    }
  }

  // 3. inventory_transactions: reassign
  await supabaseAdmin
    .from('inventory_transactions')
    .update({ variation_id: targetVarId })
    .eq('variation_id', sourceVarId);

  // 4. inventory_transfer_items: reassign
  await supabaseAdmin
    .from('inventory_transfer_items')
    .update({ variation_id: targetVarId })
    .eq('variation_id', sourceVarId);

  // 5. inventory_receive_items: reassign
  await supabaseAdmin
    .from('inventory_receive_items')
    .update({ variation_id: targetVarId })
    .eq('variation_id', sourceVarId);

  // 6. inventory_issue_items: reassign
  await supabaseAdmin
    .from('inventory_issue_items')
    .update({ variation_id: targetVarId })
    .eq('variation_id', sourceVarId);

  // 7. marketplace_product_links: reassign
  await supabaseAdmin
    .from('marketplace_product_links')
    .update({ product_id: targetProductId, variation_id: targetVarId, updated_at: now })
    .eq('variation_id', sourceVarId);

  // 8. product_images: reassign
  await supabaseAdmin
    .from('product_images')
    .update({ product_id: targetProductId, variation_id: targetVarId })
    .eq('variation_id', sourceVarId);

  // 9. Soft-delete source variation
  await supabaseAdmin
    .from('product_variations')
    .update({ is_active: false, updated_at: now })
    .eq('id', sourceVarId);
}

/**
 * Move source variation to target product (no merging, keep as separate variation)
 */
async function moveVariation(
  sourceVarId: string,
  targetProductId: string,
  now: string
) {
  // Move the variation itself
  await supabaseAdmin
    .from('product_variations')
    .update({ product_id: targetProductId, updated_at: now })
    .eq('id', sourceVarId);

  // Update product_id references
  await supabaseAdmin
    .from('order_items')
    .update({ product_id: targetProductId })
    .eq('variation_id', sourceVarId);

  await supabaseAdmin
    .from('marketplace_product_links')
    .update({ product_id: targetProductId, updated_at: now })
    .eq('variation_id', sourceVarId);

  await supabaseAdmin
    .from('product_images')
    .update({ product_id: targetProductId })
    .eq('variation_id', sourceVarId);
}
