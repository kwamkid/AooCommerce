import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { shipToTransit, receiveFromTransit, cancelFromShipped, deductStock, addStock, unreserveStock, reserveStock } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';
import { getConsignmentDestinationWarehouse } from '@/lib/consignment-warehouse';

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
      .select('id, status, customer_id, warehouse_id, counter_id, department_order_number, company_id, total_amount')
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
      /**
       * ปิดสถานะแบบมีเงื่อนไข = ล็อกกันกดซ้ำ — กดรัว ๆ สองครั้ง ทั้งสองคำขออ่านสถานะเดิม
       * ทันเหมือนกันแล้วขยับสต็อกคนละรอบ ให้ DB ตัดสินว่าใครได้ไปต่อ
       */
      const { data: locked } = await supabaseAdmin
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
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูกจัดส่งไปแล้ว' }, { status: 409 });
      }

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

      // ไม่กระจายขึ้นร้านตอนส่ง: shipToTransit ลด quantity และ reserved เท่ากัน
      // → ยอดพร้อมขายเท่าเดิม (ของถูกกันไว้ตั้งแต่ตอนสร้างใบส่งแล้ว)

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

      for (const item of confirmed_items as { id: string; confirmed_quantity: number }[]) {
        if (typeof item.confirmed_quantity !== 'number' || item.confirmed_quantity < 0) {
          return NextResponse.json({ error: 'จำนวนที่รับต้องเป็นตัวเลขและติดลบไม่ได้' }, { status: 400 });
        }
      }

      /**
       * หาคลังปลายทางให้ได้**ก่อน** เปลี่ยนสถานะ — ของใบนี้ค้างอยู่ใน in_transit ของคลังต้นทาง
       * ถ้าปิดใบเป็น "รับแล้ว" ทั้งที่ไม่มีปลายทางให้ลง ของจะค้าง in_transit ตลอดกาล
       * (หายจากทั้งคลังต้นทางและปลายทาง) แล้วใบก็ปิดไปแล้ว ไม่มีทางย้อนกลับมาแก้
       */
      const consignWarehouse = await getConsignmentDestinationWarehouse(
        supabaseAdmin, existing.company_id, existing.customer_id, existing.counter_id
      );
      if (!consignWarehouse || !existing.warehouse_id) {
        return NextResponse.json(
          { error: 'ยังไม่ได้ตั้งคลังปลายทางของห้าง/สาขานี้ — ตั้งคลังก่อนจึงจะยืนยันรับได้' },
          { status: 400 }
        );
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
        (i: { quantity: number; confirmed_quantity: number | null }) =>
          (i.confirmed_quantity ?? i.quantity) === i.quantity
      );
      const newStatus = allMatch ? 'received' : 'partial_received';

      // Calculate confirmed_total
      const confirmedTotal = (allItems || []).reduce((sum: number, item: { confirmed_quantity: number; quantity: number; unit_price: number }) => {
        const qty = item.confirmed_quantity != null ? item.confirmed_quantity : item.quantity;
        return sum + qty * (item.unit_price || 0);
      }, 0);

      /**
       * ปิดสถานะแบบมีเงื่อนไข — กดยืนยันรัว ๆ สองครั้ง ทั้งสองคำขออ่านสถานะทัน
       * "pending_confirm" เหมือนกันแล้วย้ายของคนละรอบ = ของเข้าคลังปลายทางสองเท่า
       * ให้ DB ตัดสินว่าใครได้ไปต่อ แล้วค่อยแตะสต็อก
       */
      const { data: locked } = await supabaseAdmin
        .from('department_orders')
        .update({
          status: newStatus,
          received_at: new Date().toISOString(),
          confirmed_total: confirmedTotal,
          internal_notes: confirm_notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending_confirm')
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูกยืนยันไปแล้ว' }, { status: 409 });
      }

      // คลังที่ "ยอดพร้อมขาย" เปลี่ยนจริงในรอบนี้ — receiveFromTransit ย้าย in_transit ออกจาก
      // ต้นทางเฉย ๆ ยอดพร้อมขายเท่าเดิม จะเปลี่ยนก็ต่อเมื่อรับขาด (คืนเข้าคลัง) หรือรับเกิน (หักเพิ่ม)
      const confirmTouched: string[] = [];
      let sourceChanged = false;

      for (const item of (allItems || []) as {
        id: string; variation_id: string | null;
        confirmed_quantity: number | null; quantity: number;
      }[]) {
        if (!item.variation_id) continue;

        const sent = item.quantity || 0;
        if (sent <= 0) continue;

        /**
         * `null` = ยังไม่ได้กรอก → ถือว่ารับครบ · `0` = ห้างยืนยันว่า**ไม่ได้รับเลย**
         * (เดิมเช็ค `> 0` ทำให้ 0 ถูกกลืนเป็น "รับครบ" — ของที่จริง ๆ หายระหว่างทาง
         *  ถูกบันทึกว่าถึงห้างเรียบร้อย ไม่มีใครรู้ว่าหาย)
         */
        const confirmed = item.confirmed_quantity ?? sent;

        /**
         * ใบนี้ฝากไว้ใน in_transit ของคลังต้นทางแค่ `sent` — ถ้ารับเกิน แล้วดึงจาก transit
         * ตามจำนวนที่รับ จะไปกินของที่ใบอื่นฝากไว้ (transit ติดลบ/ใบอื่นรับไม่ครบตามมา)
         * ส่วนที่เกินจึงต้องหักจากของจริงในคลังต้นทางแทน แล้วค่อยเติมให้ปลายทางแยกต่างหาก
         */
        const fromTransit = Math.min(confirmed, sent);

        confirmTouched.push(item.variation_id);

        if (fromTransit > 0) {
          await receiveFromTransit({
            supabase: supabaseAdmin,
            companyId: existing.company_id,
            sourceWarehouseId: existing.warehouse_id,
            destWarehouseId: consignWarehouse.id,
            variationId: item.variation_id,
            qty: fromTransit,
            referenceType: 'department_order',
            referenceId: id,
            notes: `รับเข้าคลังห้าง: ${existing.department_order_number}`,
            createdBy: auth.userId,
          });
        }

        const shortfall = sent - fromTransit;
        if (shortfall > 0) {
          // รับขาด: คืนส่วนที่ไม่ถึงกลับคลังต้นทาง (in_transit -= , quantity +=)
          sourceChanged = true;
          await cancelFromShipped({
            supabase: supabaseAdmin,
            companyId: existing.company_id,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty: shortfall,
            referenceType: 'department_order',
            referenceId: id,
            notes: `คืน stock ขาดส่ง: ${existing.department_order_number} (ส่ง ${sent} รับ ${confirmed})`,
            createdBy: auth.userId,
          });
        }

        const excess = confirmed - sent;
        if (excess > 0) {
          // รับเกิน: หักของจริงจากคลังต้นทาง แล้วเติมให้ปลายทาง (เดิมไม่ได้เติม ของเกินหายเฉย ๆ)
          sourceChanged = true;
          await deductStock({
            supabase: supabaseAdmin,
            companyId: existing.company_id,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty: excess,
            referenceType: 'department_order',
            referenceId: id,
            notes: `หัก stock เกิน: ${existing.department_order_number} (ส่ง ${sent} รับ ${confirmed})`,
            createdBy: auth.userId,
          });
          await addStock({
            supabase: supabaseAdmin,
            companyId: existing.company_id,
            warehouseId: consignWarehouse.id,
            variationId: item.variation_id,
            qty: excess,
            referenceType: 'department_order',
            referenceId: id,
            notes: `รับเกินเข้าคลังห้าง: ${existing.department_order_number} (ส่ง ${sent} รับ ${confirmed})`,
            createdBy: auth.userId,
          });
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

      pushStockAfter(confirmTouched, [
        consignWarehouse.id,
        ...(sourceChanged ? [existing.warehouse_id] : []),
      ]);

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
      if (!['pending'].includes(existing.status)) {
        return NextResponse.json({ error: 'ยกเลิกได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }

      /**
       * ปิดสถานะแบบมีเงื่อนไข = ล็อกกันกดซ้ำ — กดรัว ๆ สองครั้ง ทั้งสองคำขออ่านสถานะเดิม
       * ทันเหมือนกันแล้วขยับสต็อกคนละรอบ ให้ DB ตัดสินว่าใครได้ไปต่อ
       */
      const { data: locked } = await supabaseAdmin
        .from('department_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูกยกเลิกไปแล้ว' }, { status: 409 });
      }

      // Unreserve stock
      const cancelTouched: string[] = [];
      if (existing.warehouse_id) {
        const { data: cancelItems } = await supabaseAdmin
          .from('department_order_items')
          .select('variation_id, quantity')
          .eq('department_order_id', id);

        for (const item of (cancelItems || []) as { variation_id: string | null; quantity: number }[]) {
          if (!item.variation_id) continue;
          const qty = item.quantity || 0;
          if (qty <= 0) continue;

          cancelTouched.push(item.variation_id);
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

      pushStockAfter(cancelTouched, [existing.warehouse_id]);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // === ACTION: VOID (shipped → draft, void TAX+DN, return stock) ===
    if (action === 'void') {
      if (existing.status !== 'shipped') {
        return NextResponse.json({ error: 'สามารถ void ได้เฉพาะสถานะ "กำลังส่ง" เท่านั้น' }, { status: 400 });
      }

      const now = new Date().toISOString();
      const voidReason = 'ยกเลิกใบส่งห้าง (void)';

      /**
       * ล็อกก่อนแตะสต็อก — void พาของกลับจาก in_transit เข้าคลังแล้วจองใหม่
       * กดซ้ำสองรอบ = ของงอกหนึ่งชุดและ in_transit ติดลบ
       * (สถานะปลายทางคือ pending อยู่แล้วตามขั้นตอนที่ 4 ข้างล่าง จึงตั้งตรงนี้ได้เลย)
       */
      const { data: voidLocked } = await supabaseAdmin
        .from('department_orders')
        .update({ status: 'pending', updated_at: now })
        .eq('id', id)
        .eq('status', 'shipped')
        .select('id');

      if (!voidLocked || voidLocked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูก void ไปแล้ว' }, { status: 409 });
      }

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

      // ไม่กระจายขึ้นร้าน: cancelFromShipped คืนของเข้า quantity แล้ว reserveStock จองกลับ
      // จำนวนเท่ากันทันที → ยอดพร้อมขายสุทธิเท่าเดิม (ใบกลับไปสถานะรอจัดส่ง)

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

      // 4. Reset order → pending (กลับไปรอจัดส่ง)
      await supabaseAdmin.from('department_orders')
        .update({
          status: 'pending',
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

      return NextResponse.json({ success: true, status: 'pending' });
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
