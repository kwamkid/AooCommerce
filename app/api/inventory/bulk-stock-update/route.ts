import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { addStock, adjustStock, updateWeightedAverageCost } from '@/lib/stock-service';

type Mode = 'receive' | 'adjust';

interface BulkItem {
  product_id?: string;
  variation_id?: string;
  sku?: string;
  barcode?: string;
  name?: string;
  quantity?: number;
  unit_cost?: number;
  rowNum?: number;
}

interface ResultRow {
  rowNum: number;
  product_name: string;
  variation_label: string;
  sku: string;
  action: 'updated' | 'unchanged' | 'error';
  from?: number;
  to?: number;
  unit_cost?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner', 'admin', 'warehouse'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อัพเดท stock' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const mode: Mode = body.mode;
    const warehouse_id: string = body.warehouse_id;
    const items: BulkItem[] = Array.isArray(body.items) ? body.items : [];
    const notes: string | null = body.notes || null;
    const dry_run: boolean = !!body.dry_run;

    if (mode !== 'receive' && mode !== 'adjust') {
      return NextResponse.json({ error: 'mode ต้องเป็น receive หรือ adjust' }, { status: 400 });
    }
    if (!warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังสินค้า' }, { status: 400 });
    }
    if (items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อมูลนำเข้า' }, { status: 400 });
    }

