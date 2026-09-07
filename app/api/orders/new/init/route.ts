import { NextRequest, NextResponse } from 'next/server';
import { checkAuthWithCompany, supabaseAdmin } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { fetchAllRows } from '@/lib/supabase-paging';

/**
 * Consolidated init endpoint for the OrderForm.
 *
 * Bundle = ลูกค้าล่าสุด 30 คน + warehouses + stockConfig + salesChannels +
 * defaultWarehouseId + inventoryMap ของคลังหลัก — ยิงขนานกันใน invocation เดียว
 * แทนที่จะให้ client ยิงทีละเส้น (latency = เส้นที่ช้าสุด ไม่ใช่ผลรวม + จ่ายค่า auth
 * กับ routing ครั้งเดียว)
 *
 * **ไม่มี `products` และไม่ใช่ "ลูกค้าทั้งหมด"** — สินค้า/ลูกค้าค้นฝั่ง server ผ่าน
 * `GET /api/products?search=` และ `GET /api/customers?search=` แทน เพราะ:
 *   - Supabase Cloud ตัด response ที่ 1,000 แถวเงียบ ๆ → ร้านที่มีสินค้า 5,826 รายการ
 *     ส่งมาได้แค่ 1,000 ตัวแรก สินค้าตัวที่ 5,043 จึง "ไม่พบ" ทั้งที่มีอยู่จริง
 *   - ต่อให้แบ่งหน้าจนครบ JSON ก็ ~5.6MB (สินค้า) + ~3.7MB (ลูกค้า) เกินเพดาน 4.5MB
 *     ของ Vercel function response และหนักทุกครั้งที่เปิดฟอร์ม
 *
 * ลูกค้าล่าสุด 30 คนมีไว้เป็นรายการตั้งต้นก่อนผู้ใช้พิมพ์ค้นหาเท่านั้น
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;

    const stockConfigPromise = getStockConfig(companyId);

    // Pre-query the default warehouse id so we can fold its inventory into the
    // same parallel batch. Tiny query (~10-50ms) — net win vs the client
    // firing /api/inventory separately after the warehouses come back.
    const { data: defaultWh } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .eq('warehouse_type', 'internal')
      .eq('is_default', true)
      .maybeSingle();
    const defaultWarehouseId = defaultWh?.id ?? null;

    type InventoryRow = { variation_id: string; quantity: number; reserved_quantity: number };

    // สต็อกของคลังหลักต้องได้ครบ (ใช้เช็คของหมด/ขายเกิน) — เกิน 1,000 แถวได้ง่าย
    // จึงต้องผ่าน fetchAllRows ไม่ใช่ query เปล่า ๆ
    const inventoryPromise = defaultWarehouseId
      ? fetchAllRows<InventoryRow>((from, to) =>
          supabaseAdmin
            .from('inventory')
            .select('variation_id, quantity, reserved_quantity')
            .eq('company_id', companyId)
            .eq('warehouse_id', defaultWarehouseId)
            .range(from, to))
      : Promise.resolve({ rows: [] as InventoryRow[], count: null, error: null });

    // Fire all base queries in parallel
    const [
      customersResult,
      warehousesResult,
      salesChannelsResult,
      inventoryResult,
    ] = await Promise.all([
      // ลูกค้าล่าสุด 30 คน — รายการตั้งต้นของช่องค้นหา (พิมพ์แล้วไปค้นที่ /api/customers)
      supabaseAdmin
        .from('customers')
        .select('id, customer_code, name, contact_person, phone, email, customer_type, sale_type, is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .or('customer_type.is.null,customer_type.in.(retail,dropship,affiliate)')
        .order('created_at', { ascending: false })
        .limit(30),
      supabaseAdmin
        .from('warehouses')
        .select('*, customer:customers(id, name, customer_type)')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .eq('warehouse_type', 'internal')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('sales_channels')
        .select('id, code, name, channel_type, platform, chat_account_id, icon, color, is_active, is_system, is_default, sort_order')
        .eq('company_id', companyId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      inventoryPromise,
    ]);

    const stockConfig = await stockConfigPromise;

    // Build inventory map for default warehouse — same shape OrderForm expects
    const inventoryMap: Record<string, { quantity: number; reserved_quantity: number; available: number }> = {};
    for (const row of inventoryResult.rows) {
      const quantity = Number(row.quantity) || 0;
      const reserved = Number(row.reserved_quantity) || 0;
      inventoryMap[row.variation_id] = {
        quantity,
        reserved_quantity: reserved,
        available: quantity - reserved,
      };
    }

    return NextResponse.json({
      customers: customersResult.data || [],
      warehouses: warehousesResult.data || [],
      stockConfig,
      salesChannels: salesChannelsResult.data || [],
      defaultWarehouseId,
      inventoryMap,
    });
  } catch (error) {
    console.error('[Orders New Init] Error:', error);
    return NextResponse.json({ error: 'Failed to initialize order form' }, { status: 500 });
  }
}
