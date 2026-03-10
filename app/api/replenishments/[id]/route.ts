import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { shipToTransit, receiveFromTransit, unreserveStock, cancelFromShipped, reserveStock, deductStock } from '@/lib/stock-service';

// GET /api/replenishments/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('replenishments')
      .select(`
        *,
        customer:customers(id, name, customer_code, phone, customer_type, consignment_mode, tax_id, tax_company_name, tax_branch, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code, email),
        created_by_profile:user_profiles!replenishments_created_by_fkey(id, name),
        items:replenishment_items(
          id, product_id, variation_id, product_name, variation_label,
          quantity, received_quantity, confirmed_quantity, unit_price, sku,
          brand_id, default_price, discount_price, gp_rate, gp_base_price, gp_level
        )
      `)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .order('sort_order', { referencedTable: 'replenishment_items', ascending: true })
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch product images for items
    const variationIds = (data.items as { variation_id?: string | null }[])
      .map(i => i.variation_id).filter(Boolean) as string[];
    const productIds = (data.items as { product_id?: string | null }[])
      .map(i => i.product_id).filter(Boolean) as string[];

    const imageMap: Record<string, string> = {};
    if (variationIds.length > 0 || productIds.length > 0) {
      const orParts: string[] = [];
      if (variationIds.length > 0) orParts.push(`variation_id.in.(${[...new Set(variationIds)].join(',')})`);
      if (productIds.length > 0) orParts.push(`product_id.in.(${[...new Set(productIds)].join(',')})`);
      const { data: images } = await supabaseAdmin
        .from('product_images')
        .select('product_id, variation_id, image_url')
        .or(orParts.join(','))
        .order('sort_order', { ascending: true });
      for (const img of images || []) {
        if (img.variation_id && !imageMap[`v:${img.variation_id}`]) imageMap[`v:${img.variation_id}`] = img.image_url;
        if (img.product_id && !imageMap[`p:${img.product_id}`]) imageMap[`p:${img.product_id}`] = img.image_url;
      }
    }

    const items = (data.items as {
      id: string; product_id?: string | null; variation_id?: string | null;
      product_name: string; variation_label?: string | null;
      quantity: number; received_quantity: number; confirmed_quantity: number;
      unit_price: number; sku?: string | null;
    }[]).map(item => ({
      ...item,
      image: (item.variation_id ? imageMap[`v:${item.variation_id}`] : null)
        || (item.product_id ? imageMap[`p:${item.product_id}`] : null)
        || null,
    }));

    // Enrich with document data from document tables
    const [taxRes, recRes, dnRes] = await Promise.all([
      supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'replenishment').eq('source_id', id).eq('company_id', auth.companyId)
        .maybeSingle(),
      supabaseAdmin.from('receipts')
        .select('receipt_number, receipt_date')
        .eq('source_type', 'replenishment').eq('source_id', id).eq('company_id', auth.companyId)
        .maybeSingle(),
      supabaseAdmin.from('delivery_notes')
        .select('dn_number, dn_date')
        .eq('source_type', 'replenishment').eq('source_id', id).eq('company_id', auth.companyId)
        .maybeSingle(),
    ]);

    const docType = taxRes.data ? 'tax' : recRes.data ? 'receipt' : null;
    const enriched = {
      ...data,
      items,
      tax_invoice_number: taxRes.data?.invoice_number || recRes.data?.receipt_number || null,
      tax_invoice_date: taxRes.data?.invoice_date || recRes.data?.receipt_date || null,
      tax_invoice_doc_type: docType,
      dn_number: dnRes.data?.dn_number || null,
      dn_date: dnRes.data?.dn_date || null,
    };

    return NextResponse.json({ replenishment: enriched });
  } catch (err) {
    console.error('Replenishment GET [id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/replenishments/[id]
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    // Verify ownership
    const { data: existing } = await supabaseAdmin
      .from('replenishments')
      .select('id, status, customer_id, warehouse_id')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // === ACTION: SHIP ===
    if (action === 'ship') {
      if (existing.status !== 'pending') {
        return NextResponse.json({ error: 'สามารถจัดส่งได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }
      const { shipping_method, shipping_carrier, tracking_number, notes } = body;
      await supabaseAdmin
        .from('replenishments')
        .update({
          status: 'shipped',
          shipping_method: shipping_method || null,
          shipping_carrier: shipping_carrier || null,
          tracking_number: tracking_number || null,
          notes: notes !== undefined ? (notes || null) : undefined,
          shipped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // Deduct stock from source warehouse: quantity -= qty, reserved -= qty, in_transit += qty
      if (existing.warehouse_id) {
        const { data: shipItems } = await supabaseAdmin
          .from('replenishment_items')
          .select('variation_id, quantity')
          .eq('replenishment_id', id);

        const { data: rpForNumber } = await supabaseAdmin
          .from('replenishments')
          .select('replenishment_number')
          .eq('id', id)
          .single();

        for (const item of (shipItems || []) as { variation_id: string | null; quantity: number }[]) {
          if (!item.variation_id) continue;
          const qty = item.quantity || 0;
          if (qty <= 0) continue;

          await shipToTransit({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty,
            referenceType: 'replenishment',
            referenceId: id,
            notes: `จัดส่งสินค้าตัวแทน: ${rpForNumber?.replenishment_number || id}`,
            createdBy: auth.userId,
          });
        }
      }

      // Auto issue document on ship for ALL consignment/credit replenishments
      // - จด VAT: Invoice mode → TAX, DN mode → no doc (DN mode issues TAX at statement payment)
      // - ไม่จด VAT: ALL modes → DN (ใบส่งสินค้า)
      let docResult = null;
      try {
        const { data: customer } = await supabaseAdmin
          .from('customers')
          .select('consignment_mode')
          .eq('id', existing.customer_id)
          .single();

        const { issueReplenishmentInvoice, issueReplenishmentDN } = await import('@/lib/invoice-service');
        const { data: company } = await supabaseAdmin
          .from('companies')
          .select('vat_registered')
          .eq('id', auth.companyId)
          .single();
        const vatRegistered = company?.vat_registered ?? false;

        if (vatRegistered) {
          if (customer?.consignment_mode === 'invoice') {
            // จด VAT + Invoice mode → TAX
            docResult = await issueReplenishmentInvoice(id, auth.companyId);
          } else {
            // จด VAT + DN mode → DN (ใบส่งสินค้า)
            docResult = await issueReplenishmentDN(id, auth.companyId);
          }
        } else {
          // ไม่จด VAT: ALL modes → DN (ใบส่งสินค้า)
          docResult = await issueReplenishmentDN(id, auth.companyId);
        }
      } catch (err) {
        console.error('Auto document on ship error:', err);
      }

      return NextResponse.json({
        success: true,
        status: 'shipped',
        tax_invoice_number: docResult?.invoiceNumber || null,
        doc_type: docResult?.docType || null,
      });
    }

    // === ACTION: CONFIRM (admin confirms after dealer receives) ===
    if (action === 'confirm') {
      if (existing.status !== 'pending_confirm') {
        return NextResponse.json({ error: 'สามารถยืนยันได้เฉพาะสถานะ "รอยืนยัน" เท่านั้น' }, { status: 400 });
      }
      const { confirmed_items, confirm_notes } = body;
      if (!confirmed_items || !Array.isArray(confirmed_items)) {
        return NextResponse.json({ error: 'confirmed_items is required' }, { status: 400 });
      }

      // Update confirmed_quantity per item
      for (const item of confirmed_items as { id: string; confirmed_quantity: number }[]) {
        await supabaseAdmin
          .from('replenishment_items')
          .update({ confirmed_quantity: item.confirmed_quantity })
          .eq('id', item.id)
          .eq('replenishment_id', id);
      }

      // Re-fetch items with updated confirmed_quantity + product info for CN
      const { data: allItems } = await supabaseAdmin
        .from('replenishment_items')
        .select('id, variation_id, quantity, confirmed_quantity, unit_price, gp_rate, product_name, variation_label')
        .eq('replenishment_id', id);

      // Determine final status: exact match = received, any mismatch = partial_received
      const allMatch = (allItems || []).every(
        (i: { quantity: number; confirmed_quantity: number }) => i.confirmed_quantity === i.quantity
      );
      const newStatus = allMatch ? 'received' : 'partial_received';

      // Calculate confirmed_total
      const confirmedTotal = (allItems || []).reduce((sum: number, item: { confirmed_quantity: number; quantity: number; unit_price: number }) => {
        const qty = item.confirmed_quantity != null ? item.confirmed_quantity : item.quantity;
        return sum + qty * (item.unit_price || 0);
      }, 0);

      await supabaseAdmin
        .from('replenishments')
        .update({
          status: newStatus,
          received_at: new Date().toISOString(),
          confirmed_total: confirmedTotal,
          confirm_notes: confirm_notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // === Update consignment warehouse inventory + clear in_transit ===
      const { data: replenishment } = await supabaseAdmin
        .from('replenishments')
        .select('customer_id, company_id, replenishment_number, warehouse_id, total_amount')
        .eq('id', id)
        .single();

      if (replenishment) {
        // Find consignment warehouse for this dealer
        const { data: consignWarehouse } = await supabaseAdmin
          .from('warehouses')
          .select('id')
          .eq('company_id', replenishment.company_id)
          .eq('customer_id', replenishment.customer_id)
          .eq('warehouse_type', 'consignment')
          .single();

        if (consignWarehouse) {
          for (const item of (allItems || []) as {
            id: string; variation_id: string | null;
            confirmed_quantity: number; quantity: number;
          }[]) {
            if (!item.variation_id) continue;
            const confirmed = item.confirmed_quantity > 0 ? item.confirmed_quantity : item.quantity;
            if (confirmed <= 0) continue;

            // Move confirmed qty from source in_transit → destination stock
            await receiveFromTransit({
              supabase: supabaseAdmin,
              companyId: replenishment.company_id,
              sourceWarehouseId: replenishment.warehouse_id || '',
              destWarehouseId: consignWarehouse.id,
              variationId: item.variation_id,
              qty: confirmed,
              referenceType: 'replenishment',
              referenceId: id,
              notes: `รับเข้าคลังตัวแทน: ${replenishment.replenishment_number}`,
              createdBy: auth.userId,
            });

            // Handle stock mismatch
            const delta = item.quantity - confirmed; // positive = ขาด, negative = เกิน
            if (delta > 0) {
              // รับขาด: คืน delta กลับคลังต้นทาง (in_transit -= delta, quantity += delta)
              await cancelFromShipped({
                supabase: supabaseAdmin,
                companyId: replenishment.company_id,
                warehouseId: replenishment.warehouse_id || '',
                variationId: item.variation_id,
                qty: delta,
                referenceType: 'replenishment',
                referenceId: id,
                notes: `คืน stock ขาดส่ง: ${replenishment.replenishment_number} (ส่ง ${item.quantity} รับ ${confirmed})`,
                createdBy: auth.userId,
              });
            } else if (delta < 0) {
              // รับเกิน: หัก stock เพิ่มจากคลังต้นทาง
              const excess = Math.abs(delta);
              await deductStock({
                supabase: supabaseAdmin,
                companyId: replenishment.company_id,
                warehouseId: replenishment.warehouse_id || '',
                variationId: item.variation_id,
                qty: excess,
                referenceType: 'replenishment',
                referenceId: id,
                notes: `หัก stock เกิน: ${replenishment.replenishment_number} (ส่ง ${item.quantity} รับ ${confirmed})`,
                createdBy: auth.userId,
              });
            }
          }
        }

        // === Auto-issue adjustment documents for mismatches ===
        // CN ออกได้เฉพาะ Invoice mode (มี TAX invoice แล้ว) — DN mode ไม่ต้องออก CN แค่แก้ DN ตามจริง
        if (!allMatch) {
          try {
            // Check if TAX invoice exists for this replenishment (= Invoice mode)
            const { data: hasTax } = await supabaseAdmin
              .from('tax_invoices')
              .select('id')
              .eq('source_type', 'replenishment')
              .eq('source_id', id)
              .eq('company_id', auth.companyId)
              .maybeSingle();

            if (hasTax) {
              // Invoice mode: มี TAX แล้ว → ออก CN/excess TAX ได้
              const { issueReplenishmentCreditNote, issueReplenishmentExcessDocument } = await import('@/lib/invoice-service');

              if (confirmedTotal < (replenishment.total_amount || 0)) {
                // รับขาด → Credit Note
                const shortfallItems = (allItems || [])
                  .filter((i: { confirmed_quantity: number; quantity: number }) => i.confirmed_quantity < i.quantity)
                  .map((i: { id: string; variation_id: string | null; product_name: string; variation_label: string | null; quantity: number; confirmed_quantity: number; unit_price: number }) => ({
                    replenishment_item_id: i.id,
                    variation_id: i.variation_id || '',
                    product_name: i.product_name || '',
                    variation_label: i.variation_label || '',
                    shortfall_qty: i.quantity - i.confirmed_quantity,
                    unit_price: i.unit_price || 0,
                  }));
                await issueReplenishmentCreditNote(id, auth.companyId!, shortfallItems, auth.userId || '');
              } else if (confirmedTotal > (replenishment.total_amount || 0)) {
                // รับเกิน → excess TAX
                await issueReplenishmentExcessDocument(id, auth.companyId!, confirmedTotal - (replenishment.total_amount || 0));
              }
            }
            // DN mode: ไม่ต้องออกเอกสารเพิ่ม — DN PDF จะแสดง confirmed_quantity เอง
          } catch (err) {
            console.error('Auto adjustment document on confirm error:', err);
          }
        }
      }

      return NextResponse.json({ success: true, status: newStatus });
    }

    // === ACTION: UPDATE_SHIPPING (edit shipping info for shipped status) ===
    if (action === 'update_shipping') {
      if (existing.status !== 'shipped') {
        return NextResponse.json({ error: 'แก้ไขขนส่งได้เฉพาะสถานะ "จัดส่งแล้ว" เท่านั้น' }, { status: 400 });
      }
      const { shipping_method, shipping_carrier, tracking_number } = body;
      await supabaseAdmin
        .from('replenishments')
        .update({
          shipping_method: shipping_method || null,
          shipping_carrier: shipping_carrier || null,
          tracking_number: tracking_number || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return NextResponse.json({ success: true });
    }

    // === ACTION: CANCEL ===
    if (action === 'cancel') {
      if (existing.status !== 'pending' && existing.status !== 'shipped') {
        return NextResponse.json({ error: 'สามารถยกเลิกได้เฉพาะสถานะ "ที่ต้องจัดส่ง" หรือ "จัดส่งแล้ว" เท่านั้น' }, { status: 400 });
      }

      await supabaseAdmin
        .from('replenishments')
        .update({
          status: 'cancelled',
          shipped_at: null,
          received_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // Reverse stock operations
      if (existing.warehouse_id) {
        const { data: cancelItems } = await supabaseAdmin
          .from('replenishment_items')
          .select('variation_id, quantity')
          .eq('replenishment_id', id);

        const { data: rpForNumber } = await supabaseAdmin
          .from('replenishments')
          .select('replenishment_number')
          .eq('id', id)
          .single();

        for (const item of (cancelItems || []) as { variation_id: string | null; quantity: number }[]) {
          if (!item.variation_id) continue;
          const qty = item.quantity || 0;
          if (qty <= 0) continue;

          if (existing.status === 'pending') {
            await unreserveStock({
              supabase: supabaseAdmin,
              companyId: auth.companyId!,
              warehouseId: existing.warehouse_id,
              variationId: item.variation_id,
              qty,
              referenceType: 'replenishment',
              referenceId: id,
              notes: `ยกเลิกจอง: ${rpForNumber?.replenishment_number || id}`,
              createdBy: auth.userId,
            });
          } else if (existing.status === 'shipped') {
            await cancelFromShipped({
              supabase: supabaseAdmin,
              companyId: auth.companyId!,
              warehouseId: existing.warehouse_id,
              variationId: item.variation_id,
              qty,
              referenceType: 'replenishment',
              referenceId: id,
              notes: `ยกเลิกจัดส่ง (คืนสต๊อก): ${rpForNumber?.replenishment_number || id}`,
              createdBy: auth.userId,
            });
          }
        }
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // === ACTION: UPDATE (general field update for pending status) ===
    if (action === 'update') {
      if (existing.status !== 'pending') {
        return NextResponse.json({ error: 'สามารถแก้ไขได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }
      const { notes, internal_notes, items, customer_id, total_amount } = body;
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (notes !== undefined) updateData.notes = notes || null;
      if (internal_notes !== undefined) updateData.internal_notes = internal_notes || null;
      if (customer_id) updateData.customer_id = customer_id;
      if (total_amount !== undefined) updateData.total_amount = total_amount;

      await supabaseAdmin
        .from('replenishments')
        .update(updateData)
        .eq('id', id);

      // Update items if provided
      if (items && Array.isArray(items)) {
        // Unreserve old items first
        if (existing.warehouse_id) {
          const { data: oldItems } = await supabaseAdmin
            .from('replenishment_items')
            .select('variation_id, quantity')
            .eq('replenishment_id', id);

          for (const oldItem of (oldItems || []) as { variation_id: string | null; quantity: number }[]) {
            if (!oldItem.variation_id) continue;
            const qty = oldItem.quantity || 0;
            if (qty <= 0) continue;

            await unreserveStock({
              supabase: supabaseAdmin,
              companyId: auth.companyId!,
              warehouseId: existing.warehouse_id,
              variationId: oldItem.variation_id,
              qty,
              referenceType: 'replenishment',
              referenceId: id,
              notes: 'ปรับปรุงใบเติมสินค้า (ปล่อยจอง)',
              createdBy: auth.userId,
            });
          }
        }

        // Delete existing and re-insert
        await supabaseAdmin
          .from('replenishment_items')
          .delete()
          .eq('replenishment_id', id);

        const itemRows = items.map((item: any) => ({
          replenishment_id: id,
          product_id: item.product_id || null,
          variation_id: item.variation_id || null,
          product_name: item.product_name,
          variation_label: item.variation_label || null,
          quantity: item.quantity,
          unit_price: item.unit_price || 0,
          brand_id: item.brand_id || null,
          default_price: item.default_price || 0,
          discount_price: item.discount_price || 0,
          gp_rate: item.gp_rate ?? null,
          gp_base_price: item.gp_base_price || null,
          gp_level: item.gp_level ?? null,
          sku: item.sku || null,
        }));

        await supabaseAdmin
          .from('replenishment_items')
          .insert(itemRows);

        // Re-reserve new items
        if (existing.warehouse_id) {
          for (const item of items as { variation_id?: string; quantity: number }[]) {
            if (!item.variation_id) continue;
            const qty = item.quantity || 0;
            if (qty <= 0) continue;

            await reserveStock({
              supabase: supabaseAdmin,
              companyId: auth.companyId!,
              warehouseId: existing.warehouse_id,
              variationId: item.variation_id,
              qty,
              referenceType: 'replenishment',
              referenceId: id,
              notes: 'ปรับปรุงใบเติมสินค้า (จองใหม่)',
              createdBy: auth.userId,
            });
          }
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Replenishment PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