    // Verify warehouse
    const { data: warehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id, name')
      .eq('id', warehouse_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (!warehouse) {
      return NextResponse.json({ error: 'ไม่พบคลังสินค้า' }, { status: 404 });
    }

    // Pre-fetch all variations for company — index by id, sku, barcode
    const { data: allVariations } = await supabaseAdmin
      .from('product_variations')
      .select('id, product_id, variation_label, sku, barcode, product:products(id, name, company_id)')
      .eq('company_id', auth.companyId);

    type VariationRow = {
      id: string;
      product_id: string;
      variation_label: string | null;
      sku: string | null;
      barcode: string | null;
      product: { id: string; name: string; company_id: string } | null;
    };

    const variations = (allVariations || []) as unknown as VariationRow[];
    const byId = new Map<string, VariationRow>();
    const bySku = new Map<string, VariationRow>();
    const byBarcode = new Map<string, VariationRow>();
    for (const v of variations) {
      byId.set(v.id, v);
      if (v.sku) bySku.set(v.sku.trim(), v);
      if (v.barcode) byBarcode.set(v.barcode.trim(), v);
    }

    // Pre-fetch current stock in this warehouse
    const { data: invRows } = await supabaseAdmin
      .from('inventory')
      .select('variation_id, quantity')
      .eq('company_id', auth.companyId)
      .eq('warehouse_id', warehouse_id);
    const stockMap = new Map<string, number>();
    for (const r of (invRows || [])) stockMap.set(r.variation_id, r.quantity || 0);

    // Resolve each item to a variation row (read-only)
    type Resolved = {
      rowNum: number;
      variation: VariationRow | null;
      quantity: number;
      unit_cost: number;
      error?: string;
    };
    const resolved: Resolved[] = items.map((item, idx) => {
      const rowNum = item.rowNum ?? idx + 2;
      let variation: VariationRow | null = null;

      // บังคับใช้ variation_id เท่านั้น — ไม่ยอมรับ SKU/Barcode fallback
      // เพราะหน้านี้ไม่สร้างสินค้าใหม่ และ ID ที่ถูกต้องคือ match เดียวที่แน่นอน
      if (item.variation_id && byId.has(item.variation_id)) {
        variation = byId.get(item.variation_id)!;
      }

      const qty = Number(item.quantity);
      const uc = Number(item.unit_cost) || 0;

      if (!item.variation_id) {
        return { rowNum, variation: null, quantity: qty, unit_cost: uc, error: 'ไม่มี variation_id (ห้ามลบคอลัมน์ ID)' };
      }
      if (!variation) {
        return { rowNum, variation: null, quantity: qty, unit_cost: uc, error: 'ไม่พบ variation_id นี้ในระบบ — ตรวจว่า ID ไม่ถูกแก้' };
      }
      if (item.product_id && item.product_id !== variation.product_id) {
        return { rowNum, variation, quantity: qty, unit_cost: uc, error: 'product_id ไม่ตรงกับ variation_id' };
      }
      if (!Number.isFinite(qty) || qty < 0) {
        return { rowNum, variation, quantity: qty, unit_cost: uc, error: 'จำนวนไม่ถูกต้อง' };
      }
      if (mode === 'receive' && qty === 0) {
        return { rowNum, variation, quantity: qty, unit_cost: uc, error: 'receive: จำนวนต้องมากกว่า 0' };
      }
      return { rowNum, variation, quantity: qty, unit_cost: uc };
    });

    // Build result preview (dry_run) or execute
    const results: ResultRow[] = [];

    if (dry_run) {
      for (const r of resolved) {
        if (r.error || !r.variation) {
          results.push({
            rowNum: r.rowNum,
            product_name: r.variation?.product?.name || '-',
            variation_label: r.variation?.variation_label || '-',
            sku: r.variation?.sku || '-',
            action: 'error',
            error: r.error,
          });
          continue;
        }
        const current = stockMap.get(r.variation.id) || 0;
        const to = mode === 'receive' ? current + r.quantity : r.quantity;
        const changed = to !== current || (mode === 'receive' && r.unit_cost > 0);
        results.push({
          rowNum: r.rowNum,
          product_name: r.variation.product?.name || '-',
          variation_label: r.variation.variation_label || '-',
          sku: r.variation.sku || '-',
          action: changed ? 'updated' : 'unchanged',
          from: current,
          to,
          unit_cost: mode === 'receive' ? r.unit_cost : undefined,
        });
      }

      const summary = {
        total: results.length,
        updated: results.filter(r => r.action === 'updated').length,
        unchanged: results.filter(r => r.action === 'unchanged').length,
        errors: results.filter(r => r.action === 'error').length,
      };
      return NextResponse.json({ dry_run: true, mode, results, summary });
    }

    // ===== EXECUTE =====

    let receiveHeaderId: string | null = null;
    let receiveNumber: string | null = null;
    if (mode === 'receive') {
      const { data: rvNum } = await supabaseAdmin.rpc('generate_receive_number', { p_company_id: auth.companyId });
      receiveNumber = rvNum || `RV-${Date.now()}`;
      const { data: receive, error: headerErr } = await supabaseAdmin
        .from('inventory_receives')
        .insert({
          company_id: auth.companyId,
          receive_number: receiveNumber,
          warehouse_id,
          notes: notes || 'Bulk receive จากการนำเข้าไฟล์',
          created_by: auth.userId,
        })
        .select('id, receive_number')
        .single();
      if (headerErr || !receive) {
        console.error('Create receive header error:', headerErr);
        return NextResponse.json({ error: 'ไม่สามารถสร้างใบรับเข้าได้' }, { status: 500 });
      }
      receiveHeaderId = receive.id;
      receiveNumber = receive.receive_number;
    }

    const touchedVariations = new Set<string>();

    for (const r of resolved) {
      if (r.error || !r.variation) {
        results.push({
          rowNum: r.rowNum,
          product_name: r.variation?.product?.name || '-',
          variation_label: r.variation?.variation_label || '-',
          sku: r.variation?.sku || '-',
          action: 'error',
          error: r.error,
        });
        continue;
      }

      try {
        const current = stockMap.get(r.variation.id) || 0;

        if (mode === 'receive') {
          // Insert receive item
          if (receiveHeaderId) {
            const itemInsert: Record<string, unknown> = {
              receive_id: receiveHeaderId,
              variation_id: r.variation.id,
              quantity: r.quantity,
            };
            if (r.unit_cost > 0) itemInsert.unit_cost = r.unit_cost;
            await supabaseAdmin.from('inventory_receive_items').insert(itemInsert);
          }

          const result = await addStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId,
            warehouseId: warehouse_id,
            variationId: r.variation.id,
            qty: r.quantity,
            referenceType: 'receive',
            referenceId: receiveHeaderId || '',
            notes: notes || `Bulk receive ${receiveNumber}`,
            createdBy: auth.userId,
            unitCost: r.unit_cost > 0 ? r.unit_cost : undefined,
          });

          if (r.unit_cost > 0) {
            await updateWeightedAverageCost(supabaseAdmin, auth.companyId, r.variation.id, r.quantity, r.unit_cost);
          }

          results.push({
            rowNum: r.rowNum,
            product_name: r.variation.product?.name || '-',
            variation_label: r.variation.variation_label || '-',
            sku: r.variation.sku || '-',
            action: 'updated',
            from: current,
            to: result.balanceAfter,
            unit_cost: r.unit_cost > 0 ? r.unit_cost : undefined,
          });
        } else {
          // adjust
          if (r.quantity === current) {
            results.push({
              rowNum: r.rowNum,
              product_name: r.variation.product?.name || '-',
              variation_label: r.variation.variation_label || '-',
              sku: r.variation.sku || '-',
              action: 'unchanged',
              from: current,
              to: r.quantity,
            });
            continue;
          }
          const result = await adjustStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId,
            warehouseId: warehouse_id,
            variationId: r.variation.id,
            newQuantity: r.quantity,
            referenceType: 'manual',
            referenceId: '',
            notes: notes || `Bulk adjust เป็น ${r.quantity}`,
            createdBy: auth.userId,
          });
          results.push({
            rowNum: r.rowNum,
            product_name: r.variation.product?.name || '-',
            variation_label: r.variation.variation_label || '-',
            sku: r.variation.sku || '-',
            action: 'updated',
            from: current,
            to: result.balanceAfter,
          });
        }
        touchedVariations.add(r.variation.id);
      } catch (err) {
        console.error('Bulk item error:', err);
        results.push({
          rowNum: r.rowNum,
          product_name: r.variation.product?.name || '-',
          variation_label: r.variation.variation_label || '-',
          sku: r.variation.sku || '-',
          action: 'error',
          error: err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ',
        });
      }
    }

    // Trigger Shopee stock auto-sync for touched variations
    if (touchedVariations.size > 0) {
      try {
        const { triggerShopeeStockSync } = await import('@/lib/shopee/auto-sync');
        triggerShopeeStockSync(Array.from(touchedVariations));
      } catch (err) {
        console.error('Shopee sync trigger error:', err);
      }
    }

    const summary = {
      total: results.length,
      updated: results.filter(r => r.action === 'updated').length,
      unchanged: results.filter(r => r.action === 'unchanged').length,
      errors: results.filter(r => r.action === 'error').length,
    };

    return NextResponse.json({
      dry_run: false,
      mode,
      receive_id: receiveHeaderId,
      receive_number: receiveNumber,
      results,
      summary,
    });
  } catch (error) {
    console.error('Bulk stock update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
