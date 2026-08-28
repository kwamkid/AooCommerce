// Path: app/api/orders/route.ts  // v13 - exclude_flow_types filter
import { NextRequest, NextResponse } from 'next/server';
import { parseGiftCard } from '@/lib/gift-card';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { createCreditNote } from '@/lib/credit-notes/auto-cn';
import { reserveStock, unreserveStock, returnStock, deductAndUnreserve } from '@/lib/stock-service';
import { getPromotionComponents } from '@/lib/promotion-service';
import { fetchCostMap } from '@/lib/cost-utils';
import { resolveDeliverySnapshot } from '@/lib/delivery-server';

// Type definitions
interface OrderItemInput {
  variation_id: string; // product_variations.id
  product_id: string; // products.id
  product_code: string;
  product_name: string;
  variation_label?: string;
  quantity: number;
  unit_price: number;
  discount_percent?: number;
  notes?: string;
  promotion_id?: string; // Link to promotions table
  promotion_components?: any[]; // Selected promotion sub-items (stored as JSONB)
  shipments: {
    shipping_address_id: string;
    quantity: number;
    delivery_notes?: string;
    shipping_fee?: number;
  }[];
}

interface OrderData {
  customer_id?: string;
  // การ์ดอวยพร — ค่าการ์ดไม่รับจาก client (อ่านจาก settings ของร้าน)
  gift_card_requested?: boolean;
  gift_message?: string;
  gift_to?: string;
  gift_from?: string;
  gift_hide_price?: boolean;
  delivery_date?: string;
  delivery_zone_id?: string | null;
  delivery_slot_id?: string | null;
  payment_method?: string;
  discount_amount?: number;
  notes?: string;
  internal_notes?: string;
  warehouse_id?: string;
  shipping_address_id?: string;
  delivery_name?: string;
  delivery_phone?: string;
  delivery_address?: string;
  delivery_district?: string;
  delivery_amphoe?: string;
  delivery_province?: string;
  delivery_postal_code?: string;
  delivery_email?: string;
  /** โหมด "ส่งให้คนอื่น" (ของขวัญ) — ผู้รับไม่ใช่ผู้สั่ง
   *  ไม่ได้เก็บลง orders (ไม่มี column) ใช้บอก API ว่าจะจำที่อยู่ยังไง:
   *  → เก็บเป็นที่อยู่ผู้รับในสมุดที่อยู่ (is_default=false) ห้ามทับที่อยู่หลักของผู้สั่ง */
  ship_to_other?: boolean;
  address_action?: 'update' | 'new';
  tax_invoice_requested?: boolean;
  tax_invoice_type?: 'personal' | 'corporate';
  tax_invoice_name?: string;
  tax_invoice_tax_id?: string;
  tax_invoice_branch?: string;
  tax_invoice_address?: string;
  source?: string;
  source_name?: string;
  sales_channel_id?: string | null;
  expires_at?: string | null;
  items: OrderItemInput[];
  exchange?: {
    from_order_id: string;
    items: { order_item_id: string; quantity: number }[];
    reason: string;
  };
}


/**
 * จำ "ที่อยู่ผู้รับ" ของโหมดส่งให้คนอื่น ไว้ในสมุดที่อยู่ของลูกค้าผู้สั่ง
 * เพื่อส่งของขวัญให้คนเดิมซ้ำได้โดยไม่ต้องพิมพ์ใหม่
 *
 * - `address_name` = ชื่อผู้รับ (ไม่ใช่ "ที่อยู่จัดส่ง" ลอย ๆ) → เลือกจาก dropdown แล้วรู้เรื่อง
 * - `is_default` = false เสมอ — ที่อยู่ของขวัญห้ามกลายเป็นที่อยู่หลักของผู้สั่ง
 * - กันซ้ำด้วย customer_id + ชื่อผู้รับ + เบอร์ + address_line1 (ตรงกัน = update ไม่ insert)
 *
 * คืน id ของที่อยู่ที่ใช้ (null = ข้อมูลไม่พอ/ล้มเหลว — caller ไม่ต้องหยุดงาน)
 * supabase ไม่ throw → เช็ค error ที่คืนมาทุกครั้ง
 */
