import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { shipToTransit, receiveFromTransit, cancelFromShipped, deductStock, unreserveStock, reserveStock } from '@/lib/stock-service';

// GET /api/department-orders/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('department_orders')
      .select(`
        *,
        customer:customers(id, name, customer_code, phone, customer_type, tax_id, tax_company_name, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code),
        created_by_profile:user_profiles!department_orders_created_by_fkey(id, name),
        items:department_order_items(
          id, product_id, variation_id, product_name, variation_label,
          quantity, unit_price, received_quantity, confirmed_quantity, sort_order
        )
      `)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .order('sort_order', { referencedTable: 'department_order_items', ascending: true })
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Fetch product images
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

    // Fetch SKU/barcode from product_variations
    const skuMap: Record<string, { sku: string | null; barcode: string | null }> = {};
    if (variationIds.length > 0) {
      const { data: variations } = await supabaseAdmin
        .from('product_variations')
        .select('id, sku, barcode')
        .in('id', [...new Set(variationIds)]);
      for (const v of variations || []) {
        skuMap[v.id] = { sku: v.sku || null, barcode: v.barcode || null };
      }
    }

    const items = (data.items as {
      id: string; product_id?: string | null; variation_id?: string | null;
      product_name: string; variation_label?: string | null;
      quantity: number; unit_price: number;
      received_quantity?: number | null; confirmed_quantity?: number | null;
      sort_order?: number;
    }[]).map(item => ({
      ...item,
      image: (item.variation_id ? imageMap[`v:${item.variation_id}`] : null)
        || (item.product_id ? imageMap[`p:${item.product_id}`] : null)
        || null,
      sku: item.variation_id ? skuMap[item.variation_id]?.sku || null : null,
      barcode: item.variation_id ? skuMap[item.variation_id]?.barcode || null : null,
    }));

    // Fetch related documents
    const [taxRes, dnRes] = await Promise.all([
      supabaseAdmin.from('tax_invoices')
        .select('invoice_number, invoice_date')
        .eq('source_type', 'department_order').eq('source_id', id).eq('company_id', auth.companyId)
        .maybeSingle(),
      supabaseAdmin.from('delivery_notes')
        .select('dn_number, dn_date')
        .eq('source_type', 'department_order').eq('source_id', id).eq('company_id', auth.companyId)
        .maybeSingle(),
    ]);

    return NextResponse.json({
      order: {
        ...data,
        items,
        tax_invoice_number: data.tax_invoice_number || taxRes.data?.invoice_number || null,
        tax_invoice_date: data.tax_invoice_date || taxRes.data?.invoice_date || null,
        dn_number: dnRes.data?.dn_number || null,
        dn_date: dnRes.data?.dn_date || null,
      },
    });
  } catch (err) {
    console.error('Department order GET [id] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/department-orders/[id]
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
      .from('department_orders')
      .select('id, status, customer_id, warehouse_id, department_order_number, company_id, total_amount')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // === ACTION: SHIP ===
    if (action === 'ship') {
      if (existing.status !== 'draft') {
        return NextResponse.json({ error: 'สามารถจัดส่งได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }
      const { shipping_method, shipping_carrier, tracking_number, notes } = body;
      await supabaseAdmin
        .from('department_orders')
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

      // Ship stock: reserved → in_transit
      if (existing.warehouse_id) {
        const { data: shipItems } = await supabaseAdmin
          .from('department_order_items')
          .select('variation_id, quantity')
          .eq('department_order_id', id);

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
            referenceType: 'department_order',
            referenceId: id,
            notes: `จัดส่งสินค้าห้าง: ${existing.department_order_number}`,
            createdBy: auth.userId,
          });
        }
      }

      // Auto issue DN (ใบส่งสินค้า) on ship
      let dnNumber: string | null = null;
      let taxNumber: string | null = null;
      try {
        const { issueOrderDN } = await import('@/lib/invoice-service');
        const docResult = await issueOrderDN(id, auth.companyId!, 'department_order');
        dnNumber = docResult?.invoiceNumber || null;
      } catch (err) {
        console.error('Auto DN on ship error:', err);
      }

      // Auto issue TAX (tax_only) — ใบกำกับภาษี เต็มจำนวนที่ส่ง
      try {
        const { data: company } = await supabaseAdmin
          .from('companies').select('vat_registered').eq('id', auth.companyId).single();

        if (company?.vat_registered) {
          const { insertTaxInvoice } = await import('@/lib/invoice-service');
          const { data: taxNum } = await supabaseAdmin.rpc('generate_tax_invoice_number', { p_company_id: auth.companyId });
          if (taxNum) {
            const now = new Date().toISOString().split('T')[0];
            // Fetch customer tax info
            const { data: custInfo } = await supabaseAdmin
              .from('customers')
              .select('name, tax_company_name, tax_id, tax_branch, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code')
              .eq('id', existing.customer_id)
              .single();
            const custAddress = custInfo ? [custInfo.billing_address, custInfo.billing_district, custInfo.billing_amphoe, custInfo.billing_province, custInfo.billing_postal_code].filter(Boolean).join(' ') : null;

            await insertTaxInvoice({
              company_id: auth.companyId!,
              invoice_number: taxNum,
              invoice_date: now,
              source_type: 'department_order',
              source_id: id,
              customer_id: existing.customer_id,
              customer_name: custInfo?.tax_company_name || custInfo?.name || null,
              customer_tax_id: custInfo?.tax_id || null,
              customer_branch: custInfo?.tax_branch || 'สำนักงานใหญ่',
              customer_address: custAddress,
              total_amount: existing.total_amount ?? 0,
              is_receipt: false,
              document_subtype: 'tax_only',
            });
            taxNumber = taxNum;

            // Update order with tax invoice info
            await supabaseAdmin.from('department_orders').update({
              tax_invoice_number: taxNum,
              tax_invoice_date: now,
            }).eq('id', id);
          }
        }
      } catch (err) {
        console.error('Auto TAX on ship error:', err);
      }

      return NextResponse.json({
        success: true,
        status: 'shipped',
        dn_number: dnNumber,
        tax_invoice_number: taxNumber,
      });
    }

    // === ACTION: CONFIRM (admin confirms after receiver receives) ===
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
          .from('department_order_items')
          .update({ confirmed_quantity: item.confirmed_quantity })
          .eq('id', item.id)
          .eq('department_order_id', id);
      }

      // Re-fetch items
      const { data: allItems } = await supabaseAdmin
        .from('department_order_items')
        .select('id, variation_id, quantity, confirmed_quantity, unit_price')
        .eq('department_order_id', id);

      // Determine final status
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
        .from('department_orders')
        .update({
          status: newStatus,
          received_at: new Date().toISOString(),
          confirmed_total: confirmedTotal,
          internal_notes: confirm_notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // Update consignment warehouse inventory + clear in_transit
      const { data: consignWarehouse } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('company_id', existing.company_id)
        .eq('customer_id', existing.customer_id)
        .eq('warehouse_type', 'consignment')
        .single();

      if (consignWarehouse && existing.warehouse_id) {
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
            companyId: existing.company_id,
            sourceWarehouseId: existing.warehouse_id,
            destWarehouseId: consignWarehouse.id,
            variationId: item.variation_id,
            qty: confirmed,
            referenceType: 'department_order',
            referenceId: id,
            notes: `รับเข้าคลังห้าง: ${existing.department_order_number}`,
            createdBy: auth.userId,
          });

          // Handle stock mismatch
          const delta = item.quantity - confirmed;
          if (delta > 0) {
            // รับขาด: คืน delta กลับคลังต้นทาง
            await cancelFromShipped({
              supabase: supabaseAdmin,
              companyId: existing.company_id,
              warehouseId: existing.warehouse_id,
              variationId: item.variation_id,
              qty: delta,
              referenceType: 'department_order',
              referenceId: id,
              notes: `คืน stock ขาดส่ง: ${existing.department_order_number} (ส่ง ${item.quantity} รับ ${confirmed})`,
              createdBy: auth.userId,
            });
          } else if (delta < 0) {
            // รับเกิน: หัก stock เพิ่มจากคลังต้นทาง
            const excess = Math.abs(delta);
            await deductStock({
              supabase: supabaseAdmin,
              companyId: existing.company_id,
              warehouseId: existing.warehouse_id,
              variationId: item.variation_id,
              qty: excess,
              referenceType: 'department_order',
              referenceId: id,
              notes: `หัก stock เกิน: ${existing.department_order_number} (ส่ง ${item.quantity} รับ ${confirmed})`,
              createdBy: auth.userId,
            });
          }
        }
      }

      // Void old TAX + issue new TAX with confirmed total (if amount changed)
      let newTaxNumber: string | null = null;
      if (!allMatch && confirmedTotal !== (existing.total_amount ?? 0)) {
        try {
          const now = new Date().toISOString();

          // 1. Void old TAX
          await supabaseAdmin.from('tax_invoices')
            .update({ voided_at: now, voided_reason: `ยืนยันรับไม่ครบ: ${existing.department_order_number}` })
            .eq('source_type', 'department_order').eq('source_id', id)
            .is('voided_at', null);

          // 2. Issue new TAX with confirmed total
          const { data: company } = await supabaseAdmin
            .from('companies').select('vat_registered').eq('id', auth.companyId).single();

          if (company?.vat_registered) {
            const { insertTaxInvoice } = await import('@/lib/invoice-service');
            const { data: taxNum } = await supabaseAdmin.rpc('generate_tax_invoice_number', { p_company_id: auth.companyId });
            if (taxNum) {
              const todayStr = now.split('T')[0];
              const { data: custInfo } = await supabaseAdmin
                .from('customers')
                .select('name, tax_company_name, tax_id, tax_branch, billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code')
                .eq('id', existing.customer_id).single();
              const custAddress = custInfo
                ? [custInfo.billing_address, custInfo.billing_district, custInfo.billing_amphoe, custInfo.billing_province, custInfo.billing_postal_code].filter(Boolean).join(' ')
                : null;

              await insertTaxInvoice({
                company_id: auth.companyId!,
                invoice_number: taxNum,
                invoice_date: todayStr,
                source_type: 'department_order',
                source_id: id,
                customer_id: existing.customer_id,
                customer_name: custInfo?.tax_company_name || custInfo?.name || null,
                customer_tax_id: custInfo?.tax_id || null,
                customer_branch: custInfo?.tax_branch || 'สำนักงานใหญ่',
                customer_address: custAddress,
                total_amount: confirmedTotal,
                is_receipt: false,
                document_subtype: 'tax_only',
              });
              newTaxNumber = taxNum;

              // Update order with new tax number
              await supabaseAdmin.from('department_orders').update({
                tax_invoice_number: taxNum,
                tax_invoice_date: todayStr,
              }).eq('id', id);
            }
          }
        } catch (err) {
          console.error('Re-issue TAX on confirm error:', err);
        }
      }

      return NextResponse.json({ success: true, status: newStatus, new_tax_number: newTaxNumber });
    }

    // === ACTION: UPDATE_SHIPPING ===
    if (action === 'update_shipping') {
      if (existing.status !== 'shipped') {
        return NextResponse.json({ error: 'แก้ไขขนส่งได้เฉพาะสถานะ "กำลังส่ง" เท่านั้น' }, { status: 400 });
      }
      const { shipping_method, shipping_carrier, tracking_number } = body;
      await supabaseAdmin
        .from('department_orders')
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
      if (!['draft'].includes(existing.status)) {
        return NextResponse.json({ error: 'ยกเลิกได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }

      await supabaseAdmin
        .from('department_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id);

      // Unreserve stock
      if (existing.warehouse_id) {
        const { data: cancelItems } = await supabaseAdmin
          .from('department_order_items')
          .select('variation_id, quantity')
          .eq('department_order_id', id);

        for (const item of (cancelItems || []) as { variation_id: string | null; quantity: number }[]) {
          if (!item.variation_id) continue;
          const qty = item.quantity || 0;
          if (qty <= 0) continue;

          await unreserveStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty,
            referenceType: 'department_order',
            referenceId: id,
            notes: `ยกเลิกใบส่งห้าง: ${existing.department_order_number}`,
            createdBy: auth.userId,
          });
        }
      }

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // === ACTION: VOID (shipped → draft, void TAX+DN, return stock) ===
    if (action === 'void') {
      if (existing.status !== 'shipped') {
        return NextResponse.json({ error: 'สามารถ void ได้เฉพาะสถานะ "กำลังส่ง" เท่านั้น' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const voidReason = 'ยกเลิกใบส่งห้าง (void)';

      // 1. Return stock: in_transit → quantity, then re-reserve
      if (existing.warehouse_id) {
        const { data: voidItems } = await supabaseAdmin
          .from('department_order_items')
          .select('variation_id, quantity')
          .eq('department_order_id', id);

        for (const item of (voidItems || []) as { variation_id: string | null; quantity: number }[]) {
          if (!item.variation_id || item.quantity <= 0) continue;

          // cancelFromShipped: in_transit -= qty, quantity += qty
          await cancelFromShipped({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty: item.quantity,
            referenceType: 'department_order',
            referenceId: id,
            notes: `Void ใบส่งห้าง: ${existing.department_order_number}`,
            createdBy: auth.userId,
          });

          // Re-reserve stock (back to draft state)
          await reserveStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty: item.quantity,
            referenceType: 'department_order',
            referenceId: id,
            notes: `จอง stock คืนจาก void: ${existing.department_order_number}`,
            createdBy: auth.userId,
          });
        }
      }

      // 2. Void TAX invoices
      await supabaseAdmin.from('tax_invoices')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'department_order').eq('source_id', id)
        .is('voided_at', null);

      // 3. Void delivery notes
      await supabaseAdmin.from('delivery_notes')
        .update({ voided_at: now, voided_reason: voidReason })
        .eq('source_type', 'department_order').eq('source_id', id)
        .is('voided_at', null);

      // 4. Reset order → draft
      await supabaseAdmin.from('department_orders')
        .update({
          status: 'draft',
          shipping_method: null,
          shipping_carrier: null,
          tracking_number: null,
          shipped_at: null,
          tax_invoice_number: null,
          tax_invoice_date: null,
          printed_packing_at: null,
          printed_label_at: null,
          printed_dn_at: null,
          updated_at: now,
        })
        .eq('id', id);

      return NextResponse.json({ success: true, status: 'draft' });
    }

    // === ACTION: MARK_PRINTED ===
    if (action === 'mark_printed') {
      const { doc_type } = body;
      const colMap: Record<string, string> = {
        packing: 'printed_packing_at',
        label: 'printed_label_at',
        dn: 'printed_dn_at',
      };
      const col = colMap[doc_type];
      if (!col) return NextResponse.json({ error: 'Invalid doc_type' }, { status: 400 });

      await supabaseAdmin
        .from('department_orders')
        .update({ [col]: new Date().toISOString() })
        .eq('id', id);

      return NextResponse.json({ success: true });
    }

    // === GENERIC UPDATE (for notes, etc.) ===
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.internal_notes !== undefined) updateData.internal_notes = body.internal_notes || null;

    const { error } = await supabaseAdmin
      .from('department_orders')
      .update(updateData)
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Department order PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
