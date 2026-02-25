import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole } from '@/lib/supabase-admin';
import { splitOrder, ensureValidToken } from '@/lib/shopee/api';

interface ParcelInput {
  items: { order_item_id: string; quantity: number }[];
}

interface SplitRequest {
  order_id: string;
  parcels: ParcelInput[];
}

export async function POST(req: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId || !isAdminRole(companyRoles)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: SplitRequest = await req.json();
    const { order_id, parcels } = body;

    if (!order_id || !parcels || parcels.length < 2) {
      return NextResponse.json({ error: 'ต้องแบ่งอย่างน้อย 2 กล่อง' }, { status: 400 });
    }
    if (parcels.length > 5) {
      return NextResponse.json({ error: 'แบ่งได้สูงสุด 5 กล่อง' }, { status: 400 });
    }

    // 1. Fetch the order
    const { data: order, error: orderErr } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, source, external_order_sn, marketplace_account_id, is_split')
      .eq('id', order_id)
      .eq('company_id', companyId)
      .single();

    if (orderErr || !order) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
    }
    if (order.order_status !== 'ready_to_ship') {
      return NextResponse.json({ error: 'สามารถแบ่งกล่องได้เฉพาะสถานะ "รอกดรับ" เท่านั้น' }, { status: 400 });
    }
    if (order.is_split) {
      return NextResponse.json({ error: 'คำสั่งซื้อนี้ถูกแบ่งกล่องแล้ว' }, { status: 400 });
    }

    // 2. Fetch order items to validate quantities
    const { data: orderItems, error: itemsErr } = await supabaseAdmin
      .from('order_items')
      .select('id, quantity, product_name, variation_label, external_item_id, external_model_id')
      .eq('order_id', order_id)
      .eq('company_id', companyId);

    if (itemsErr || !orderItems) {
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลสินค้าได้' }, { status: 500 });
    }

    // 3. Validate: every item must be fully assigned
    const itemQtyMap = new Map(orderItems.map(i => [i.id, i.quantity]));
    const assignedQty = new Map<string, number>();

    for (const parcel of parcels) {
      for (const item of parcel.items) {
        const maxQty = itemQtyMap.get(item.order_item_id);
        if (maxQty === undefined) {
          return NextResponse.json({ error: `ไม่พบสินค้า ${item.order_item_id}` }, { status: 400 });
        }
        assignedQty.set(item.order_item_id, (assignedQty.get(item.order_item_id) || 0) + item.quantity);
      }
    }

    // Check every order item is fully assigned
    for (const [itemId, qty] of itemQtyMap.entries()) {
      const assigned = assignedQty.get(itemId) || 0;
      if (assigned !== qty) {
        const itemName = orderItems.find(i => i.id === itemId)?.product_name || itemId;
        return NextResponse.json({
          error: `สินค้า "${itemName}" จัดสรร ${assigned} ชิ้น จากทั้งหมด ${qty} ชิ้น`
        }, { status: 400 });
      }
    }

    // 4. If Shopee order → call split_order API
    let shopeePackages: { package_number: string }[] | undefined;

    if (order.source === 'shopee' && order.external_order_sn && order.marketplace_account_id) {
      // Fetch marketplace account
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', order.marketplace_account_id)
        .single();

      if (!account) {
        return NextResponse.json({ error: 'ไม่พบบัญชี Shopee' }, { status: 404 });
      }

      const creds = await ensureValidToken(account);
      if (!creds) {
        return NextResponse.json({ error: 'Shopee token หมดอายุ' }, { status: 401 });
      }

      // Build Shopee package_list: array of item arrays
      const packageList = parcels.map(parcel =>
        parcel.items.map(item => {
          const oi = orderItems.find(o => o.id === item.order_item_id);
          return {
            item_id: parseInt(oi?.external_item_id || '0'),
            model_id: parseInt(oi?.external_model_id || '0'),
          };
        })
      );

      const result = await splitOrder(creds, order.external_order_sn, packageList);
      if (result.error) {
        return NextResponse.json({ error: `Shopee split failed: ${result.error}` }, { status: 400 });
      }
      shopeePackages = result.packageList;
    }

    // 5. Create order_parcels + order_parcel_items
    const parcelIds: string[] = [];
    for (let i = 0; i < parcels.length; i++) {
      const parcel = parcels[i];
      const packageNumber = shopeePackages?.[i]?.package_number || null;

      const { data: newParcel, error: parcelErr } = await supabaseAdmin
        .from('order_parcels')
        .insert({
          company_id: companyId,
          order_id,
          parcel_number: i + 1,
          package_number: packageNumber,
          status: 'pending',
        })
        .select('id')
        .single();

      if (parcelErr || !newParcel) {
        return NextResponse.json({ error: `ไม่สามารถสร้างกล่องที่ ${i + 1} ได้: ${parcelErr?.message}` }, { status: 500 });
      }

      parcelIds.push(newParcel.id);

      // Create parcel items
      const parcelItems = parcel.items.map(item => ({
        parcel_id: newParcel.id,
        order_item_id: item.order_item_id,
        quantity: item.quantity,
      }));

      const { error: itemInsertErr } = await supabaseAdmin
        .from('order_parcel_items')
        .insert(parcelItems);

      if (itemInsertErr) {
        return NextResponse.json({ error: `ไม่สามารถเพิ่มสินค้าในกล่องที่ ${i + 1} ได้` }, { status: 500 });
      }
    }

    // 6. Mark order as split
    await supabaseAdmin
      .from('orders')
      .update({ is_split: true, updated_at: new Date().toISOString() })
      .eq('id', order_id);

    return NextResponse.json({
      success: true,
      parcel_ids: parcelIds,
      parcel_count: parcels.length,
    });
  } catch (e) {
    console.error('[API] orders/split error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
