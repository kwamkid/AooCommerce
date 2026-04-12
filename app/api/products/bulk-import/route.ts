import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';

interface ImportItem {
  product_id?: string;
  variation_id?: string;
  code: string;
  name: string;
  product_type: 'simple' | 'variation';
  variation_label: string;
  sku?: string;
  barcode?: string;
  default_price: number;
  discount_price: number;
}

interface ImportResult {
  code: string;
  name: string;
  action: 'created' | 'updated' | 'error';
  error?: string;
  product_id?: string;
  price_changed?: boolean;
  variation_ids_changed?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { items } = (await request.json()) as { items: ImportItem[] };
    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items to import' }, { status: 400 });
    }

    const results: ImportResult[] = [];
    const variationIdsWithPriceChange: string[] = [];

    // Group items by product (code or product_id)
    const grouped = new Map<string, ImportItem[]>();
    for (const item of items) {
      const key = item.product_id || `new:${item.code}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(item);
    }

    const now = new Date().toISOString();

    for (const [key, rows] of grouped) {
      const first = rows[0];
      const isUpdate = !!first.product_id;

      try {
        if (isUpdate) {
          // UPDATE existing product
          const productId = first.product_id!;

          // Verify ownership
          const { data: existing } = await supabaseAdmin
            .from('products')
            .select('id, name, code')
            .eq('id', productId)
            .eq('company_id', auth.companyId)
            .single();

          if (!existing) {
            results.push({ code: first.code, name: first.name, action: 'error', error: 'สินค้าไม่พบในระบบ' });
            continue;
          }

          // Update product name/code if changed
          const productUpdates: Record<string, unknown> = { updated_at: now };
          if (first.name && first.name !== existing.name) productUpdates.name = first.name;
          if (first.code && first.code !== existing.code) productUpdates.code = first.code;

          if (Object.keys(productUpdates).length > 1) {
            await supabaseAdmin
              .from('products')
              .update(productUpdates)
              .eq('id', productId)
              .eq('company_id', auth.companyId);
          }

          // Update each variation
          const changedVarIds: string[] = [];
          let priceChanged = false;

          for (const row of rows) {
            if (!row.variation_id) continue;

            const { data: existingVar } = await supabaseAdmin
              .from('product_variations')
              .select('id, default_price, discount_price, sku, barcode, variation_label')
              .eq('id', row.variation_id)
              .eq('company_id', auth.companyId)
              .single();

            if (!existingVar) continue;

            const varUpdates: Record<string, unknown> = { updated_at: now };
            if (row.variation_label && row.variation_label !== '-' && row.variation_label !== existingVar.variation_label) {
              varUpdates.variation_label = row.variation_label;
            }
            if (row.sku !== undefined && row.sku !== (existingVar.sku || '')) {
              varUpdates.sku = row.sku || null;
            }
            if (row.barcode !== undefined && row.barcode !== (existingVar.barcode || '')) {
              varUpdates.barcode = row.barcode || null;
            }
            if (row.default_price !== undefined && row.default_price !== existingVar.default_price) {
              varUpdates.default_price = row.default_price;
              priceChanged = true;
            }
            if (row.discount_price !== undefined && row.discount_price !== existingVar.discount_price) {
              varUpdates.discount_price = row.discount_price;
              priceChanged = true;
            }

            if (Object.keys(varUpdates).length > 1) {
              await supabaseAdmin
                .from('product_variations')
                .update(varUpdates)
                .eq('id', row.variation_id)
                .eq('company_id', auth.companyId);
              changedVarIds.push(row.variation_id);
            }
          }

          if (priceChanged) {
            variationIdsWithPriceChange.push(...changedVarIds);
          }

          results.push({
            code: first.code,
            name: first.name,
            action: 'updated',
            product_id: productId,
            price_changed: priceChanged,
            variation_ids_changed: changedVarIds,
          });
        } else {
          // CREATE new product
          // Check code duplication
          const { data: existingCode } = await supabaseAdmin
            .from('products')
            .select('id')
            .eq('company_id', auth.companyId)
            .eq('code', first.code)
            .single();

          if (existingCode) {
            results.push({ code: first.code, name: first.name, action: 'error', error: 'รหัสสินค้าซ้ำ' });
            continue;
          }

          const isSimple = rows.length === 1;
          const productInsert: Record<string, unknown> = {
            company_id: auth.companyId,
            code: first.code,
            name: first.name,
            variation_label: isSimple ? (first.variation_label || '-') : null,
            is_active: true,
            created_by: auth.userId,
            created_at: now,
            updated_at: now,
          };

          const { data: newProduct, error: productError } = await supabaseAdmin
            .from('products')
            .insert(productInsert)
            .select()
            .single();

          if (productError || !newProduct) {
            results.push({ code: first.code, name: first.name, action: 'error', error: productError?.message || 'สร้างสินค้าไม่สำเร็จ' });
            continue;
          }

          const variationsToInsert = rows.map(row => ({
            company_id: auth.companyId,
            product_id: newProduct.id,
            variation_label: row.variation_label || '-',
            sku: row.sku || null,
            barcode: row.barcode || null,
            default_price: row.default_price || 0,
            discount_price: row.discount_price || 0,
            cost_price: 0,
            stock: 0,
            min_stock: 0,
            is_active: true,
            created_at: now,
            updated_at: now,
          }));

          const { error: varError } = await supabaseAdmin
            .from('product_variations')
            .insert(variationsToInsert);

          if (varError) {
            await supabaseAdmin.from('products').delete().eq('id', newProduct.id);
            results.push({ code: first.code, name: first.name, action: 'error', error: 'สร้าง variation ไม่สำเร็จ: ' + varError.message });
            continue;
          }

          results.push({ code: first.code, name: first.name, action: 'created', product_id: newProduct.id });
        }
      } catch (err) {
        results.push({
          code: first.code,
          name: first.name,
          action: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Trigger marketplace sync for changed prices (fire-and-forget)
    if (variationIdsWithPriceChange.length > 0) {
      triggerMarketplaceSync(variationIdsWithPriceChange).catch(() => {});
    }

    const created = results.filter(r => r.action === 'created').length;
    const updated = results.filter(r => r.action === 'updated').length;
    const errors = results.filter(r => r.action === 'error').length;

    return NextResponse.json({
      results,
      summary: { total: results.length, created, updated, errors },
    });
  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function triggerMarketplaceSync(variationIds: string[]) {
  // Collect unique product IDs for price sync
  const { data: links } = await supabaseAdmin
    .from('marketplace_product_links')
    .select('product_id, account_id, platform')
    .in('variation_id', variationIds)
    .eq('sync_enabled', true);

  if (!links || links.length === 0) return;

  const seenProducts = new Set<string>();
  for (const link of links) {
    const key = `${link.product_id}:${link.account_id}`;
    if (seenProducts.has(key)) continue;
    seenProducts.add(key);

    if (link.platform === 'shopee') {
      import('@/lib/shopee/auto-sync').then(m => {
        m.triggerShopeePriceSync(link.product_id);
      }).catch(() => {});
    }
  }
}
