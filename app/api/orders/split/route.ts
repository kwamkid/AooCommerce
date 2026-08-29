import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { splitOrder, getPackageDetail, ensureValidToken } from '@/lib/shopee/api';
import {
  ensureValidToken as ensureTikTokToken,
  getOrderSplitAttributes,
  splitTikTokOrder,
} from '@/lib/tiktok/api';

interface ParcelInput {
  items: { order_item_id: string; quantity: number }[];
}

interface SplitRequest {
  order_id: string;
  parcels: ParcelInput[];
}

export async function POST(req: NextRequest) {
  const { isAuth, companyId, companyRoles } = await checkAuthWithCompany(req);
  if (!isAuth || !companyId || !can(companyRoles, 'order.split')) {
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
      .select('id, quantity, product_name, variation_label, variation_id, external_line_item_ids')
      .eq('order_id', order_id);

    if (itemsErr || !orderItems) {
      console.error('[API] orders/split: Failed to fetch order_items:', itemsErr);
      return NextResponse.json({ error: 'ไม่สามารถดึงข้อมูลสินค้าได้' }, { status: 500 });
    }
    if (orderItems.length === 0) {
      return NextResponse.json({ error: 'ไม่พบสินค้าในคำสั่งซื้อนี้' }, { status: 400 });
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

    // 4. ส่งคำสั่งแบ่งกล่องไปที่แพลตฟอร์ม (ถ้าเป็นออเดอร์จาก marketplace)
    //    Shopee แบ่งด้วย item_id + model_id + จำนวน · TikTok แบ่งด้วย id รายชิ้น
    let shopeePackages: { package_number: string }[] | undefined;
    let tiktokPackages: { id: string; splittable_group_id: string }[] | undefined;

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

      // Check can_split_order via get_package_detail
      // First get package_number from order's package_list (get_order_detail)
      const { data: orderDetailData } = await supabaseAdmin
        .from('orders')
        .select('external_data')
        .eq('id', order_id)
        .single();

      const packageListFromOrder = (orderDetailData?.external_data as Record<string, unknown>)?.package_list as
        { package_number: string }[] | undefined;
      const firstPackageNumber = packageListFromOrder?.[0]?.package_number;

      if (firstPackageNumber) {
        const { packages, error: pkgError } = await getPackageDetail(creds, [firstPackageNumber]);
        if (!pkgError && packages.length > 0 && packages[0].can_split_order === false) {
          return NextResponse.json({
            error: 'ร้านนี้ยังไม่ได้เปิดใช้งานแยกกล่อง กรุณาสมัครที่ Shopee Seller Centre ก่อน'
          }, { status: 400 });
        }
      }

      // Look up Shopee external IDs via marketplace_product_links
      const variationIds = orderItems
        .map(oi => oi.variation_id)
        .filter((v): v is string => !!v);

      // Map: order_item_id → { item_id, model_id }
      const shopeeIdMap = new Map<string, { item_id: number; model_id: number }>();

      if (variationIds.length > 0) {
        const { data: productLinks } = await supabaseAdmin
          .from('marketplace_product_links')
          .select('variation_id, external_item_id, external_model_id')
          .eq('account_id', order.marketplace_account_id)
          .in('variation_id', variationIds);

        const linkMap = new Map(
          (productLinks || []).map(l => [l.variation_id, l])
        );

        for (const oi of orderItems) {
          if (oi.variation_id) {
            const link = linkMap.get(oi.variation_id);
            if (link) {
              shopeeIdMap.set(oi.id, {
                item_id: parseInt(link.external_item_id || '0'),
                model_id: parseInt(link.external_model_id || '0'),
              });
            }
          }
        }
      }

      // Fallback: get from external_data.item_list for any unresolved items
      if (shopeeIdMap.size < orderItems.length) {
        const externalData = orderDetailData?.external_data as Record<string, unknown> | null;
        const itemList = (externalData?.item_list || []) as {
          item_id: number; model_id: number; item_name: string;
          model_quantity_purchased?: number; model_name?: string;
        }[];

        for (const oi of orderItems) {
          if (!shopeeIdMap.has(oi.id) && itemList.length > 0) {
            // Match by product_name similarity
            const match = itemList.find(si =>
              oi.product_name && si.item_name &&
              (oi.product_name.includes(si.item_name) || si.item_name.includes(oi.product_name))
            );
            if (match) {
              shopeeIdMap.set(oi.id, {
                item_id: match.item_id,
                model_id: match.model_id,
              });
            }
          }
        }
      }

      // Validate all items are mapped
      const unmapped = orderItems.filter(oi => !shopeeIdMap.has(oi.id));
      if (unmapped.length > 0) {
        return NextResponse.json({
          error: `ไม่พบข้อมูล Shopee สำหรับสินค้า: ${unmapped.map(u => u.product_name).join(', ')}`
        }, { status: 400 });
      }

      // Build Shopee package_list: array of item arrays with model_quantity for unit-level split
      const packageList = parcels.map(parcel =>
        parcel.items.map(item => {
          const ids = shopeeIdMap.get(item.order_item_id)!;
          return {
            item_id: ids.item_id,
            model_id: ids.model_id,
            model_quantity: item.quantity,
          };
        })
      );

      const result = await splitOrder(creds, order.external_order_sn, packageList);
      if (result.error) {
        return NextResponse.json({ error: `Shopee split failed: ${result.error}` }, { status: 400 });
      }
      shopeePackages = result.packageList;
    }

    if (order.source === 'tiktok' && order.external_order_sn && order.marketplace_account_id) {
      const { data: account } = await supabaseAdmin
        .from('marketplace_accounts')
        .select('*')
        .eq('id', order.marketplace_account_id)
        .single();

      if (!account) {
        return NextResponse.json({ error: 'ไม่พบบัญชี TikTok' }, { status: 404 });
      }

      const creds = await ensureTikTokToken(account);

      // เช็คก่อนเสมอว่าออเดอร์นี้แบ่งได้ — บางออเดอร์แบ่งไม่ได้เลย
      const { attributes, error: attrError } = await getOrderSplitAttributes(creds, [order.external_order_sn]);
      if (attrError) {
        return NextResponse.json({ error: `เช็คสิทธิ์แบ่งกล่องไม่สำเร็จ: ${attrError}` }, { status: 400 });
      }
      const attr = attributes.find(a => String(a.order_id) === order.external_order_sn) || attributes[0];
      if (attr && attr.can_split === false) {
        return NextResponse.json({ error: 'TikTok ไม่อนุญาตให้แบ่งกล่องออเดอร์นี้' }, { status: 400 });
      }

      // TikTok แบ่งด้วย id รายชิ้น — order item หนึ่งแถวของเราคือหลายชิ้นของ TikTok
      // (sync รวมชิ้นที่ SKU เดียวกันเป็นแถวเดียว) จึงต้องหยิบ id ตามจำนวนที่ใส่ในแต่ละกล่อง
      const remainingIds = new Map<string, string[]>();
      for (const oi of orderItems) {
        remainingIds.set(oi.id, [...(oi.external_line_item_ids || [])]);
      }

      // คอลัมน์นี้เขียนตอน "สร้าง" ออเดอร์เท่านั้น — ออเดอร์ที่เข้าระบบก่อนหน้านี้จะว่าง
      // และ sync ซ้ำก็ไม่เติมให้ → ถอยไปจับคู่จาก external_data ที่ TikTok ส่งมาพร้อมออเดอร์
      const missing = orderItems.filter(oi => (remainingIds.get(oi.id) || []).length < oi.quantity);
      if (missing.length > 0) {
        const { data: fullOrder } = await supabaseAdmin
          .from('orders').select('external_data').eq('id', order_id).single();
        const liByName = new Map<string, string[]>();
        for (const li of (((fullOrder?.external_data as Record<string, unknown>)?.line_items || []) as
          { id?: string; product_name?: string; sku_name?: string }[])) {
          if (!li.id) continue;
          const name = li.sku_name ? `${li.product_name} - ${li.sku_name}` : (li.product_name || '');
          liByName.set(name, [...(liByName.get(name) || []), String(li.id)]);
        }
        for (const oi of missing) {
          const ids = liByName.get(oi.product_name || '');
          if (ids && ids.length >= oi.quantity) remainingIds.set(oi.id, [...ids]);
        }
      }

      const stillMissing = orderItems.filter(oi => (remainingIds.get(oi.id) || []).length < oi.quantity);
      if (stillMissing.length > 0) {
        return NextResponse.json({
          error: `ไม่มีรหัสรายชิ้นของ TikTok สำหรับ: ${stillMissing.map(m => m.product_name).join(', ')}`,
        }, { status: 400 });
      }

      const groups = parcels.map((parcel, idx) => {
        const ids: string[] = [];
        for (const item of parcel.items) {
          const pool = remainingIds.get(item.order_item_id)!;
          ids.push(...pool.splice(0, item.quantity));
        }
        return { id: String(idx + 1), order_line_item_ids: ids };
      });

      const result = await splitTikTokOrder(creds, order.external_order_sn, groups);
      if (result.error) {
        return NextResponse.json({ error: `TikTok split failed: ${result.error}` }, { status: 400 });
      }
      tiktokPackages = result.packages;
    }

    // 5. Create order_parcels + order_parcel_items
    const parcelIds: string[] = [];
    for (let i = 0; i < parcels.length; i++) {
      const parcel = parcels[i];
      // TikTok คืน package id ผูกกับ splittable_group_id ที่เราส่งไป (เราใช้ลำดับกล่องเป็น id)
      const packageNumber =
        shopeePackages?.[i]?.package_number
        || tiktokPackages?.find(p => String(p.splittable_group_id) === String(i + 1))?.id
        || null;

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

    // 6. Mark order as split (ยังอยู่ ready_to_ship — รอกดรับออเดอร์แยก)
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