async function rememberRecipientAddress(
  companyId: string,
  customerId: string,
  userId: string | undefined,
  d: {
    name?: string; phone?: string; address?: string;
    district?: string; amphoe?: string; province?: string; postal_code?: string;
  },
): Promise<string | null> {
  // address_line1 + province เป็น NOT NULL — ข้อมูลไม่ครบก็จำไม่ได้
  if (!d.address || !d.province) return null;
  const addressName = (d.name || '').trim() || 'ที่อยู่ผู้รับ';
  const contactPerson = (d.name || '').trim() || null;
  const phone = (d.phone || '').trim() || null;

  const { data: existing, error: findError } = await supabaseAdmin
    .from('shipping_addresses')
    .select('id, contact_person, phone, is_default')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('address_line1', d.address)
    .eq('is_active', true)
    .limit(20);
  if (findError) {
    console.error('Recipient address lookup error:', findError.message);
    return null;
  }

  // ตรง address_line1 แล้วยังต้องตรงชื่อ+เบอร์ด้วย (คนละคนอยู่บ้านเดียวกันได้)
  const norm = (v: string | null | undefined) => (v || '').replace(/[-\s()]/g, '').trim();
  const match = (existing || []).find((r: { contact_person: string | null; phone: string | null }) =>
    (r.contact_person || '').trim() === (contactPerson || '').trim() && norm(r.phone) === norm(phone));
  const matchId = match?.id || null;

  if (matchId) {
    const { error: updateError } = await supabaseAdmin
      .from('shipping_addresses')
      .update({
        // ที่อยู่หลักของลูกค้าห้ามโดนเปลี่ยนชื่อ (เจอเคสส่งของขวัญไปที่อยู่ตัวเอง)
        ...(match?.is_default ? {} : { address_name: addressName }),
        contact_person: contactPerson,
        phone,
        district: d.district || null,
        amphoe: d.amphoe || null,
        province: d.province,
        postal_code: d.postal_code || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', matchId)
      .eq('company_id', companyId);
    if (updateError) {
      console.error('Recipient address update error:', updateError.message);
      return null;
    }
    return matchId;
  }

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('shipping_addresses')
    .insert({
      company_id: companyId,
      customer_id: customerId,
      address_name: addressName,
      contact_person: contactPerson,
      phone,
      address_line1: d.address,
      district: d.district || null,
      amphoe: d.amphoe || null,
      province: d.province,
      postal_code: d.postal_code || null,
      is_default: false,
      is_active: true,
      created_by: userId || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insertError) {
    console.error('Recipient address insert error:', insertError.message);
    return null;
  }
  return inserted?.id || null;
}

// POST - Create new order with items and shipments
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const orderData: OrderData = await request.json();

    // Validate required fields
    if (!orderData.items || orderData.items.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: items' },
        { status: 400 }
      );
    }

    // Validate shipments only when the order actually has a shipping_address.
    // Chat-order flow: staff creates order with customer name + items, the
    // customer fills the delivery address later → empty shipments[] is fine.
    if (orderData.customer_id && orderData.shipping_address_id) {
      for (const item of orderData.items) {
        if (!item.shipments || item.shipments.length === 0) {
          return NextResponse.json(
            { error: 'Each item must have at least one shipment' },
            { status: 400 }
          );
        }

        const totalShipmentQty = item.shipments.reduce((sum, s) => sum + s.quantity, 0);
        if (totalShipmentQty !== item.quantity) {
          return NextResponse.json(
            { error: `Total shipment quantity (${totalShipmentQty}) does not match item quantity (${item.quantity})` },
            { status: 400 }
          );
        }
      }
    }

    // Calculate totals
    let subtotal = 0;
    const itemsWithTotals = orderData.items.map((item: any) => {
      // Support both discount_percent (legacy) and discount_value/discount_type (new)
      let discountPercent = 0;
      let discountAmountItem = 0;
      const itemSubtotal = item.quantity * item.unit_price;

      if (item.discount_type === 'amount' && item.discount_value) {
        discountAmountItem = item.discount_value;
        discountPercent = itemSubtotal > 0 ? (discountAmountItem / itemSubtotal) * 100 : 0;
      } else {
        discountPercent = item.discount_value || item.discount_percent || 0;
        discountAmountItem = itemSubtotal * (discountPercent / 100);
      }

      const itemTotal = itemSubtotal - discountAmountItem;
      subtotal += itemTotal;
      return {
        ...item,
        discount_percent: discountPercent,
        discount_amount: discountAmountItem,
        discount_type: item.discount_type || 'percent',
        subtotal: itemSubtotal,
        total: itemTotal
      };
    });


    // Calculate total shipping fee (deduplicated by address)
    let totalShippingFee = 0;
    if (orderData.customer_id) {
      const shippingFeeByAddress = new Map<string, number>();
      orderData.items.forEach(item => {
        (item.shipments || []).forEach(s => {
          if (s.shipping_fee && !shippingFeeByAddress.has(s.shipping_address_id)) {
            shippingFeeByAddress.set(s.shipping_address_id, s.shipping_fee);
          }
        });
      });
      totalShippingFee = Array.from(shippingFeeByAddress.values()).reduce((sum, f) => sum + f, 0);
    } else if ((orderData as any).shipping_fee) {
      // Non-customer orders: shipping fee sent directly
      totalShippingFee = (orderData as any).shipping_fee;
    }

    const discountAmount = orderData.discount_amount || 0;

    // Check if company is VAT registered
    const { data: companyInfo } = await supabaseAdmin
      .from('companies')
      .select('vat_registered')
      .eq('id', auth.companyId)
      .single();
    const isVatRegistered = companyInfo?.vat_registered || false;

    // การ์ดอวยพร — ค่าการ์ดอ่านจาก settings ของร้านเสมอ ไม่รับตัวเลขจาก client
    // (ช่องทางสาธารณะอย่าง storefront ก็เรียก path นี้ได้ ห้ามให้กำหนดราคาเองได้)
    const giftCardRequested = !!orderData.gift_card_requested;
    let giftCardFee = 0;
    if (giftCardRequested) {
      const { data: giftSettingsRow } = await supabaseAdmin
        .from('companies').select('settings').eq('id', auth.companyId).single();
      const gc = parseGiftCard(giftSettingsRow?.settings as Record<string, unknown> | null);
      // ร้านปิดบริการอยู่ = ไม่คิดเงินและไม่ทำเป็นออเดอร์การ์ด
      giftCardFee = gc.enabled ? gc.fee : 0;
    }

    // Prices are VAT-inclusive (if VAT registered), so we reverse-calculate VAT from the total
    const totalWithVAT = subtotal - discountAmount + totalShippingFee + giftCardFee;
    const subtotalBeforeVAT = isVatRegistered ? Math.round((totalWithVAT / 1.07) * 100) / 100 : totalWithVAT;
    const vatAmount = isVatRegistered ? totalWithVAT - subtotalBeforeVAT : 0;
    const totalAmount = totalWithVAT;

    // Determine flow_type from customer_type + sale_type
    let flowType = 'r_retail'; // default
    if (orderData.customer_id) {
      const { data: cust } = await supabaseAdmin
        .from('customers')
        .select('customer_type, sale_type')
        .eq('id', orderData.customer_id)
        .single();
      if (cust?.customer_type) {
        const ct = cust.customer_type;
        const st = cust.sale_type || '';
        if (ct === 'consignment_dealer') flowType = 'c_consign';
        else if (ct === 'department_store') flowType = 'd_consign';
        else if (ct === 'wholesale_department' || ct === 'wholesale_dealer' || ct === 'corporate') {
          flowType = st === 'wholesale_credit' ? 'w_credit' : 'w_cash';
        }
        else if (st === 'wholesale_credit') flowType = 'w_credit';
        else if (st === 'wholesale_cash') flowType = 'w_cash';
        else if (ct === 'credit') flowType = 'w_credit';
        // retail, dropship, affiliate → r_retail (default)
      }
    }

    // Generate order number
    const { data: orderNumber, error: codeError } = await supabaseAdmin
      .rpc('generate_order_number', { p_company_id: auth.companyId });

    if (codeError) {
      console.error('Order number generation error:', codeError);
      return NextResponse.json(
        { error: 'Failed to generate order number' },
        { status: 500 }
      );
    }

    // Auto-populate delivery snapshot from shipping_address if not provided
    if (orderData.shipping_address_id && !orderData.delivery_name) {
      const { data: addr } = await supabaseAdmin
        .from('shipping_addresses')
        .select('contact_person, phone, address_line1, district, amphoe, province, postal_code')
        .eq('id', orderData.shipping_address_id)
        .single();
      if (addr) {
        orderData.delivery_name = addr.contact_person || '';
        orderData.delivery_phone = addr.phone || '';
        orderData.delivery_address = addr.address_line1 || '';
        orderData.delivery_district = addr.district || '';
        orderData.delivery_amphoe = addr.amphoe || '';
        orderData.delivery_province = addr.province || '';
        orderData.delivery_postal_code = addr.postal_code || '';
      }
    }

    // Calculate expires_at for manual orders
    let expiresAt: string | null = null;
    const isManualSource = !orderData.source || orderData.source === 'manual';
    if (isManualSource) {
      if ('expires_at' in orderData && orderData.expires_at === null) {
        // Explicitly no expiry — user chose "ไม่หมดอายุ"
        expiresAt = null;
      } else if (orderData.expires_at) {
        expiresAt = orderData.expires_at;
      } else {
        // Use company default bill_expiry_days (null = default 7 days, 0 = disabled)
        const { data: companySettings } = await supabaseAdmin
          .from('companies')
          .select('settings')
          .eq('id', auth.companyId)
          .single();
        const rawExpiryDays = (companySettings?.settings as Record<string, unknown>)?.bill_expiry_days;
        const billExpiryDays = rawExpiryDays === 0 ? 0 : (typeof rawExpiryDays === 'number' && rawExpiryDays > 0 ? rawExpiryDays : 7);
        if (billExpiryDays > 0) {
          const d = new Date();
          d.setDate(d.getDate() + billExpiryDays);
          expiresAt = d.toISOString();
        }
      }
    }

    // Zone/slot snapshot — labels+times copied at save time (ids validated per company)
    const deliverySnapshot = await resolveDeliverySnapshot(
      auth.companyId, orderData.delivery_zone_id, orderData.delivery_slot_id
    );

    // Create order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        company_id: auth.companyId,
        order_number: orderNumber,
        customer_id: orderData.customer_id || null,
        shipping_address_id: orderData.shipping_address_id || null,
        delivery_date: orderData.delivery_date || null,
        ...deliverySnapshot,
        subtotal: subtotalBeforeVAT,
        vat_amount: vatAmount,
        discount_amount: discountAmount,
        shipping_fee: totalShippingFee,
        total_amount: totalAmount,
        payment_method: orderData.payment_method || null,
        payment_status: 'pending',
        order_status: ['w_credit', 'c_consign', 'd_statement'].includes(flowType) ? 'ready_to_ship' : 'new',
        notes: orderData.notes || null,
        internal_notes: orderData.internal_notes || null,
        delivery_name: orderData.delivery_name || null,
        delivery_phone: orderData.delivery_phone || null,
        delivery_address: orderData.delivery_address || null,
        delivery_district: orderData.delivery_district || null,
        delivery_amphoe: orderData.delivery_amphoe || null,
        delivery_province: orderData.delivery_province || null,
        delivery_postal_code: orderData.delivery_postal_code || null,
        delivery_email: orderData.delivery_email || null,
        gift_card_requested: giftCardRequested,
        gift_card_fee: giftCardFee,
        gift_message: orderData.gift_message || null,
        gift_to: orderData.gift_to || null,
        gift_from: orderData.gift_from || null,
        gift_hide_price: orderData.gift_hide_price ?? false,
        tax_invoice_requested: orderData.tax_invoice_requested || false,
        tax_invoice_type: orderData.tax_invoice_type || null,
        tax_invoice_name: orderData.tax_invoice_name || null,
        tax_invoice_tax_id: orderData.tax_invoice_tax_id || null,
        tax_invoice_branch: orderData.tax_invoice_branch || null,
        tax_invoice_address: orderData.tax_invoice_address || null,
        source: orderData.source || 'manual',
        source_name: orderData.source_name || null,
        sales_channel_id: orderData.sales_channel_id || null,
        flow_type: flowType,
        expires_at: expiresAt,
        created_by: auth.userId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (orderError) {
      console.error('Order creation error:', orderError);
      return NextResponse.json(
        { error: orderError.message },
        { status: 400 }
      );
    }

    // Fetch WAC cost map for cost snapshot
    const costMap = await fetchCostMap(
      supabaseAdmin,
      itemsWithTotals.map((i: OrderItemInput) => i.variation_id).filter(Boolean),
    );

    // Create order items and shipments
    for (const item of itemsWithTotals) {
      // For promotion items: resolve real variation_id from promotion_items if needed
      let resolvedVariationId = item.variation_id;
      const promoId = item.promotion_id && item.promotion_id.length > 0 ? item.promotion_id : null;
      if (promoId) {
        // Check if variation_id is actually valid (not same as promotion_id = fake)
        if (!resolvedVariationId || resolvedVariationId === promoId) {
          const { data: promoItems } = await supabaseAdmin
            .from('promotion_items')
            .select('variation_id, product_id')
            .eq('promotion_id', promoId)
            .not('variation_id', 'is', null)
            .limit(1);
          if (promoItems?.[0]?.variation_id) {
            resolvedVariationId = promoItems[0].variation_id;
          } else {
            // Fallback: get first variation from product_id
            const { data: pi } = await supabaseAdmin
              .from('promotion_items')
              .select('product_id')
              .eq('promotion_id', promoId)
              .not('product_id', 'is', null)
              .limit(1);
            if (pi?.[0]?.product_id) {
              const { data: pv } = await supabaseAdmin
                .from('product_variations')
                .select('id')
                .eq('product_id', pi[0].product_id)
                .limit(1);
              if (pv?.[0]?.id) resolvedVariationId = pv[0].id;
            }
          }
        }
      }

      // Create order item
      const { data: orderItem, error: itemError } = await supabaseAdmin
        .from('order_items')
        .insert({
          company_id: auth.companyId,
          order_id: order.id,
          variation_id: resolvedVariationId,
          product_id: item.product_id || null,
          product_code: item.product_code || null,
          product_name: item.product_name,
          variation_label: item.variation_label || null,
          quantity: item.quantity,
          unit_price: item.unit_price,
          unit_cost: costMap[resolvedVariationId] || null,
          discount_percent: item.discount_percent || 0,
          discount_amount: item.discount_amount,
          discount_type: item.discount_type || 'percent',
          subtotal: item.subtotal,
          total: item.total,
          notes: item.notes || null,
          promotion_id: item.promotion_id && item.promotion_id.length > 0 ? item.promotion_id : null,
          promotion_components: item.promotion_components && item.promotion_components.length > 0 ? item.promotion_components : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (itemError) {
        console.error('Order item creation error:', itemError);
        // Rollback: delete the order
        await supabaseAdmin.from('orders').delete().eq('id', order.id).eq('company_id', auth.companyId);
        return NextResponse.json(
          { error: itemError.message },
          { status: 400 }
        );
      }

      // Create shipments for this item (skip for orders without customer)
      if (orderData.customer_id && item.shipments && item.shipments.length > 0) {
        const shipmentsToInsert = item.shipments
          .filter((shipment: any) => shipment.shipping_address_id)
          .map((shipment: any) => ({
            company_id: auth.companyId,
            order_item_id: orderItem.id,
            shipping_address_id: shipment.shipping_address_id,
            quantity: shipment.quantity,
            shipping_fee: shipment.shipping_fee || 0,
            delivery_status: 'pending',
            delivery_notes: shipment.delivery_notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        if (shipmentsToInsert.length === 0) continue;

        const { error: shipmentError } = await supabaseAdmin
          .from('order_shipments')
          .insert(shipmentsToInsert);

        if (shipmentError) {
          console.error('Shipment creation error:', shipmentError);
          // Rollback: delete the order
          await supabaseAdmin.from('orders').delete().eq('id', order.id).eq('company_id', auth.companyId);
          return NextResponse.json(
            { error: shipmentError.message },
            { status: 400 }
          );
        }
      }
    }

    // --- Upsert shipping_address from delivery snapshot (when customer exists) ---
    // address_action: 'update' = update selected address, 'new' = create new address, undefined = auto
    const addressAction = orderData.address_action as string | undefined;
    if (orderData.customer_id && orderData.delivery_address && orderData.ship_to_other) {
      // โหมดส่งให้คนอื่น: ที่อยู่นี้เป็นของ "ผู้รับ" ไม่ใช่ที่อยู่ผู้สั่ง
      // → เก็บเป็นที่อยู่แยกในสมุดของลูกค้า (is_default=false) แล้วชี้ออเดอร์มาที่มัน
      //   ห้ามเข้าเส้นล่าง เพราะเส้นนั้นจะไปทับ/สร้างที่อยู่ทั่วไปของผู้สั่ง
      try {
        const recipientAddressId = await rememberRecipientAddress(
          auth.companyId, orderData.customer_id, auth.userId,
          {
            name: orderData.delivery_name,
            phone: orderData.delivery_phone,
            address: orderData.delivery_address,
            district: orderData.delivery_district,
            amphoe: orderData.delivery_amphoe,
            province: orderData.delivery_province,
            postal_code: orderData.delivery_postal_code,
          },
        );
        if (recipientAddressId && recipientAddressId !== orderData.shipping_address_id) {
          const { error: orderAddrError } = await supabaseAdmin
            .from('orders')
            .update({ shipping_address_id: recipientAddressId })
            .eq('id', order.id)
            .eq('company_id', auth.companyId);
          if (orderAddrError) console.error('Order recipient address link error:', orderAddrError.message);

          const { data: orderItemRows, error: itemRowsError } = await supabaseAdmin
            .from('order_items')
            .select('id')
            .eq('order_id', order.id)
            .eq('company_id', auth.companyId);
          if (itemRowsError) console.error('Order items lookup error:', itemRowsError.message);
          if (orderItemRows && orderItemRows.length > 0) {
            const { error: shipAddrError } = await supabaseAdmin
              .from('order_shipments')
              .update({ shipping_address_id: recipientAddressId })
              .in('order_item_id', orderItemRows.map((i: { id: string }) => i.id));
            if (shipAddrError) console.error('Shipment recipient address link error:', shipAddrError.message);
          }
        }
      } catch (e) {
        console.error('Recipient address upsert error (non-blocking):', e);
      }
    } else if (orderData.customer_id && orderData.delivery_address) {
      try {
        // Check if delivery info matches the selected shipping_address
        let needsUpsert = true;
        if (orderData.shipping_address_id) {
          const { data: selectedAddr } = await supabaseAdmin
            .from('shipping_addresses')
            .select('address_line1, district, amphoe, province, postal_code')
            .eq('id', orderData.shipping_address_id)
            .single();
          if (selectedAddr &&
            selectedAddr.address_line1 === (orderData.delivery_address || '') &&
            selectedAddr.district === (orderData.delivery_district || '') &&
            selectedAddr.amphoe === (orderData.delivery_amphoe || '') &&
            selectedAddr.province === (orderData.delivery_province || '') &&
            selectedAddr.postal_code === (orderData.delivery_postal_code || '')) {
            needsUpsert = false; // address matches, just update contact info
            await supabaseAdmin
              .from('shipping_addresses')
              .update({
                contact_person: orderData.delivery_name || null,
                phone: orderData.delivery_phone || null,
                updated_at: new Date().toISOString()
              })
              .eq('id', orderData.shipping_address_id);
          }
        }

        if (needsUpsert && addressAction === 'update' && orderData.shipping_address_id) {
          // User chose to update the existing address
          await supabaseAdmin
            .from('shipping_addresses')
            .update({
              contact_person: orderData.delivery_name || null,
              phone: orderData.delivery_phone || null,
              address_line1: orderData.delivery_address || null,
              district: orderData.delivery_district || null,
              amphoe: orderData.delivery_amphoe || null,
              province: orderData.delivery_province || null,
              postal_code: orderData.delivery_postal_code || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', orderData.shipping_address_id);
          needsUpsert = false;
        }

        if (needsUpsert) {
          // Create new shipping_address (user chose 'new' or auto mode)
          const { data: newAddr } = await supabaseAdmin
            .from('shipping_addresses')
            .insert({
              company_id: auth.companyId,
              customer_id: orderData.customer_id,
              address_name: 'ที่อยู่จัดส่ง',
              contact_person: orderData.delivery_name || null,
              phone: orderData.delivery_phone || null,
              address_line1: orderData.delivery_address || null,
              district: orderData.delivery_district || null,
              amphoe: orderData.delivery_amphoe || null,
              province: orderData.delivery_province || null,
              postal_code: orderData.delivery_postal_code || null,
              is_default: !orderData.shipping_address_id,
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .select('id')
            .single();

          if (newAddr) {
            // Update order to point to new address
            await supabaseAdmin
              .from('orders')
              .update({ shipping_address_id: newAddr.id })
              .eq('id', order.id);

            // Update shipments to point to new address
            const { data: orderItems } = await supabaseAdmin
              .from('order_items')
              .select('id')
              .eq('order_id', order.id);
            if (orderItems && orderItems.length > 0) {
              await supabaseAdmin
                .from('order_shipments')
                .update({ shipping_address_id: newAddr.id })
                .in('order_item_id', orderItems.map(i => i.id));
            }
          }
        }
      } catch (e) {
        console.error('Shipping address upsert error (non-blocking):', e);
      }
    }

    // --- Stock reservation (best-effort, errors logged but don't block order) ---
    try {
      const stockConfig = await getStockConfig(auth.companyId!);
      if (stockConfig.stockEnabled) {
        // Determine warehouse: use provided warehouse_id or find company's default warehouse
        let warehouseId = orderData.warehouse_id || null;
        if (!warehouseId) {
          const { data: defaultWarehouse } = await supabaseAdmin
            .from('warehouses')
            .select('id')
            .eq('company_id', auth.companyId)
            .eq('is_active', true)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
          warehouseId = defaultWarehouse?.id || null;
        }

        if (warehouseId) {
          // Save warehouse_id to the order
          await supabaseAdmin
            .from('orders')
            .update({ warehouse_id: warehouseId })
            .eq('id', order.id)
            .eq('company_id', auth.companyId);

          for (const item of itemsWithTotals) {
            if (!item.variation_id) continue;
            try {
              if (item.promotion_id && item.promotion_components?.length) {
                // Promotion item: reserve stock for each selected component
                for (const comp of item.promotion_components) {
                  if (!comp.variation_id) continue;
                  // Resolve: variation_id might be a product_id for product-level items
                  let varId = comp.variation_id;
                  const { data: checkVar } = await supabaseAdmin.from('product_variations').select('id').eq('id', varId).maybeSingle();
                  if (!checkVar) {
                    const { data: firstVar } = await supabaseAdmin.from('product_variations').select('id').eq('product_id', varId).limit(1).maybeSingle();
                    if (firstVar) varId = firstVar.id; else continue;
                  }
                  await reserveStock({
                    supabase: supabaseAdmin,
                    companyId: auth.companyId!,
                    warehouseId,
                    variationId: varId,
                    qty: comp.quantity * item.quantity,
                    referenceType: 'order',
                    referenceId: order.id,
                    notes: `Reserve for order ${order.order_number} (promo component)`,
                    createdBy: auth.userId,
                  });
                }
              } else {
                // Normal item: reserve as-is
                await reserveStock({
                  supabase: supabaseAdmin,
                  companyId: auth.companyId!,
                  warehouseId,
                  variationId: item.variation_id,
                  qty: item.quantity,
                  referenceType: 'order',
                  referenceId: order.id,
                  notes: `Reserve for order ${order.order_number}`,
                  createdBy: auth.userId,
                });
              }
            } catch (itemStockErr) {
              console.error(`[STOCK RESERVE] Error reserving stock for variation ${item.variation_id}:`, itemStockErr);
            }
          }
        } else {
          console.warn('[STOCK RESERVE] Stock enabled but no warehouse found for company', auth.companyId);
        }
      }
    } catch (stockErr) {
      console.error('[STOCK RESERVE] Error during stock reservation:', stockErr);
    }
    // --- End stock reservation ---

    // --- Exchange: create CN for returned items from original order ---
    let creditNote: { cn_id: string; cn_number: string } | null = null;
    if (orderData.exchange) {
      try {
        const cnResult = await createCreditNote({
          companyId: auth.companyId!,
          orderId: orderData.exchange.from_order_id,
          type: 'exchange',
          reason: orderData.exchange.reason,
          items: orderData.exchange.items,
          createdBy: auth.userId,
        });

        if (cnResult) {
          creditNote = cnResult;
          // Link CN to this new exchange order
          await supabaseAdmin
            .from('credit_notes')
            .update({ exchange_order_id: order.id, updated_at: new Date().toISOString() })
            .eq('id', cnResult.cn_id);

          // Apply exchange credit: reduce total_amount by CN amount
          const { data: cnData } = await supabaseAdmin
            .from('credit_notes')
            .select('total_amount')
            .eq('id', cnResult.cn_id)
            .single();

          if (cnData) {
            const creditAmt = Number(cnData.total_amount || 0);
            const newTotal = Math.max(0, totalAmount - creditAmt);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const updateFields: any = {
              exchange_credit: creditAmt,
              total_amount: newTotal,
              updated_at: new Date().toISOString(),
            };
            // Credit covers entire bill → auto-paid
            if (creditAmt >= totalAmount) {
              updateFields.payment_status = 'paid';
              updateFields.order_status = 'ready_to_ship';
            }
            // Recalculate VAT from new total
            if (isVatRegistered && newTotal > 0) {
              const newSubtotalBV = Math.round((newTotal / 1.07) * 100) / 100;
              updateFields.subtotal = newSubtotalBV;
              updateFields.vat_amount = newTotal - newSubtotalBV;
            } else if (newTotal === 0) {
              updateFields.subtotal = 0;
              updateFields.vat_amount = 0;
            }
            await supabaseAdmin
              .from('orders')
              .update(updateFields)
              .eq('id', order.id);
          }
        }
      } catch (cnErr) {
        console.error('[EXCHANGE CN] Error creating credit note:', cnErr);
        // Non-blocking — order is already created, CN failure shouldn't rollback
      }
    }
    // --- End exchange CN ---

    // --- Insert INV record (ใบแจ้งหนี้) into document table ---
    try {
      const { insertInvoice } = await import('@/lib/invoice-service');
      const { data: invNumber } = await supabaseAdmin
        .rpc('generate_invoice_number', { p_company_id: auth.companyId });
      if (invNumber) {
        // Get customer name
        let custName: string | null = null;
        if (orderData.customer_id) {
          const { data: cData } = await supabaseAdmin
            .from('customers').select('name').eq('id', orderData.customer_id).single();
          custName = cData?.name || null;
        }
        await insertInvoice({
          company_id: auth.companyId!,
          invoice_number: invNumber,
          invoice_date: new Date().toISOString().split('T')[0],
          source_type: 'order',
          source_id: order.id,
          customer_id: orderData.customer_id || null,
          customer_name: custName,
          total_amount: totalAmount,
        });
      }
    } catch (e) { console.error('[POST /orders] INV insert:', e); }

    // Fetch complete order details (rpc returns array)
    const { data: completeOrder } = await supabaseAdmin
      .rpc('get_order_details', { p_order_id: order.id });

    // rpc returns an array — use first element, fall back to the inserted order
    const orderResult = Array.isArray(completeOrder) ? completeOrder[0] : completeOrder;

    return NextResponse.json({
      success: true,
      order: orderResult || order,
      id: order.id,
      order_number: order.order_number,
      ...(creditNote ? { credit_note: creditNote } : {}),
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - Get orders list or single order
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');

    // If ID is provided, fetch single order with full details
    if (orderId) {
      // Fetch order with customer + sales channel (so detail page can show channel name)
      const { data: order, error: orderError } = await supabaseAdmin
        .from('orders')
        .select(`
          *,
          customer:customers (
            id,
            customer_code,
            name,
            contact_person,
            phone,
            email,
            tax_company_name,
            tax_id,
            tax_branch,
            billing_address,
            billing_district,
            billing_amphoe,
            billing_province,
            billing_postal_code
          ),
          sales_channel:sales_channels (
            id,
            code,
            name,
            channel_type,
            platform
          )
        `)
        .eq('id', orderId)
        .eq('company_id', auth.companyId)
        .single();

      if (orderError || !order) {
        return NextResponse.json(
          { error: 'Order not found' },
          { status: 404 }
        );
      }

      // Fetch order items (product info already in order_items table)
      const { data: items, error: itemsError } = await supabaseAdmin
        .from('order_items')
        .select('*')
        .eq('order_id', orderId)
        .eq('company_id', auth.companyId);

      if (itemsError) {
        return NextResponse.json(
          { error: itemsError.message },
          { status: 500 }
        );
      }

      // Fetch product images and shipments in parallel (batch)
      const variationIds = (items || []).map(i => i.variation_id).filter(Boolean);
      const productIds = (items || []).map(i => i.product_id).filter(Boolean);
      const itemIds = (items || []).map(i => i.id);

      const [imagesResult, shipmentsResult, variationsResult] = await Promise.all([
        (variationIds.length > 0 || productIds.length > 0)
          ? supabaseAdmin
              .from('product_images')
              .select('product_id, variation_id, image_url, sort_order')
              .eq('company_id', auth.companyId)
              .or(
                [
                  variationIds.length > 0 ? `variation_id.in.(${variationIds.join(',')})` : '',
                  productIds.length > 0 ? `product_id.in.(${productIds.join(',')})` : ''
                ].filter(Boolean).join(',')
              )
              .order('sort_order', { ascending: true })
          : Promise.resolve({ data: [] as { product_id: string; variation_id: string; image_url: string }[] }),
        itemIds.length > 0
          ? supabaseAdmin
              .from('order_shipments')
              .select(`
                *,
                shipping_address:shipping_addresses (
                  id,
                  address_name,
                  contact_person,
                  phone,
                  address_line1,
                  district,
                  amphoe,
                  province,
                  postal_code
                )
              `)
              .in('order_item_id', itemIds)
              .eq('company_id', auth.companyId)
          : Promise.resolve({ data: [] as any[] }),
        variationIds.length > 0
          ? supabaseAdmin
              .from('product_variations')
              .select('id, sku, barcode')
              .in('id', variationIds)
          : Promise.resolve({ data: [] as { id: string; sku: string | null; barcode: string | null }[] }),
      ]);

      // Build image map: prefer variation image, fallback to product image
      const imageMap: Record<string, string> = {};
      const productImageMap: Record<string, string> = {};
      const variationImageMap: Record<string, string> = {};
      for (const img of imagesResult.data || []) {
        if (img.variation_id && !variationImageMap[img.variation_id]) {
          variationImageMap[img.variation_id] = img.image_url;
        }
        if (img.product_id && !productImageMap[img.product_id]) {
          productImageMap[img.product_id] = img.image_url;
        }
      }
      for (const item of items || []) {
        const image = variationImageMap[item.variation_id] || productImageMap[item.product_id];
        if (image) imageMap[item.id] = image;
      }

      // Build variation lookup for barcode/sku
      const variationLookup: Record<string, { sku: string | null; barcode: string | null }> = {};
      for (const v of variationsResult.data || []) {
        variationLookup[v.id] = { sku: v.sku, barcode: v.barcode };
      }

      // Group shipments by order_item_id
      const shipmentsByItem = new Map<string, any[]>();
      for (const shipment of shipmentsResult.data || []) {
        const key = shipment.order_item_id;
        if (!shipmentsByItem.has(key)) shipmentsByItem.set(key, []);
        shipmentsByItem.get(key)!.push(shipment);
      }

      const itemsWithShipments = (items || []).map(item => {
        const variation = variationLookup[item.variation_id] || {};
        return {
          ...item,
          image: imageMap[item.id] || null,
          sku: variation.sku || null,
          barcode: variation.barcode || null,
          shipments: shipmentsByItem.get(item.id) || [],
          promotion_components: item.promotion_components || [],
        };
      });

      // Enrich promotion items: use stored promotion_components from JSONB column,
      // only fetch promotion name/type from headers table
      const promoItems = itemsWithShipments.filter(i => i.promotion_id);
      if (promoItems.length > 0) {
        const uniquePromoIds = [...new Set(promoItems.map(i => i.promotion_id as string))];
        const { data: promoHeaders } = await supabaseAdmin
          .from('promotions').select('id, name, promotion_type, image').in('id', uniquePromoIds);
        const pMap: Record<string, { name: string; type: string; image: string | null }> = {};
        for (const h of promoHeaders || []) {
          pMap[h.id] = { name: h.name, type: h.promotion_type, image: h.image || null };
        }
        for (const item of itemsWithShipments) {
          if (item.promotion_id && pMap[item.promotion_id]) {
            const promo = pMap[item.promotion_id];
            (item as any).promotion_name = promo.name;
            (item as any).promotion_type = promo.type;
            // promotion_components already comes from select('*') on order_items
            if (!item.image) item.image = promo.image || (item.promotion_components as any)?.[0]?.image || null;
          }
        }
      }

      return NextResponse.json({
        order: {
          ...order,
          items: itemsWithShipments
        }
      });
    }

    // Otherwise, fetch orders list via single RPC call
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const sortBy = searchParams.get('sort_by') || 'created_at';
    const sortDir = searchParams.get('sort_dir') || 'desc';
    const search = searchParams.get('search') || null;
    const orderStatus = searchParams.get('status') || null;
    const paymentStatus = searchParams.get('payment_status') || null;
    const source = searchParams.get('source') || null;
    const createdBy = searchParams.get('created_by') || null;
    const channel = searchParams.get('channel') || null;
    const deliveryDateStart = searchParams.get('delivery_date_start') || null;
    const deliveryDateEnd = searchParams.get('delivery_date_end') || null;
    const customerId = searchParams.get('customer_id') || null;
    const shippingCarrier = searchParams.get('shipping_carrier') || null;
    const printFilter = searchParams.get('print_filter') || null;
    const excludePaymentStatus = searchParams.get('exclude_payment_status') || null;
    const orderType = searchParams.get('order_type') || null;
    const platform = searchParams.get('platform') || null;
    const flowType = searchParams.get('flow_type') || null;
    const excludeFlowTypes = searchParams.get('exclude_flow_types') || null; // comma-separated
    const customerTypeFilter = searchParams.get('customer_type') || null;

    // Lightweight: return only IDs matching the current filters (for "select all")
    if (searchParams.get('ids_only') === 'true') {
      let query = supabaseAdmin
        .from('orders')
        .select('id')
        .eq('company_id', auth.companyId)
        .neq('order_status', 'cancelled');

      if (orderStatus) query = query.eq('order_status', orderStatus);
      if (paymentStatus) query = query.eq('payment_status', paymentStatus);
      if (excludePaymentStatus) query = query.neq('payment_status', excludePaymentStatus);
      if (source === 'exclude_pos') {
        query = query.or('source.is.null,source.neq.pos');
      } else if (source) {
        query = query.eq('source', source);
      }
      if (customerId) query = query.eq('customer_id', customerId);
      if (excludeFlowTypes) {
        for (const ft of excludeFlowTypes.split(',')) {
          query = query.neq('flow_type', ft.trim());
        }
      }

      // Shipping carrier filter (matches RPC logic)
      if (shippingCarrier === '__on_hold__') {
        query = query.eq('fulfillment_status', 'on_hold');
      } else if (shippingCarrier === '__active__') {
        query = query.or('fulfillment_status.is.null,fulfillment_status.neq.on_hold');
      } else if (shippingCarrier === '__none__') {
        query = query.is('shipping_carrier', null).neq('fulfillment_status', 'on_hold');
      } else if (shippingCarrier) {
        query = query.eq('shipping_carrier', shippingCarrier).neq('fulfillment_status', 'on_hold');
      }

      const { data: rows, error: idsError } = await query.limit(5000);
      if (idsError) {
        return NextResponse.json({ error: idsError.message }, { status: 500 });
      }
      return NextResponse.json({ ids: (rows || []).map((r: { id: string }) => r.id) });
    }

    // Build RPC params — new params (p_order_type, p_platform) only sent when non-null
    // to stay backward-compatible with older RPC versions that don't have them
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rpcParams: any = {
      p_company_id: auth.companyId,
      p_page: page,
      p_limit: limit,
      p_sort_by: sortBy,
      p_sort_dir: sortDir,
      p_search: search,
      p_order_status: orderStatus,
      p_payment_status: paymentStatus,
      p_source: source,
      p_created_by: createdBy,
      p_channel: channel,
      p_delivery_date_start: deliveryDateStart,
      p_delivery_date_end: deliveryDateEnd,
      p_customer_id: customerId,
      p_shipping_carrier: shippingCarrier,
      p_print_filter: printFilter,
      p_exclude_payment_status: excludePaymentStatus,
    };
    if (orderType) rpcParams.p_order_type = orderType;
    if (platform) rpcParams.p_platform = platform;
    if (flowType) rpcParams.p_flow_type = flowType;
    if (excludeFlowTypes) rpcParams.p_exclude_flow_types = excludeFlowTypes;

    const { data: result, error: rpcError } = await supabaseAdmin.rpc('get_orders_list', rpcParams);

    if (rpcError) {
      console.error('RPC get_orders_list error:', rpcError);
      return NextResponse.json(
        { error: rpcError.message },
        { status: 500 }
      );
    }

    // Post-RPC: filter flow types if PostgREST schema cache hasn't reloaded yet
    if (result?.orders) {
      const allOrders = result.orders as any[];
      let filtered = allOrders;
      let needsFilter = false;

      if (flowType) {
        const allowedFlows = new Set(flowType.split(',').map((s: string) => s.trim()));
        const before = filtered.length;
        filtered = filtered.filter((o: any) => allowedFlows.has(o.flow_type));
        if (filtered.length < before) needsFilter = true;
      }
      if (excludeFlowTypes) {
        const excludeSet = new Set(excludeFlowTypes.split(',').map((s: string) => s.trim()));
        const before = filtered.length;
        filtered = filtered.filter((o: any) => !excludeSet.has(o.flow_type));
        if (filtered.length < before) needsFilter = true;
      }

      if (needsFilter) {
        result.orders = filtered;
        // RPC counts are wrong — query correct counts directly
        let countQuery = supabaseAdmin
          .from('orders')
          .select('order_status', { count: 'exact', head: false })
          .eq('company_id', auth.companyId);
        if (source === 'exclude_pos') countQuery = countQuery.neq('source', 'pos');
        if (flowType) countQuery = countQuery.in('flow_type', flowType.split(','));
        if (excludeFlowTypes) {
          for (const ft of excludeFlowTypes.split(',')) {
            countQuery = countQuery.neq('flow_type', ft.trim());
          }
        }
        const { data: countRows } = await countQuery;
        if (countRows) {
          const sc: Record<string, number> = { all: countRows.length, new: 0, ready_to_ship: 0, processing: 0, shipping: 0, completed: 0, cancelled: 0 };
          for (const r of countRows) {
            const s = (r as any).order_status;
            if (sc[s] !== undefined) sc[s]++;
          }
          result.statusCounts = sc;
        }
        result.pagination.total = filtered.length;
        result.pagination.totalPages = Math.ceil(filtered.length / Math.max(limit, 1));
      }
    }

    // Filter by customer_type if provided (post-RPC filter)
    if (customerTypeFilter && result?.orders) {
      const filterTypes = customerTypeFilter.split(',');
      // Get all customer IDs matching the filter types
      const { data: matchingCustomers } = await supabaseAdmin
        .from('customers')
        .select('id')
        .eq('company_id', auth.companyId)
        .in('customer_type', filterTypes);
      const validCustIds = new Set((matchingCustomers || []).map((c: { id: string }) => c.id));

      // Filter orders
      result.orders = (result.orders as any[]).filter((o: any) => validCustIds.has(o.customer_id));
      result.total = result.orders.length;

      // Recalculate statusCounts from ALL orders of this customer_type (not just current page/status)
      const flowTypes = flowType ? flowType.split(',') : null;
      let countQuery = supabaseAdmin
        .from('orders')
        .select('order_status')
        .eq('company_id', auth.companyId)
        .in('customer_id', [...validCustIds]);
      if (flowTypes) countQuery = countQuery.in('flow_type', flowTypes);
      const { data: allStatusRows } = await countQuery;
      if (allStatusRows) {
        const counts: Record<string, number> = { all: allStatusRows.length };
        for (const row of allStatusRows) {
          counts[row.order_status] = (counts[row.order_status] || 0) + 1;
        }
        result.statusCounts = counts;
      }
    }

    // Enrich orders with tax_invoice_doc_type from document tables
    const orderIds = (result?.orders || []).map((o: any) => o.id).filter(Boolean);
    if (orderIds.length > 0) {
      const [abbRows, taxRows, recRows] = await Promise.all([
        supabaseAdmin.from('abbreviated_invoices')
          .select('order_id, voided_at')
          .in('order_id', orderIds)
          .eq('company_id', auth.companyId),
        supabaseAdmin.from('tax_invoices')
          .select('source_id')
          .eq('source_type', 'order')
          .in('source_id', orderIds)
          .eq('company_id', auth.companyId),
        supabaseAdmin.from('receipts')
          .select('source_id')
          .eq('source_type', 'order')
          .in('source_id', orderIds)
          .eq('company_id', auth.companyId),
      ]);

      const taxSet = new Set((taxRows.data || []).map((r: any) => r.source_id));
      const recSet = new Set((recRows.data || []).map((r: any) => r.source_id));
      const abbMap = new Map<string, { hasActive: boolean; hasVoided: boolean }>();
      for (const r of abbRows.data || []) {
        const cur = abbMap.get(r.order_id) || { hasActive: false, hasVoided: false };
        if (r.voided_at) cur.hasVoided = true; else cur.hasActive = true;
        abbMap.set(r.order_id, cur);
      }

      for (const order of result.orders) {
        if (taxSet.has(order.id)) {
          order.tax_invoice_doc_type = 'tax';
        } else if (abbMap.has(order.id) && abbMap.get(order.id)!.hasActive) {
          order.tax_invoice_doc_type = 'abbreviated';
        } else if (recSet.has(order.id)) {
          order.tax_invoice_doc_type = 'receipt';
        }
      }

      // Optional: delivery area snapshot (opt-in — หน้า /orders ไม่ต้องใช้)
      // ใช้ในการ์ดประวัติออเดอร์ของหน้าแชท เพื่อบอกปลายทางจริงแทนชื่อที่อยู่ทั่วไป
      if (searchParams.get('include_delivery') === 'true') {
        const { data: deliveryRows, error: deliveryError } = await supabaseAdmin
          .from('orders')
          .select('id, delivery_district, delivery_amphoe, delivery_province')
          .eq('company_id', auth.companyId)
          .in('id', orderIds);
        if (deliveryError) {
          console.error('Delivery area enrichment error:', deliveryError.message);
        } else {
          const deliveryMap = new Map((deliveryRows || []).map((r: any) => [r.id, r]));
          for (const order of result.orders) {
            const d = deliveryMap.get(order.id);
            if (!d) continue;
            order.delivery_district = d.delivery_district;
            order.delivery_amphoe = d.delivery_amphoe;
            order.delivery_province = d.delivery_province;
          }
        }
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - Update order (full update with items and shipments)
export async function PUT(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // --- Bulk actions (accept/cancel/hold/unhold/ship) ---
    const bulkIds = body.ids || (body.items ? body.items.map((i: any) => i.id) : null);
    if (body.action && bulkIds && Array.isArray(bulkIds)) {
      const { action, hold_reason } = body;
      const validIds = bulkIds.filter((id: string) => id);
      if (validIds.length === 0) {
        return NextResponse.json({ error: 'No valid order IDs provided' }, { status: 400 });
      }

      if (action === 'bulk_accept') {
        // Accept orders in ready_to_ship OR new (credit flow) status
        const { data: ordersToAccept } = await supabaseAdmin
          .from('orders')
          .select('id, source, external_order_sn, external_status, marketplace_account_id, is_split, payment_status, flow_type, order_status')
          .in('id', validIds)
          .eq('company_id', auth.companyId)
          .in('order_status', ['ready_to_ship', 'new']);

        // Credit flow orders can skip to processing from 'new'
        const creditFlowTypes = ['w_credit', 'c_consign', 'd_statement'];
        const manualOrders = (ordersToAccept || []).filter(o => o.source !== 'shopee' && (
          o.order_status === 'ready_to_ship' ||
          (o.order_status === 'new' && creditFlowTypes.includes(o.flow_type || ''))
        ));
        const shopeeOrders = (ordersToAccept || []).filter(o => o.source === 'shopee' && o.order_status === 'ready_to_ship');

        // Split manual orders: verifying vs others
        const verifyingIds = manualOrders.filter(o => o.payment_status === 'verifying').map(o => o.id);
        const nonVerifyingIds = manualOrders.filter(o => o.payment_status !== 'verifying').map(o => o.id);

        let updatedCount = 0;
        const errors: string[] = [];

        // Manual orders (non-verifying): just update order_status
        if (nonVerifyingIds.length > 0) {
          const { data: updated, error } = await supabaseAdmin
            .from('orders')
            .update({ order_status: 'processing', updated_at: new Date().toISOString() })
            .in('id', nonVerifyingIds)
            .eq('company_id', auth.companyId)
            .select('id');
          if (error) errors.push(error.message);
          else updatedCount += (updated || []).length;
        }

        // Manual orders (verifying): update order_status + payment_status
        if (verifyingIds.length > 0) {
          const { data: updated, error } = await supabaseAdmin
            .from('orders')
            .update({ order_status: 'processing', payment_status: 'paid', updated_at: new Date().toISOString() })
            .in('id', verifyingIds)
            .eq('company_id', auth.companyId)
            .select('id');
          if (error) errors.push(error.message);
          else updatedCount += (updated || []).length;

          // Also mark payment records as verified
          if (!error) {
            await supabaseAdmin
              .from('payment_records')
              .update({ status: 'verified', updated_at: new Date().toISOString() })
              .in('order_id', verifyingIds)
              .eq('status', 'pending');
          }
        }

        // Shopee orders: call Shopee ship API for each
        if (shopeeOrders.length > 0) {
          const { ensureValidToken, getShippingParameter, shipOrder } = await import('@/lib/shopee/api');
          for (const order of shopeeOrders) {
            try {
              if (order.external_status !== 'READY_TO_SHIP') {
                errors.push(`${order.external_order_sn}: สถานะไม่ถูกต้อง (${order.external_status})`);
                continue;
              }
              // Fetch Shopee account
              const { data: account } = await supabaseAdmin
                .from('marketplace_accounts')
                .select('*')
                .eq('id', order.marketplace_account_id)
                .eq('company_id', auth.companyId)
                .eq('is_active', true)
                .single();
              if (!account) { errors.push(`${order.external_order_sn}: ไม่พบบัญชี Shopee`); continue; }

              const creds = await ensureValidToken(account);
              const { data: shippingParams, error: paramError } = await getShippingParameter(creds, order.external_order_sn);
              if (paramError) { errors.push(`${order.external_order_sn}: ${paramError}`); continue; }

              const params = shippingParams as any;

              // For split orders, ship each parcel separately with package_number
              const packageNumbers: string[] = [];
              if (order.is_split) {
                const { data: parcels } = await supabaseAdmin
                  .from('order_parcels')
                  .select('package_number')
                  .eq('order_id', order.id)
                  .order('parcel_number');
                for (const p of parcels || []) {
                  if (p.package_number) packageNumbers.push(p.package_number);
                }
              }

              // Ship function — reused for each parcel or once for non-split
              const doShip = async (packageNumber?: string) => {
                if (params?.info_needed?.dropoff?.length > 0) {
                  const dropoffParams: Record<string, unknown> = {};
                  if (params.dropoff?.branch_list?.[0]) dropoffParams.branch_id = params.dropoff.branch_list[0].branch_id;
                  return shipOrder(creds, order.external_order_sn!, undefined, dropoffParams, packageNumber);
                } else {
                  const pickupAddress = params?.pickup?.address_list?.[0];
                  if (!pickupAddress) return { error: 'ไม่พบที่อยู่รับพัสดุ', data: null };
                  const timeSlots = pickupAddress.time_slot_list || [];
                  const recommended = timeSlots.find((s: any) => s.flags?.includes('recommended'));
                  const selectedTimeId = (recommended || timeSlots[0])?.pickup_time_id || '';
                  return shipOrder(creds, order.external_order_sn!, { address_id: pickupAddress.address_id, pickup_time_id: selectedTimeId }, undefined, packageNumber);
                }
              };

              let shipResult;
              if (packageNumbers.length > 0) {
                // Ship each parcel
                let allOk = true;
                for (const pn of packageNumbers) {
                  const result = await doShip(pn);
                  if (result.error) {
                    errors.push(`${order.external_order_sn} (parcel ${pn}): ${result.error}`);
                    allOk = false;
                  }
                }
                if (!allOk) continue;
                shipResult = { error: null };
              } else {
                shipResult = await doShip();
              }

              if (shipResult.error) { errors.push(`${order.external_order_sn}: ${shipResult.error}`); continue; }

              // Update DB
              await supabaseAdmin
                .from('orders')
                .update({ external_status: 'PROCESSED', order_status: 'processing', updated_at: new Date().toISOString() })
                .eq('id', order.id)
                .eq('company_id', auth.companyId);
              updatedCount++;
            } catch (err) {
              errors.push(`${order.external_order_sn}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }
        }

        // --- Auto-issue documents for all accepted orders ---
        {
          const { autoIssueDocument } = await import('@/lib/invoice-service');
          const allAcceptedIds = [...nonVerifyingIds, ...verifyingIds,
            ...shopeeOrders.map(o => o.id)];
          for (const oid of allAcceptedIds) {
            autoIssueDocument(oid, auth.companyId!).catch(() => {});
          }
        }

        return NextResponse.json({
          success: true,
          updated: updatedCount,
          ...(errors.length > 0 ? { errors } : {}),
        });
      }

      if (action === 'bulk_cancel') {
        // Cancel orders + handle stock (unreserve for new/ready_to_ship)
        const { data: ordersToCancel } = await supabaseAdmin
          .from('orders')
          .select('id, order_status, warehouse_id')
          .in('id', validIds)
          .eq('company_id', auth.companyId)
          .neq('order_status', 'cancelled');

        let cancelledCount = 0;
        for (const order of ordersToCancel || []) {
          const { error } = await supabaseAdmin
            .from('orders')
            .update({
              order_status: 'cancelled',
              payment_status: 'cancelled',
              fulfillment_status: 'pending',
              hold_reason: null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', order.id)
            .eq('company_id', auth.companyId);
          if (!error) cancelledCount++;

          // Stock return/unreserve based on order status
          if (!error && order.warehouse_id) {
            const wasShipped = ['shipping', 'completed'].includes(order.order_status);
            const wasReserved = ['new', 'ready_to_ship', 'processing'].includes(order.order_status);
            if (wasShipped || wasReserved) {
              try {
                const { data: orderItems } = await supabaseAdmin
                  .from('order_items')
                  .select('variation_id, quantity, promotion_id, promotion_components')
                  .eq('order_id', order.id)
                  .eq('company_id', auth.companyId);
                for (const oi of orderItems || []) {
                  if (!oi.variation_id) continue;
                  const stockFn = wasShipped ? returnStock : unreserveStock;
                  const notes = wasShipped ? 'Return stock for cancelled order' : 'Unreserve for cancelled order';

                  if (oi.promotion_id && oi.promotion_components?.length) {
                    // Promotion item: reverse stock for each stored component
                    for (const comp of oi.promotion_components as any[]) {
                      if (!comp.variation_id) continue;
                      try {
                        // Resolve product-level items
                        let varId = comp.variation_id;
                        const { data: checkVar } = await supabaseAdmin.from('product_variations').select('id').eq('id', varId).maybeSingle();
                        if (!checkVar) {
                          const { data: firstVar } = await supabaseAdmin.from('product_variations').select('id').eq('product_id', varId).limit(1).maybeSingle();
                          if (firstVar) varId = firstVar.id; else continue;
                        }
                        await stockFn({
                          supabase: supabaseAdmin,
                          companyId: auth.companyId!,
                          warehouseId: order.warehouse_id,
                          variationId: varId,
                          qty: comp.quantity * oi.quantity,
                          referenceType: 'order',
                          referenceId: order.id,
                          notes: `${notes} (promo component)`,
                          createdBy: auth.userId,
                        });
                      } catch (promoErr) {
                        console.error('[CANCEL] Error reversing promo component stock:', promoErr);
                      }
                    }
                  } else {
                    await stockFn({
                      supabase: supabaseAdmin,
                      companyId: auth.companyId!,
                      warehouseId: order.warehouse_id,
                      variationId: oi.variation_id,
                      qty: oi.quantity,
                      referenceType: 'order',
                      referenceId: order.id,
                      notes,
                      createdBy: auth.userId,
                    });
                  }
                }
              } catch (e) {
                console.error('[BULK CANCEL] Stock error for order', order.id, e);
              }
            }
          }
        }
        return NextResponse.json({ success: true, cancelled: cancelledCount });
      }

      if (action === 'hold') {
        const { error } = await supabaseAdmin
          .from('orders')
          .update({
            fulfillment_status: 'on_hold',
            hold_reason: hold_reason || null,
            updated_at: new Date().toISOString(),
          })
          .in('id', validIds)
          .eq('company_id', auth.companyId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      if (action === 'unhold') {
        const { error } = await supabaseAdmin
          .from('orders')
          .update({
            fulfillment_status: 'pending',
            hold_reason: null,
            updated_at: new Date().toISOString(),
          })
          .in('id', validIds)
          .eq('company_id', auth.companyId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ success: true });
      }

      if (action === 'bulk_ship') {
        // processing → shipping with per-order tracking info
        const { items, tracking_number, shipping_carrier } = body;

        // Build per-order tracking map from items array
        const trackingMap: Record<string, { tracking_number?: string; shipping_carrier?: string }> = {};
        if (items && Array.isArray(items)) {
          for (const item of items) {
            trackingMap[item.id] = {
              tracking_number: item.tracking_number || null,
              shipping_carrier: item.shipping_carrier || null,
            };
          }
        }

        // Fetch orders to process stock deduction
        const { data: ordersToShip, error: fetchErr } = await supabaseAdmin
          .from('orders')
          .select('id, order_status, warehouse_id, is_split, source, marketplace_account_id')
          .in('id', validIds)
          .eq('company_id', auth.companyId)
          .eq('order_status', 'processing');

        console.log('[BULK_SHIP] validIds:', validIds, 'found:', ordersToShip?.length, 'fetchErr:', fetchErr?.message);

        let shippedCount = 0;
        const allVarIds: string[] = [];

        for (const order of ordersToShip || []) {
          // Per-order tracking takes precedence, fallback to shared values
          const orderTracking = trackingMap[order.id] || {};
          const tn = orderTracking.tracking_number || tracking_number || null;
          const sc = orderTracking.shipping_carrier || shipping_carrier || null;

          // Manual orders (no marketplace) → completed directly (no webhook)
          // Marketplace orders → shipping (webhook will update to completed)
          const isManual = !order.marketplace_account_id;
          const targetStatus = isManual ? 'completed' : 'shipping';

          const updatePayload: any = {
            order_status: targetStatus,
            fulfillment_status: 'shipped',
            shipped_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          if (tn) updatePayload.tracking_number = tn;
          if (sc) updatePayload.shipping_carrier = sc;

          const { error } = await supabaseAdmin
            .from('orders')
            .update(updatePayload)
            .eq('id', order.id)
            .eq('company_id', auth.companyId);
          console.log('[BULK_SHIP] order:', order.id, 'target:', targetStatus, 'error:', error?.message);
          if (!error) {
            shippedCount++;
            // For split orders, also update all parcels with tracking info
            if (order.is_split && (tn || sc)) {
              await supabaseAdmin
                .from('order_parcels')
                .update({
                  ...(tn ? { tracking_number: tn } : {}),
                  ...(sc ? { shipping_carrier: sc } : {}),
                  status: 'shipped',
                  updated_at: new Date().toISOString(),
                })
                .eq('order_id', order.id);
            }
          }

          // Stock deduction (best-effort)
          if (!error && order.warehouse_id) {
            try {
              const stockConfig = await getStockConfig(auth.companyId!);
              if (stockConfig.stockEnabled) {
                const { data: orderItems } = await supabaseAdmin
                  .from('order_items')
                  .select('variation_id, quantity, promotion_id, promotion_components')
                  .eq('order_id', order.id)
                  .eq('company_id', auth.companyId);
                for (const oi of orderItems || []) {
                  if (!oi.variation_id) continue;
                  try {
                    if (oi.promotion_id && oi.promotion_components?.length) {
                      for (const comp of oi.promotion_components as any[]) {
                        if (!comp.variation_id) continue;
                        let varId = comp.variation_id;
                        const { data: checkVar } = await supabaseAdmin.from('product_variations').select('id').eq('id', varId).maybeSingle();
                        if (!checkVar) {
                          const { data: firstVar } = await supabaseAdmin.from('product_variations').select('id').eq('product_id', varId).limit(1).maybeSingle();
                          if (firstVar) varId = firstVar.id; else continue;
                        }
                        await deductAndUnreserve({
                          supabase: supabaseAdmin,
                          companyId: auth.companyId!,
                          warehouseId: order.warehouse_id,
                          variationId: varId,
                          qty: comp.quantity * oi.quantity,
                          referenceType: 'order',
                          referenceId: order.id,
                          notes: 'Deduct for bulk shipment (promo component)',
                          createdBy: auth.userId,
                        });
                        allVarIds.push(varId);
                      }
                    } else {
                      await deductAndUnreserve({
                        supabase: supabaseAdmin,
                        companyId: auth.companyId!,
                        warehouseId: order.warehouse_id,
                        variationId: oi.variation_id,
                        qty: oi.quantity,
                        referenceType: 'order',
                        referenceId: order.id,
                        notes: 'Deduct for bulk shipment',
                        createdBy: auth.userId,
                      });
                      allVarIds.push(oi.variation_id);
                    }
                  } catch (e) {
                    console.error('[BULK SHIP] Stock error', e);
                  }
                }
              }
            } catch (e) {
              console.error('[BULK SHIP] Stock config error', e);
            }
          }
        }

        // Auto-sync stock to Shopee
        if (allVarIds.length > 0) {
          import('@/lib/shopee/auto-sync').then(m => m.triggerShopeeStockSync(allVarIds)).catch(() => {});
        }

        // Auto-issue documents for shipped orders (Flow B: TAX/DN, Flow A completed: ABB/REC)
        const { autoIssueDocument } = await import('@/lib/invoice-service');
        for (const order of ordersToShip || []) {
          autoIssueDocument(order.id, auth.companyId!).catch(() => {});
        }

        return NextResponse.json({ success: true, shipped: shippedCount });
      }

      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }

    // --- Single order update ---
    const { id, items, delivery_date, payment_method, discount_amount, notes, internal_notes, sales_channel_id } = body;
    const hasDeliveryZoneSlot = body.delivery_zone_id !== undefined || body.delivery_slot_id !== undefined;

    if (!id) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Check if order exists and is editable (only 'new' status can be fully edited)
    const { data: existingOrder, error: fetchError } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, customer_id, flow_type')
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .single();

    if (fetchError || !existingOrder) {
      return NextResponse.json(
        { error: 'Order not found' },
        { status: 404 }
      );
    }

    // --- set_tax_invoice action (single order) ---
    if (body.action === 'set_tax_invoice') {
      const { tax_invoice_name, tax_invoice_tax_id, tax_invoice_branch, tax_invoice_address } = body;
      if (!tax_invoice_name || !tax_invoice_tax_id) {
        return NextResponse.json({ error: 'ชื่อกิจการและเลขผู้เสียภาษีจำเป็นต้องกรอก' }, { status: 400 });
      }

      // Get company VAT status
      const { data: companyData } = await supabaseAdmin
        .from('companies').select('vat_registered').eq('id', auth.companyId).single();
      const vatRegistered = companyData?.vat_registered ?? false;

      // Generate number via RPC (monthly, thread-safe)
      const rpcName = vatRegistered ? 'generate_tax_invoice_number' : 'generate_receipt_number';
      const docType = vatRegistered ? 'tax' : 'receipt';
      const { data: invoiceNumber, error: rpcErr } = await supabaseAdmin
        .rpc(rpcName, { p_company_id: auth.companyId });
      if (rpcErr || !invoiceNumber) {
        return NextResponse.json({ error: 'ไม่สามารถสร้างเลขเอกสารได้' }, { status: 500 });
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];

      // Save tax info on order (customer request fields — NOT document tracking)
      await supabaseAdmin
        .from('orders')
        .update({
          tax_invoice_requested: true,
          tax_invoice_name,
          tax_invoice_tax_id,
          tax_invoice_branch: tax_invoice_branch || null,
          tax_invoice_address: tax_invoice_address || null,
          updated_at: now.toISOString(),
        })
        .eq('id', id)
        .eq('company_id', auth.companyId);

      // Update customer tax fields (for future pre-fill)
      if (existingOrder.customer_id) {
        await supabaseAdmin
          .from('customers')
          .update({
            tax_company_name: tax_invoice_name,
            tax_id: tax_invoice_tax_id,
            tax_branch: tax_invoice_branch || null,
            billing_address: tax_invoice_address || null,
            updated_at: now.toISOString(),
          })
          .eq('id', existingOrder.customer_id);
      }

      // Insert into document table (single source of truth)
      const { data: oi } = await supabaseAdmin
        .from('orders').select('total_amount, vat_amount').eq('id', id).single();
      if (docType === 'tax') {
        const { insertTaxInvoice } = await import('@/lib/invoice-service');
        await insertTaxInvoice({
          company_id: auth.companyId!, invoice_number: invoiceNumber, invoice_date: dateStr,
          source_type: 'order', source_id: id, customer_id: existingOrder.customer_id,
          customer_name: tax_invoice_name, customer_tax_id: tax_invoice_tax_id,
          customer_branch: tax_invoice_branch || null, customer_address: tax_invoice_address || null,
          total_amount: oi?.total_amount ?? 0, vat_amount: oi?.vat_amount ?? 0,
          is_receipt: false,
        });
      } else {
        const { insertReceipt } = await import('@/lib/invoice-service');
        await insertReceipt({
          company_id: auth.companyId!, receipt_number: invoiceNumber, receipt_date: dateStr,
          source_type: 'order', source_id: id, customer_id: existingOrder.customer_id,
          customer_name: tax_invoice_name, customer_address: tax_invoice_address || null,
          total_amount: oi?.total_amount ?? 0,
        });
      }

      return NextResponse.json({
        success: true,
        order: {
          id,
          tax_invoice_requested: true,
          tax_invoice_doc_type: docType,
          tax_invoice_number: invoiceNumber,
          tax_invoice_date: dateStr,
          tax_invoice_name,
          tax_invoice_tax_id,
          tax_invoice_branch,
          tax_invoice_address,
        },
      });
    }

    // --- set_abbreviated_invoice: ออกใบกำกับอย่างย่อ (ABB) / ใบเสร็จ (REC) ---
    if (body.action === 'set_abbreviated_invoice') {
      const { issueAbbreviatedInvoice } = await import('@/lib/invoice-service');
      const result = await issueAbbreviatedInvoice(id, auth.companyId!);
      if (!result.success) {
        return NextResponse.json({ error: result.error || 'ไม่สามารถสร้างเลขเอกสารได้' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        order: {
          id,
          tax_invoice_doc_type: result.docType,
          tax_invoice_number: result.invoiceNumber,
          tax_invoice_date: new Date().toISOString().split('T')[0],
        },
      });
    }

    // --- void_abbreviated_invoice: void ABB แล้วออก TAX ใหม่ ---
    if (body.action === 'void_abbreviated_invoice') {
      const { tax_invoice_name, tax_invoice_tax_id, tax_invoice_branch, tax_invoice_address } = body;
      if (!tax_invoice_name || !tax_invoice_tax_id) {
        return NextResponse.json({ error: 'ชื่อกิจการและเลขผู้เสียภาษีจำเป็นต้องกรอก' }, { status: 400 });
      }

      // 1. ดึง ABB จาก document table
      const { data: abbRow } = await supabaseAdmin
        .from('abbreviated_invoices')
        .select('id, invoice_number, voided_at')
        .eq('order_id', id)
        .eq('company_id', auth.companyId)
        .is('voided_at', null)
        .maybeSingle();

      if (!abbRow) {
        return NextResponse.json({ error: 'ไม่พบใบกำกับอย่างย่อที่จะ void' }, { status: 400 });
      }

      const abbrevNumber = abbRow.invoice_number;

      // 2. ออกเลข TAX ใหม่
      const { data: newInvoiceNumber, error: rpcErr } = await supabaseAdmin
        .rpc('generate_tax_invoice_number', { p_company_id: auth.companyId });
      if (rpcErr || !newInvoiceNumber) {
        return NextResponse.json({ error: 'ไม่สามารถสร้างเลขเอกสารได้' }, { status: 500 });
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];

      // 3. Save tax info on order (customer request fields)
      await supabaseAdmin
        .from('orders')
        .update({
          tax_invoice_requested: true,
          tax_invoice_name,
          tax_invoice_tax_id,
          tax_invoice_branch: tax_invoice_branch || null,
          tax_invoice_address: tax_invoice_address || null,
          updated_at: now.toISOString(),
        })
        .eq('id', id)
        .eq('company_id', auth.companyId);

      if (existingOrder.customer_id) {
        await supabaseAdmin.from('customers').update({
          tax_company_name: tax_invoice_name,
          tax_id: tax_invoice_tax_id,
          tax_branch: tax_invoice_branch || null,
          billing_address: tax_invoice_address || null,
          updated_at: now.toISOString(),
        }).eq('id', existingOrder.customer_id);
      }

      // 4. Void ABB in document table
      await supabaseAdmin.from('abbreviated_invoices')
        .update({ voided_at: now.toISOString(), voided_reason: 'replaced_by_full' })
        .eq('id', abbRow.id);

      // 5. Insert new TAX in document table
      const { insertTaxInvoice } = await import('@/lib/invoice-service');
      const { data: oi } = await supabaseAdmin
        .from('orders').select('total_amount, vat_amount').eq('id', id).single();
      await insertTaxInvoice({
        company_id: auth.companyId!, invoice_number: newInvoiceNumber, invoice_date: dateStr,
        source_type: 'order', source_id: id, customer_id: existingOrder.customer_id,
        customer_name: tax_invoice_name, customer_tax_id: tax_invoice_tax_id,
        customer_branch: tax_invoice_branch || null, customer_address: tax_invoice_address || null,
        total_amount: oi?.total_amount ?? 0, vat_amount: oi?.vat_amount ?? 0,
        is_receipt: false,
      });

      // 6. Set cross-references ABB ↔ TAX
      const { data: taxRow } = await supabaseAdmin.from('tax_invoices')
        .select('id').eq('company_id', auth.companyId).eq('invoice_number', newInvoiceNumber).single();
      if (taxRow) {
        await supabaseAdmin.from('abbreviated_invoices')
          .update({ replaced_by_tax_id: taxRow.id }).eq('id', abbRow.id);
        await supabaseAdmin.from('tax_invoices')
          .update({ replaces_abbreviated_id: abbRow.id }).eq('id', taxRow.id);
      }

      return NextResponse.json({
        success: true,
        voided_number: abbrevNumber,
        order: {
          id,
          tax_invoice_requested: true,
          tax_invoice_doc_type: 'tax',
          tax_invoice_number: newInvoiceNumber,
          tax_invoice_date: dateStr,
          tax_invoice_name,
          tax_invoice_tax_id,
          tax_invoice_branch,
          tax_invoice_address,
          tax_invoice_replaced_abbrev_number: abbrevNumber,
        },
      });
    }

    // Allow editing only for 'new' orders, or allow simple status updates for any order
    const isFullUpdate = items && Array.isArray(items);
    if (isFullUpdate && existingOrder.order_status !== 'new') {
      return NextResponse.json(
        { error: `Cannot edit order items with status: ${existingOrder.order_status}. Only 'new' orders can be fully edited.` },
        { status: 400 }
      );
    }

    // If items are provided, this is a full update (delete old items/shipments and create new ones)
    if (items && Array.isArray(items)) {
      // Validate items structure
      if (items.length === 0) {
        return NextResponse.json(
          { error: 'Order must have at least one item' },
          { status: 400 }
        );
      }

      // Validate shipments only when the user actually attached a shipping
      // address (chat-order flow: address may be filled by the customer later).
      const anyHasShipments = items.some((i: any) => Array.isArray(i.shipments) && i.shipments.length > 0);
      if (anyHasShipments) {
        for (const item of items) {
          if (!item.shipments || item.shipments.length === 0) {
            return NextResponse.json(
              { error: 'Each item must have at least one shipment' },
              { status: 400 }
            );
          }

          const totalShipmentQty = item.shipments.reduce((sum: number, s: any) => sum + s.quantity, 0);
          if (totalShipmentQty !== item.quantity) {
            return NextResponse.json(
              { error: `Total shipment quantity (${totalShipmentQty}) does not match item quantity (${item.quantity})` },
              { status: 400 }
            );
          }
        }
      }

      // Calculate totals
      let subtotal = 0;
      const itemsWithTotals = items.map((item: any) => {
        // Support both discount_percent (legacy) and discount_value/discount_type (new)
        let discountPercent = 0;
        let discountAmountItem = 0;
        const itemSubtotal = item.quantity * item.unit_price;

        if (item.discount_type === 'amount' && item.discount_value) {
          discountAmountItem = item.discount_value;
          discountPercent = itemSubtotal > 0 ? (discountAmountItem / itemSubtotal) * 100 : 0;
        } else {
          discountPercent = item.discount_value || item.discount_percent || 0;
          discountAmountItem = itemSubtotal * (discountPercent / 100);
        }

        const itemTotal = itemSubtotal - discountAmountItem;
        subtotal += itemTotal;
        return {
          ...item,
          discount_percent: discountPercent,
          discount_amount: discountAmountItem,
          discount_type: item.discount_type || 'percent',
          subtotal: itemSubtotal,
          total: itemTotal
        };
      });

      console.log('[UPDATE ORDER] items count:', items.length, 'subtotal:', subtotal, 'items:', items.map((i: any) => ({ name: i.product_name, qty: i.quantity, price: i.unit_price, address: i.shipments?.[0]?.shipping_address_id })));

      // Calculate total shipping fee (deduplicated by address)
      const shippingFeeByAddress = new Map<string, number>();
      items.forEach((item: any) => {
        item.shipments.forEach((s: any) => {
          if (s.shipping_fee && !shippingFeeByAddress.has(s.shipping_address_id)) {
            shippingFeeByAddress.set(s.shipping_address_id, s.shipping_fee);
          }
        });
      });
      const totalShippingFee = Array.from(shippingFeeByAddress.values()).reduce((sum, f) => sum + f, 0);

      const orderDiscountAmount = discount_amount || 0;

      // Check if company is VAT registered
      const { data: companyInfoUpdate } = await supabaseAdmin
        .from('companies')
        .select('vat_registered')
        .eq('id', auth.companyId)
        .single();
      const isVatRegisteredUpdate = companyInfoUpdate?.vat_registered || false;

      // การ์ดอวยพร — เหมือนตอนสร้าง: ค่าการ์ดอ่านจาก settings ร้าน ไม่รับจาก client
      const giftRequestedUpd = !!body.gift_card_requested;
      let giftFeeUpd = 0;
      if (giftRequestedUpd) {
        const { data: giftRow } = await supabaseAdmin
          .from('companies').select('settings').eq('id', auth.companyId).single();
        const gc = parseGiftCard(giftRow?.settings as Record<string, unknown> | null);
        giftFeeUpd = gc.enabled ? gc.fee : 0;
      }

      // Prices are VAT-inclusive (if VAT registered), so we reverse-calculate VAT from the total
      const totalWithVAT = subtotal - orderDiscountAmount + totalShippingFee + giftFeeUpd;
      const subtotalBeforeVAT = isVatRegisteredUpdate ? Math.round((totalWithVAT / 1.07) * 100) / 100 : totalWithVAT;
      const vatAmount = isVatRegisteredUpdate ? totalWithVAT - subtotalBeforeVAT : 0;
      const totalAmount = totalWithVAT;
      console.log('[UPDATE ORDER] itemsSubtotal:', subtotal, 'discount:', orderDiscountAmount, 'shipping:', totalShippingFee, 'subtotalBeforeVAT:', subtotalBeforeVAT, 'vat:', vatAmount, 'TOTAL:', totalAmount);

      // Delete existing order items (cascades to shipments via foreign key)
      const { error: deleteItemsError } = await supabaseAdmin
        .from('order_items')
        .delete()
        .eq('order_id', id)
        .eq('company_id', auth.companyId);

      if (deleteItemsError) {
        console.error('Error deleting old order items:', deleteItemsError);
        return NextResponse.json(
          { error: 'Failed to delete old order items' },
          { status: 500 }
        );
      }

      // Update order basic info
      const deliverySnapshotUpd = hasDeliveryZoneSlot
        ? await resolveDeliverySnapshot(auth.companyId, body.delivery_zone_id, body.delivery_slot_id)
        : null;
      // ที่อยู่/ผู้รับ — ส่งมาเมื่อไหร่ค่อยเขียน (undefined = ไม่แตะ) ไม่งั้นเส้นอื่นที่
      // PUT มาพร้อม items แต่ไม่มี delivery_* จะล้างที่อยู่ทิ้ง
      const deliveryFieldsUpd: Record<string, string | null> = {};
      for (const [key, value] of ([
        ['delivery_name', body.delivery_name], ['delivery_phone', body.delivery_phone],
        ['delivery_address', body.delivery_address], ['delivery_district', body.delivery_district],
        ['delivery_amphoe', body.delivery_amphoe], ['delivery_province', body.delivery_province],
        ['delivery_postal_code', body.delivery_postal_code], ['delivery_email', body.delivery_email],
        ['shipping_address_id', body.shipping_address_id],
      ] as [string, string | undefined][])) {
        if (value !== undefined) deliveryFieldsUpd[key] = value || null;
      }

      const { error: updateOrderError } = await supabaseAdmin
        .from('orders')
        .update({
          delivery_date: delivery_date || null,
          ...(deliverySnapshotUpd || {}),
          ...deliveryFieldsUpd,
          subtotal: subtotalBeforeVAT,
          vat_amount: vatAmount,
          discount_amount: orderDiscountAmount,
          shipping_fee: totalShippingFee,
          total_amount: totalAmount,
          payment_method: payment_method || null,
          notes: notes || null,
          internal_notes: internal_notes || null,
          gift_card_requested: giftRequestedUpd,
          gift_card_fee: giftFeeUpd,
          gift_message: body.gift_message || null,
          gift_to: body.gift_to || null,
          gift_from: body.gift_from || null,
          gift_hide_price: body.gift_hide_price ?? false,
          // Only overwrite sales_channel_id if explicitly provided (undefined = keep existing)
          ...(sales_channel_id !== undefined ? { sales_channel_id: sales_channel_id || null } : {}),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .eq('company_id', auth.companyId);

      if (updateOrderError) {
        console.error('Order update error:', updateOrderError);
        return NextResponse.json(
          { error: updateOrderError.message },
          { status: 500 }
        );
      }

      // Fetch WAC cost map for cost snapshot (update path)
      const updateCostMap = await fetchCostMap(
        supabaseAdmin,
        itemsWithTotals.map((i: OrderItemInput) => i.variation_id).filter(Boolean),
      );

      // Create new order items and shipments
      for (const item of itemsWithTotals) {
        const { data: orderItem, error: itemError } = await supabaseAdmin
          .from('order_items')
          .insert({
            company_id: auth.companyId,
            order_id: id,
            variation_id: item.variation_id,
            product_id: item.product_id,
            product_code: item.product_code,
            product_name: item.product_name,
            variation_label: item.variation_label || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            unit_cost: updateCostMap[item.variation_id] || null,
            discount_percent: item.discount_percent || 0,
            discount_amount: item.discount_amount,
            discount_type: item.discount_type || 'percent',
            subtotal: item.subtotal,
            total: item.total,
            notes: item.notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select()
          .single();

        if (itemError) {
          console.error('Order item creation error:', itemError);
          return NextResponse.json(
            { error: itemError.message },
            { status: 400 }
          );
        }

        // Create shipments for this item
        const shipmentsToInsert = item.shipments
          .filter((shipment: any) => shipment.shipping_address_id)
          .map((shipment: any) => ({
            company_id: auth.companyId,
            order_item_id: orderItem.id,
            shipping_address_id: shipment.shipping_address_id,
            quantity: shipment.quantity,
            shipping_fee: shipment.shipping_fee || 0,
            delivery_status: 'pending',
            delivery_notes: shipment.delivery_notes || null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }));

        if (shipmentsToInsert.length === 0) continue;

        const { error: shipmentError } = await supabaseAdmin
          .from('order_shipments')
          .insert(shipmentsToInsert);

        if (shipmentError) {
          console.error('Shipment creation error:', shipmentError);
          return NextResponse.json(
            { error: shipmentError.message },
            { status: 400 }
          );
        }
      }

      // โหมดส่งให้คนอื่น: จำที่อยู่ผู้รับไว้ในสมุดของลูกค้า (is_default=false) แล้วชี้ออเดอร์มาที่มัน
      if (body.ship_to_other && existingOrder.customer_id && body.delivery_address) {
        try {
          const recipientAddressId = await rememberRecipientAddress(
            auth.companyId, existingOrder.customer_id, auth.userId,
            {
              name: body.delivery_name, phone: body.delivery_phone,
              address: body.delivery_address, district: body.delivery_district,
              amphoe: body.delivery_amphoe, province: body.delivery_province,
              postal_code: body.delivery_postal_code,
            },
          );
          if (recipientAddressId) {
            const { error: orderAddrError } = await supabaseAdmin
              .from('orders')
              .update({ shipping_address_id: recipientAddressId })
              .eq('id', id)
              .eq('company_id', auth.companyId);
            if (orderAddrError) console.error('Order recipient address link error:', orderAddrError.message);

            const { data: orderItemRows, error: itemRowsError } = await supabaseAdmin
              .from('order_items')
              .select('id')
              .eq('order_id', id)
              .eq('company_id', auth.companyId);
            if (itemRowsError) console.error('Order items lookup error:', itemRowsError.message);
            if (orderItemRows && orderItemRows.length > 0) {
              const { error: shipAddrError } = await supabaseAdmin
                .from('order_shipments')
                .update({ shipping_address_id: recipientAddressId })
                .in('order_item_id', orderItemRows.map((i: { id: string }) => i.id));
              if (shipAddrError) console.error('Shipment recipient address link error:', shipAddrError.message);
            }
          }
        } catch (e) {
          console.error('Recipient address upsert error (non-blocking):', e);
        }
      }

      return NextResponse.json({
        success: true,
        message: 'Order updated successfully'
      });
    } else {
      // Simple update (only basic fields, no items/shipments change)
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      // Only update fields that are provided
      if (delivery_date !== undefined) updateData.delivery_date = delivery_date || null;
      if (hasDeliveryZoneSlot) {
        Object.assign(updateData, await resolveDeliverySnapshot(auth.companyId, body.delivery_zone_id, body.delivery_slot_id));
      }
      if (payment_method !== undefined) updateData.payment_method = payment_method || null;
      if (discount_amount !== undefined) updateData.discount_amount = discount_amount || 0;
      if (notes !== undefined) updateData.notes = notes || null;
      if (internal_notes !== undefined) updateData.internal_notes = internal_notes || null;
      if (body.shipping_fee !== undefined) updateData.shipping_fee = body.shipping_fee || 0;
      if (body.tracking_number !== undefined) updateData.tracking_number = body.tracking_number || null;
      if (body.shipping_carrier !== undefined) updateData.shipping_carrier = body.shipping_carrier || null;
      if (body.order_status !== undefined) {
        updateData.order_status = body.order_status;
        // Auto-sync fulfillment_status
        if (body.order_status === 'shipping') {
          updateData.fulfillment_status = 'shipped';
          updateData.shipped_at = new Date().toISOString();
          // Save tracking info if provided alongside status change
          if (body.tracking_number) updateData.tracking_number = body.tracking_number;
          if (body.shipping_carrier) updateData.shipping_carrier = body.shipping_carrier;
        } else if (body.order_status === 'cancelled') {
          updateData.fulfillment_status = 'pending';
          updateData.hold_reason = null;
        }
      }
      if (body.payment_status !== undefined) {
        updateData.payment_status = body.payment_status;
        // paid/verifying + still 'new' → ready_to_ship (รอคอนเฟิร์ม)
        if ((body.payment_status === 'paid' || body.payment_status === 'verifying')
            && existingOrder.order_status === 'new' && !body.order_status) {
          updateData.order_status = 'ready_to_ship';
        }
        // Auto-reverse: rejected (pending) → revert to 'new'
        if (body.payment_status === 'pending' && !body.order_status) {
          if (existingOrder.order_status === 'ready_to_ship') {
            updateData.order_status = 'new';
          }
        }
      }
      if (body.customer_id !== undefined) updateData.customer_id = body.customer_id || null;
      // Delivery info fields
      if (body.delivery_name !== undefined) updateData.delivery_name = body.delivery_name || null;
      if (body.delivery_phone !== undefined) updateData.delivery_phone = body.delivery_phone || null;
      if (body.delivery_address !== undefined) updateData.delivery_address = body.delivery_address || null;
      if (body.delivery_district !== undefined) updateData.delivery_district = body.delivery_district || null;
      if (body.delivery_amphoe !== undefined) updateData.delivery_amphoe = body.delivery_amphoe || null;
      if (body.delivery_province !== undefined) updateData.delivery_province = body.delivery_province || null;
      if (body.delivery_postal_code !== undefined) updateData.delivery_postal_code = body.delivery_postal_code || null;
      if (body.delivery_email !== undefined) updateData.delivery_email = body.delivery_email || null;
      if (body.shipping_address_id !== undefined) updateData.shipping_address_id = body.shipping_address_id || null;

      const { error: updateError } = await supabaseAdmin
        .from('orders')
        .update(updateData)
        .eq('id', id)
        .eq('company_id', auth.companyId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 }
        );
      }

      // Auto-sync delivery info to shipping_addresses if customer exists
      // ข้ามเมื่อเป็นออเดอร์ "ส่งให้คนอื่น" — ข้อมูลนี้เป็นของผู้รับ ห้ามทับ contact/ที่อยู่หลักของผู้สั่ง
      if (body.delivery_name && existingOrder.customer_id && !body.ship_to_other) {
        try {
          const cleanPhone = (body.delivery_phone || '').replace(/[-\s]/g, '');

          // Sync contact info (not address) to customer
          await supabaseAdmin
            .from('customers')
            .update({
              contact_person: body.delivery_name,
              phone: cleanPhone,
              email: body.delivery_email || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingOrder.customer_id);

          // Upsert shipping_address only if address data is complete enough
          // (address_line1 and province are NOT NULL in shipping_addresses)
          if (body.delivery_address && body.delivery_province) {
            const { data: existingAddr } = await supabaseAdmin
              .from('shipping_addresses')
              .select('id')
              .eq('customer_id', existingOrder.customer_id)
              .eq('is_default', true)
              .single();

            const addrPayload = {
              customer_id: existingOrder.customer_id,
              address_name: 'ที่อยู่หลัก',
              contact_person: body.delivery_name,
              phone: cleanPhone,
              address_line1: body.delivery_address,
              district: body.delivery_district || null,
              amphoe: body.delivery_amphoe || null,
              province: body.delivery_province,
              postal_code: body.delivery_postal_code || null,
              is_default: true,
            };

            if (existingAddr) {
              await supabaseAdmin
                .from('shipping_addresses')
                .update({ ...addrPayload, updated_at: new Date().toISOString() })
                .eq('id', existingAddr.id);
              // Set shipping_address_id on order
              await supabaseAdmin.from('orders').update({ shipping_address_id: existingAddr.id }).eq('id', id);
            } else {
              const { data: customer } = await supabaseAdmin
                .from('customers')
                .select('company_id')
                .eq('id', existingOrder.customer_id)
                .single();
              if (customer) {
                const { data: newAddr } = await supabaseAdmin
                  .from('shipping_addresses')
                  .insert({ ...addrPayload, company_id: customer.company_id })
                  .select('id')
                  .single();
                if (newAddr) {
                  await supabaseAdmin.from('orders').update({ shipping_address_id: newAddr.id }).eq('id', id);
                }
              }
            }
          }
        } catch (syncError) {
          console.error('Error syncing delivery info to shipping_address:', syncError);
        }
      }

      // --- Stock logic on status change (best-effort) ---
      if (body.order_status && body.order_status !== existingOrder.order_status) {
        try {
          const stockConfig = await getStockConfig(auth.companyId!);
          if (stockConfig.stockEnabled) {
            // Fetch the order's warehouse_id
            const { data: orderForStock } = await supabaseAdmin
              .from('orders')
              .select('warehouse_id')
              .eq('id', id)
              .eq('company_id', auth.companyId)
              .single();

            const warehouseId = orderForStock?.warehouse_id;
            if (warehouseId) {
              // Fetch order items (include promotion fields)
              const { data: orderItems } = await supabaseAdmin
                .from('order_items')
                .select('variation_id, quantity, promotion_id, promotion_components')
                .eq('order_id', id)
                .eq('company_id', auth.companyId);

              const oldStatus = existingOrder.order_status;
              const newStatus = body.order_status;

              // Helper: resolve variation_id for promo components (product-level → first variation)
              const resolveVarId = async (varId: string): Promise<string | null> => {
                if (!varId) return null;
                const { data: checkVar } = await supabaseAdmin.from('product_variations').select('id').eq('id', varId).maybeSingle();
                if (checkVar) return varId;
                const { data: firstVar } = await supabaseAdmin.from('product_variations').select('id').eq('product_id', varId).limit(1).maybeSingle();
                return firstVar?.id || null;
              };

              // Helper: get all variation_ids + quantities to process (expands promo components)
              const getStockItems = async (items: any[]): Promise<{ variationId: string; qty: number }[]> => {
                const result: { variationId: string; qty: number }[] = [];
                for (const oi of items) {
                  if (!oi.variation_id) continue;
                  if (oi.promotion_id && oi.promotion_components?.length) {
                    for (const comp of oi.promotion_components as any[]) {
                      if (!comp.variation_id) continue;
                      const varId = await resolveVarId(comp.variation_id);
                      if (varId) result.push({ variationId: varId, qty: comp.quantity * oi.quantity });
                    }
                  } else {
                    result.push({ variationId: oi.variation_id, qty: oi.quantity });
                  }
                }
                return result;
              };

              const stockItems = await getStockItems(orderItems || []);

              if (oldStatus === 'new' && newStatus === 'shipping') {
                // Deduct + unreserve stock
                for (const si of stockItems) {
                  try {
                    await deductAndUnreserve({
                      supabase: supabaseAdmin, companyId: auth.companyId!, warehouseId,
                      variationId: si.variationId, qty: si.qty,
                      referenceType: 'order', referenceId: id,
                      notes: 'Deduct for order shipment', createdBy: auth.userId,
                    });
                  } catch (itemErr) {
                    console.error(`[STOCK OUT] Error deducting stock for ${si.variationId}:`, itemErr);
                  }
                }
                // Auto-sync stock to Shopee
                const shippingVarIds = stockItems.map(s => s.variationId);
                if (shippingVarIds.length > 0) {
                  import('@/lib/shopee/auto-sync').then(m => m.triggerShopeeStockSync(shippingVarIds)).catch(() => {});
                }
              } else if (newStatus === 'cancelled') {
                const stockFn = oldStatus === 'shipping' ? returnStock : unreserveStock;
                const notes = oldStatus === 'shipping' ? 'Return stock for cancelled shipment' : 'Unreserve for cancelled order';
                for (const si of stockItems) {
                  try {
                    await stockFn({
                      supabase: supabaseAdmin, companyId: auth.companyId!, warehouseId,
                      variationId: si.variationId, qty: si.qty,
                      referenceType: 'order', referenceId: id,
                      notes, createdBy: auth.userId,
                    });
                  } catch (itemErr) {
                    console.error(`[STOCK CANCEL] Error for ${si.variationId}:`, itemErr);
                  }
                }
                if (oldStatus === 'shipping') {
                  const cancelVarIds = stockItems.map(s => s.variationId);
                  if (cancelVarIds.length > 0) {
                    import('@/lib/shopee/auto-sync').then(m => m.triggerShopeeStockSync(cancelVarIds)).catch(() => {});
                  }
                }
              }
            }
          }
        } catch (stockErr) {
          console.error('[STOCK STATUS CHANGE] Error during stock update:', stockErr);
        }
      }
      // --- End stock logic on status change ---

      // Auto-issue document (ABB/REC) after any status/payment change
      {
        const { autoIssueDocument } = await import('@/lib/invoice-service');
        autoIssueDocument(id, auth.companyId!).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        message: 'Order updated successfully'
      });
    }
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Cancel order
export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json(
        { error: 'Order ID is required' },
        { status: 400 }
      );
    }

    // Fetch current order status and warehouse_id before cancelling
    const { data: orderBeforeCancel } = await supabaseAdmin
      .from('orders')
      .select('order_status, warehouse_id')
      .eq('id', orderId)
      .eq('company_id', auth.companyId)
      .single();

    // Cancel order - set both order_status and payment_status to cancelled
    const { error } = await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', orderId)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // --- Stock return/unreserve on cancel (best-effort) ---
    if (orderBeforeCancel && orderBeforeCancel.order_status !== 'cancelled') {
      try {
        const stockConfig = await getStockConfig(auth.companyId!);
        if (stockConfig.stockEnabled && orderBeforeCancel.warehouse_id) {
          const warehouseId = orderBeforeCancel.warehouse_id;
          const oldStatus = orderBeforeCancel.order_status;

          // Fetch order items (include promotion fields)
          const { data: orderItems } = await supabaseAdmin
            .from('order_items')
            .select('variation_id, quantity, promotion_id, promotion_components')
            .eq('order_id', orderId)
            .eq('company_id', auth.companyId);

          // Helper: resolve variation_id for promo components (product-level → first variation)
          const resolveVarId = async (varId: string): Promise<string | null> => {
            if (!varId) return null;
            const { data: checkVar } = await supabaseAdmin.from('product_variations').select('id').eq('id', varId).maybeSingle();
            if (checkVar) return varId;
            const { data: firstVar } = await supabaseAdmin.from('product_variations').select('id').eq('product_id', varId).limit(1).maybeSingle();
            return firstVar?.id || null;
          };

          // Helper: expand promotion components into individual variation_ids
          const getStockItems = async (items: any[]): Promise<{ variationId: string; qty: number }[]> => {
            const result: { variationId: string; qty: number }[] = [];
            for (const oi of items) {
              if (!oi.variation_id) continue;
              if (oi.promotion_id && oi.promotion_components?.length) {
                for (const comp of oi.promotion_components as any[]) {
                  if (!comp.variation_id) continue;
                  const varId = await resolveVarId(comp.variation_id);
                  if (varId) result.push({ variationId: varId, qty: comp.quantity * oi.quantity });
                }
              } else {
                result.push({ variationId: oi.variation_id, qty: oi.quantity });
              }
            }
            return result;
          };

          const stockItems = await getStockItems(orderItems || []);
          const stockFn = oldStatus === 'shipping' ? returnStock : unreserveStock;
          const notes = oldStatus === 'shipping' ? 'Return stock for cancelled shipment' : 'Unreserve for cancelled order';

          for (const si of stockItems) {
            try {
              await stockFn({
                supabase: supabaseAdmin, companyId: auth.companyId!, warehouseId,
                variationId: si.variationId, qty: si.qty,
                referenceType: 'order', referenceId: orderId,
                notes, createdBy: auth.userId,
              });
            } catch (itemErr) {
              console.error(`[STOCK DELETE CANCEL] Error for ${si.variationId}:`, itemErr);
            }
          }

          if (oldStatus === 'shipping') {
            const deleteVarIds = stockItems.map(s => s.variationId);
            if (deleteVarIds.length > 0) {
              import('@/lib/shopee/auto-sync').then(m => m.triggerShopeeStockSync(deleteVarIds)).catch(() => {});
            }
          }
        }
      } catch (stockErr) {
        console.error('[STOCK DELETE CANCEL] Error during stock update:', stockErr);
      }
    }
    // --- End stock return/unreserve on cancel ---

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
