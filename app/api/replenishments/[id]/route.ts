import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { shipToTransit, receiveFromTransit, unreserveStock, cancelFromShipped, reserveStock, deductStock, addStock } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';
import { issueReplenishmentShipDocuments } from '@/lib/documents/consignment-documents';
import { getConsignmentDestinationWarehouse } from '@/lib/consignment-warehouse';
import { guardFeature } from '@/lib/package-gates-server';

// GET /api/replenishments/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'consignment');
    if (blocked) return blocked;

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
    if (!can(auth, 'order.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดำเนินการนี้' }, { status: 403 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'consignment');
    if (blocked) return blocked;

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
      /**
       * ปิดสถานะแบบมีเงื่อนไข = ล็อกกันกดซ้ำ — กดรัว ๆ สองครั้ง ทั้งสองคำขออ่านสถานะเดิม
       * ทันเหมือนกันแล้วขยับสต็อกคนละรอบ ให้ DB ตัดสินว่าใครได้ไปต่อ
       */
      const { data: locked } = await supabaseAdmin
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
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูกจัดส่งไปแล้ว' }, { status: 409 });
      }

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

      // ไม่กระจายขึ้นร้านตอนส่ง: shipToTransit ลด quantity และ reserved เท่ากัน
      // → ยอดพร้อมขายเท่าเดิม (ของถูกกันไว้ตั้งแต่ตอนสร้างใบเติมสินค้าแล้ว)

      // DN เสมอ · ใบกำกับภาษีเฉพาะปลายทางที่เป็นห้างฝากขาย
      // (ตัวแทนฝากขายมีสัญญา ม.78(3) ใบกำกับไปออกตอนแจ้งยอดขาย)
      const shipDocs = await issueReplenishmentShipDocuments(id, auth.companyId!, {
        customer_id: existing.customer_id,
      });

      return NextResponse.json({
        success: true,
        status: 'shipped',
        dn_number: shipDocs.dnNumber,
        doc_type: shipDocs.docType,
        tax_invoice_number: shipDocs.taxNumber,
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

      for (const item of confirmed_items as { id: string; confirmed_quantity: number }[]) {
        if (typeof item.confirmed_quantity !== 'number' || item.confirmed_quantity < 0) {
          return NextResponse.json({ error: 'จำนวนที่รับต้องเป็นตัวเลขและติดลบไม่ได้' }, { status: 400 });
        }
      }

      /**
       * หาคลังปลายทางให้ได้**ก่อน** เปลี่ยนสถานะ — ของใบนี้ค้างอยู่ใน in_transit ของคลังต้นทาง
       * ปิดใบเป็น "รับแล้ว" ทั้งที่ไม่มีปลายทางให้ลง = ของค้าง in_transit ตลอดกาล
       * แล้วใบก็ปิดไปแล้ว ไม่มีทางย้อนกลับมาแก้
       */
      const { data: rpHead } = await supabaseAdmin
        .from('replenishments')
        .select('customer_id, company_id, warehouse_id, counter_id')
        .eq('id', id)
        .single();

      const destWarehouse = rpHead
        ? await getConsignmentDestinationWarehouse(
            supabaseAdmin, rpHead.company_id, rpHead.customer_id, rpHead.counter_id
          )
        : null;

      if (!destWarehouse || !rpHead?.warehouse_id) {
        return NextResponse.json(
          { error: 'ยังไม่ได้ตั้งคลังฝากขายของตัวแทน/สาขานี้ — ตั้งคลังก่อนจึงจะยืนยันรับได้' },
          { status: 400 }
        );
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
       * "pending_confirm" เหมือนกันแล้วย้ายของคนละรอบ = ของเข้าคลังตัวแทนสองเท่า
       */
      const { data: locked } = await supabaseAdmin
        .from('replenishments')
        .update({
          status: newStatus,
          received_at: new Date().toISOString(),
          confirmed_total: confirmedTotal,
          confirm_notes: confirm_notes || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending_confirm')
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูกยืนยันไปแล้ว' }, { status: 409 });
      }

      // === Update consignment warehouse inventory + clear in_transit ===
      // (rpHead + destWarehouse ถูกตรวจไว้แล้วก่อนเปลี่ยนสถานะ — มาถึงตรงนี้แปลว่ามีครบ)
      const { data: rpNumberRow } = await supabaseAdmin
        .from('replenishments')
        .select('replenishment_number')
        .eq('id', id)
        .single();
      const rpNumber = rpNumberRow?.replenishment_number || id;

      // receiveFromTransit ย้าย in_transit ออกจากต้นทางเฉย ๆ ยอดพร้อมขายต้นทางเท่าเดิม
      // จะเปลี่ยนก็ต่อเมื่อรับขาด (คืนเข้าคลัง) หรือรับเกิน (หักเพิ่ม) เท่านั้น
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
         * `null` = ยังไม่ได้กรอก → ถือว่ารับครบ · `0` = ตัวแทนยืนยันว่า**ไม่ได้รับเลย**
         * (เดิมเช็ค `> 0` ทำให้ 0 ถูกกลืนเป็น "รับครบ" ของที่หายระหว่างทางเลยถูกบันทึกว่าถึงแล้ว)
         */
        const confirmed = item.confirmed_quantity ?? sent;

        /**
         * ใบนี้ฝากไว้ใน in_transit ของคลังต้นทางแค่ `sent` — รับเกินแล้วดึงจาก transit ตาม
         * จำนวนที่รับ จะไปกินของที่ใบอื่นฝากไว้ ส่วนเกินต้องหักจากของจริงในคลังต้นทางแทน
         */
        const fromTransit = Math.min(confirmed, sent);

        confirmTouched.push(item.variation_id);

        if (fromTransit > 0) {
          await receiveFromTransit({
            supabase: supabaseAdmin,
            companyId: rpHead.company_id,
            sourceWarehouseId: rpHead.warehouse_id,
            destWarehouseId: destWarehouse.id,
            variationId: item.variation_id,
            qty: fromTransit,
            referenceType: 'replenishment',
            referenceId: id,
            notes: `รับเข้าคลังตัวแทน: ${rpNumber}`,
            createdBy: auth.userId,
          });
        }

        const shortfall = sent - fromTransit;
        if (shortfall > 0) {
          sourceChanged = true;
          await cancelFromShipped({
            supabase: supabaseAdmin,
            companyId: rpHead.company_id,
            warehouseId: rpHead.warehouse_id,
            variationId: item.variation_id,
            qty: shortfall,
            referenceType: 'replenishment',
            referenceId: id,
            notes: `คืน stock ขาดส่ง: ${rpNumber} (ส่ง ${sent} รับ ${confirmed})`,
            createdBy: auth.userId,
          });
        }

        const excess = confirmed - sent;
        if (excess > 0) {
          // หักของจริงจากต้นทาง แล้วเติมให้ปลายทาง (เดิมไม่ได้เติม ของเกินหายเฉย ๆ)
          sourceChanged = true;
          await deductStock({
            supabase: supabaseAdmin,
            companyId: rpHead.company_id,
            warehouseId: rpHead.warehouse_id,
            variationId: item.variation_id,
            qty: excess,
            referenceType: 'replenishment',
            referenceId: id,
            notes: `หัก stock เกิน: ${rpNumber} (ส่ง ${sent} รับ ${confirmed})`,
            createdBy: auth.userId,
          });
          await addStock({
            supabase: supabaseAdmin,
            companyId: rpHead.company_id,
            warehouseId: destWarehouse.id,
            variationId: item.variation_id,
            qty: excess,
            referenceType: 'replenishment',
            referenceId: id,
            notes: `รับเกินเข้าคลังตัวแทน: ${rpNumber} (ส่ง ${sent} รับ ${confirmed})`,
            createdBy: auth.userId,
          });
        }
      }

      pushStockAfter(confirmTouched, [
        destWarehouse.id,
        ...(sourceChanged ? [rpHead.warehouse_id] : []),
      ]);

      // DN mode: ไม่ต้องออกเอกสารเพิ่มเมื่อรับไม่ครบ — DN PDF แสดง confirmed_quantity เอง

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

      /**
       * ปิดสถานะแบบมีเงื่อนไข = ล็อกกันกดซ้ำ — คืนของสองรอบจากการกดรัว ๆ คือของงอก
       */
      const { data: locked } = await supabaseAdmin
        .from('replenishments')
        .update({
          status: 'cancelled',
          shipped_at: null,
          received_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .in('status', ['pending', 'shipped'])
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบนี้ถูกยกเลิกไปแล้ว' }, { status: 409 });
      }

      // Reverse stock operations
      const cancelTouched: string[] = [];
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

          cancelTouched.push(item.variation_id);

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

      // ปลดจอง (pending) หรือคืนของเข้าคลัง (shipped) — ทั้งสองแบบยอดพร้อมขายเพิ่ม
      pushStockAfter(cancelTouched, [existing.warehouse_id]);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    // === ACTION: UPDATE (general field update for pending status) ===
    if (action === 'update') {
      if (existing.status !== 'pending') {
        return NextResponse.json({ error: 'สามารถแก้ไขได้เฉพาะสถานะ "ที่ต้องจัดส่ง" เท่านั้น' }, { status: 400 });
      }
      const { notes, internal_notes, items, customer_id, total_amount, counter_id } = body;
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (notes !== undefined) updateData.notes = notes || null;
      if (internal_notes !== undefined) updateData.internal_notes = internal_notes || null;
      if (customer_id) updateData.customer_id = customer_id;
      if (total_amount !== undefined) updateData.total_amount = total_amount;
      if (counter_id !== undefined) {
        if (counter_id) {
          const { data: counter } = await supabaseAdmin
            .from('consignment_counters')
            .select('id')
            .eq('id', counter_id)
            .eq('company_id', auth.companyId)
            .eq('customer_id', customer_id || existing.customer_id)
            .eq('is_active', true)
            .maybeSingle();
          if (!counter) {
            return NextResponse.json({ error: 'ไม่พบสาขาของลูกค้ารายนี้' }, { status: 400 });
          }
        }
        updateData.counter_id = counter_id || null;
      }

      await supabaseAdmin
        .from('replenishments')
        .update(updateData)
        .eq('id', id);

      // Update items if provided
      const updateReleasedVarIds: string[] = [];
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

            updateReleasedVarIds.push(oldItem.variation_id);
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

      // แก้รายการ = ปล่อยจองเก่าทั้งชุดแล้วจองใหม่ จำนวนไม่จำเป็นต้องเท่าเดิม
      // → ยอดพร้อมขายขยับทั้งตัวที่ถูกถอดออกและตัวที่เพิ่มเข้ามา ดันทั้งสองชุด
      if (items && Array.isArray(items) && existing.warehouse_id) {
        pushStockAfter(
          [
            ...updateReleasedVarIds,
            ...(items as { variation_id?: string }[]).map(i => i.variation_id),
          ],
          [existing.warehouse_id],
        );
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('Replenishment PUT error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
