import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { adjustStock } from '@/lib/stock-service';

interface BulkItem {
  product_id?: string;
  variation_id?: string;
  warehouse_id?: string;
  quantity?: number;
  rowNum?: number;
}

interface ResultRow {
  rowNum: number;
  warehouse_id: string;
  warehouse_name: string;
  product_name: string;
  variation_label: string;
  sku: string;
  action: 'updated' | 'unchanged' | 'error';
  from?: number;
  to?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth.companyRoles, 'inventory.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์อัพเดท stock' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const items: BulkItem[] = Array.isArray(body.items) ? body.items : [];
    const notes: string | null = body.notes || null;
    const dry_run: boolean = !!body.dry_run;

    if (items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีข้อมูลนำเข้า' }, { status: 400 });
    }

    // Collect all warehouse_ids referenced in items
    const requestedWarehouseIds = [...new Set(items.map(i => i.warehouse_id).filter((v): v is string => !!v))];
    if (requestedWarehouseIds.length === 0) {
      return NextResponse.json({ error: 'แต่ละรายการต้องระบุคลัง' }, { status: 400 });
    }

    // Verify warehouses
    const { data: warehouses } = await supabaseAdmin
      .from('warehouses')
      .select('id, name')
      .eq('company_id', auth.companyId)
      .in('id', requestedWarehouseIds)
      .eq('is_active', true);

    const warehouseMap = new Map<string, { id: string; name: string }>();
    for (const w of warehouses || []) warehouseMap.set(w.id, w);

    // Pre-fetch all variations for company
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
    for (const v of variations) byId.set(v.id, v);

    // Pre-fetch current stock for all (variation_id, warehouse_id) referenced
    const { data: invRows } = await supabaseAdmin
      .from('inventory')
      .select('variation_id, warehouse_id, quantity')
      .eq('company_id', auth.companyId)
      .in('warehouse_id', requestedWarehouseIds);
    const stockMap = new Map<string, number>();
    for (const r of invRows || []) {
      stockMap.set(`${r.variation_id}|${r.warehouse_id}`, r.quantity || 0);
    }

    // Resolve each item — read-only validation
    type Resolved = {
      rowNum: number;
      warehouse_id: string;
      warehouse_name: string;
      variation: VariationRow | null;
      quantity: number;
      error?: string;
    };

    const resolved: Resolved[] = items.map((item, idx) => {
      const rowNum = item.rowNum ?? idx + 3; // +3 because: row 1=ID, row 2=header, row 3+=data
      const warehouseId = item.warehouse_id || '';
      const wh = warehouseMap.get(warehouseId);
      const warehouseName = wh?.name || warehouseId || '-';
      const qty = Number(item.quantity);

      if (!warehouseId) {
        return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation: null, quantity: qty, error: 'ไม่มี warehouse_id (ห้ามลบ row หัวคลัง)' };
      }
      if (!wh) {
        return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation: null, quantity: qty, error: 'ไม่พบคลังนี้ในระบบ — ตรวจว่า warehouse_id ไม่ถูกแก้' };
      }
      if (!item.variation_id) {
        return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation: null, quantity: qty, error: 'ไม่มี variation_id (ห้ามลบคอลัมน์ ID)' };
      }
      const variation = byId.get(item.variation_id) || null;
      if (!variation) {
        return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation: null, quantity: qty, error: 'ไม่พบ variation_id นี้ในระบบ — ตรวจว่า ID ไม่ถูกแก้' };
      }
      if (item.product_id && item.product_id !== variation.product_id) {
        return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation, quantity: qty, error: 'product_id ไม่ตรงกับ variation_id' };
      }
      if (!Number.isFinite(qty) || qty < 0) {
        return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation, quantity: qty, error: 'จำนวนไม่ถูกต้อง' };
      }
      return { rowNum, warehouse_id: warehouseId, warehouse_name: warehouseName, variation, quantity: qty };
    });

    const results: ResultRow[] = [];

    if (dry_run) {
      for (const r of resolved) {
        if (r.error || !r.variation) {
          results.push({
            rowNum: r.rowNum,
            warehouse_id: r.warehouse_id,
            warehouse_name: r.warehouse_name,
            product_name: r.variation?.product?.name || '-',
            variation_label: r.variation?.variation_label || '-',
            sku: r.variation?.sku || '-',
            action: 'error',
            error: r.error,
          });
          continue;
        }
        const current = stockMap.get(`${r.variation.id}|${r.warehouse_id}`) || 0;
        const to = r.quantity;
        results.push({
          rowNum: r.rowNum,
          warehouse_id: r.warehouse_id,
          warehouse_name: r.warehouse_name,
          product_name: r.variation.product?.name || '-',
          variation_label: r.variation.variation_label || '-',
          sku: r.variation.sku || '-',
          action: to !== current ? 'updated' : 'unchanged',
          from: current,
          to,
        });
      }

      return NextResponse.json({
        dry_run: true,
        results,
        summary: buildSummary(results),
      });
    }

    // ===== EXECUTE =====
    const touchedVariations = new Set<string>();

    for (const r of resolved) {
      if (r.error || !r.variation) {
        results.push({
          rowNum: r.rowNum,
          warehouse_id: r.warehouse_id,
          warehouse_name: r.warehouse_name,
          product_name: r.variation?.product?.name || '-',
          variation_label: r.variation?.variation_label || '-',
          sku: r.variation?.sku || '-',
          action: 'error',
          error: r.error,
        });
        continue;
      }

      try {
        const current = stockMap.get(`${r.variation.id}|${r.warehouse_id}`) || 0;

        if (r.quantity === current) {
          results.push({
            rowNum: r.rowNum,
            warehouse_id: r.warehouse_id,
            warehouse_name: r.warehouse_name,
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
          warehouseId: r.warehouse_id,
          variationId: r.variation.id,
          newQuantity: r.quantity,
          referenceType: 'manual',
          referenceId: '',
          notes: notes || `Bulk adjust เป็น ${r.quantity}`,
          createdBy: auth.userId,
        });
        results.push({
          rowNum: r.rowNum,
          warehouse_id: r.warehouse_id,
          warehouse_name: r.warehouse_name,
          product_name: r.variation.product?.name || '-',
          variation_label: r.variation.variation_label || '-',
          sku: r.variation.sku || '-',
          action: 'updated',
          from: current,
          to: result.balanceAfter,
        });
        touchedVariations.add(r.variation.id);
      } catch (err) {
        console.error('Bulk item error:', err);
        results.push({
          rowNum: r.rowNum,
          warehouse_id: r.warehouse_id,
          warehouse_name: r.warehouse_name,
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

    return NextResponse.json({
      dry_run: false,
      results,
      summary: buildSummary(results),
    });
  } catch (error) {
    console.error('Bulk stock update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildSummary(results: ResultRow[]) {
  return {
    total: results.length,
    updated: results.filter(r => r.action === 'updated').length,
    unchanged: results.filter(r => r.action === 'unchanged').length,
    errors: results.filter(r => r.action === 'error').length,
  };
}
