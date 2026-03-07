import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

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
      .select('id, status, customer_id')
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
      const { confirmed_items } = body;
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

      // Determine final status
      const { data: allItems } = await supabaseAdmin
        .from('replenishment_items')
        .select('id, variation_id, quantity, confirmed_quantity, unit_price, gp_rate')
        .eq('replenishment_id', id);

      const allConfirmed = (allItems || []).every(
        (i: { quantity: number; confirmed_quantity: number }) => i.confirmed_quantity >= i.quantity
      );
      const newStatus = allConfirmed ? 'received' : 'partial_received';

      await supabaseAdmin
        .from('replenishments')
        .update({
          status: newStatus,
          received_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      // === Update consignment warehouse inventory ===
      // Fetch replenishment details
      const { data: replenishment } = await supabaseAdmin
        .from('replenishments')
        .select('customer_id, company_id, replenishment_number')
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
          // Add received items to consignment warehouse inventory
          for (const item of (allItems || []) as {
            variation_id: string | null;
            confirmed_quantity: number;
            quantity: number;
            unit_price: number;
          }[]) {
            if (!item.variation_id) continue;
            const qty = item.confirmed_quantity > 0 ? item.confirmed_quantity : item.quantity;
            if (qty <= 0) continue;

            // Upsert inventory row
            const { data: existing } = await supabaseAdmin
              .from('inventory')
              .select('id, quantity')
              .eq('company_id', replenishment.company_id)
              .eq('warehouse_id', consignWarehouse.id)
              .eq('variation_id', item.variation_id)
              .single();

            if (existing) {
              await supabaseAdmin
                .from('inventory')
                .update({ quantity: existing.quantity + qty, updated_at: new Date().toISOString() })
                .eq('id', existing.id);
            } else {
              await supabaseAdmin
                .from('inventory')
                .insert({
                  company_id: replenishment.company_id,
                  warehouse_id: consignWarehouse.id,
                  variation_id: item.variation_id,
                  quantity: qty,
                  reserved_quantity: 0,
                });
            }

            // Record transaction
            const { data: updated } = await supabaseAdmin
              .from('inventory')
              .select('quantity')
              .eq('company_id', replenishment.company_id)
              .eq('warehouse_id', consignWarehouse.id)
              .eq('variation_id', item.variation_id)
              .single();

            await supabaseAdmin
              .from('inventory_transactions')
              .insert({
                company_id: replenishment.company_id,
                warehouse_id: consignWarehouse.id,
                variation_id: item.variation_id,
                type: 'in',
                quantity: qty,
                balance_after: updated?.quantity ?? qty,
                reference_type: 'replenishment',
                reference_id: id,
                notes: `รับเข้าคลังตัวแทน: ${replenishment.replenishment_number}`,
                created_by: auth.userId,
              });
          }
        }
      }

      return NextResponse.json({ success: true, status: newStatus });
    }

    // === ACTION: CANCEL ===
    if (action === 'cancel') {
      if (existing.status !== 'pending') {
        return NextResponse.json({ error: 'สามารถยกเลิกได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
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
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Replenishment PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
