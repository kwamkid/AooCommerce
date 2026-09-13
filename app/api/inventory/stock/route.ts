// Path: app/api/inventory/stock/route.ts
//
// ยอดคงเหลือของ "ตัวเลือกที่อยู่บนฟอร์ม" เท่านั้น — ฟอร์มรับเข้า/เบิกออก/โอนย้าย
// ถามเฉพาะ variation ที่ผู้ใช้หยิบเข้ามาจริง ไม่ต้องโหลดสต็อกทั้งคลัง
//
// ⛔ ห้ามกลับไปใช้ `/api/inventory?warehouse_id=&limit=9999` เพื่อทำ stockMap
// (เพดาน 1,000 แถวของ Supabase ตัดเงียบ — คลังที่มีของเกินพันตัวเลือกจะได้ยอดผิด)
//
// GET /api/inventory/stock?variation_ids=a,b,c&warehouse_id=<optional>
//   → { stock: { [variation_id]: { quantity, available } }, cost: { [variation_id]: number } }
// `cost` = WAC (`product_variations.cost_price`) ส่งเฉพาะคนที่มีสิทธิ์ดูต้นทุน ไม่มีสิทธิ์ = {}
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

/** ขอทีละมาก ๆ ไม่ได้ — ฟอร์มหนึ่งใบไม่ควรมีเกินนี้อยู่แล้ว */
const MAX_IDS = 200;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!can(auth, 'inventory.view')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ดูข้อมูลสต็อก' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const ids = [...new Set(
      (sp.get('variation_ids') || '')
        .split(',')
        .map(s => s.trim())
        .filter(s => UUID_RE.test(s)),
    )];
    const warehouseId = sp.get('warehouse_id')?.trim() || null;

    if (ids.length === 0) return NextResponse.json({ stock: {}, cost: {} });
    if (ids.length > MAX_IDS) {
      return NextResponse.json(
        { error: `ขอยอดคงเหลือได้ครั้งละไม่เกิน ${MAX_IDS} รายการ` },
        { status: 400 },
      );
    }
    if (warehouseId && !UUID_RE.test(warehouseId)) {
      return NextResponse.json({ error: 'รหัสคลังสินค้าไม่ถูกต้อง' }, { status: 400 });
    }

    const canViewCost = auth.canViewCost === true;

    const [stockRes, costRes] = await Promise.all([
      supabaseAdmin.rpc('get_variation_stock', {
        p_company_id: auth.companyId,
        p_variation_ids: ids,
        p_warehouse_id: warehouseId,
      }),
      canViewCost
        ? supabaseAdmin
            .from('product_variations')
            .select('id, cost_price')
            .eq('company_id', auth.companyId)
            .in('id', ids)
        : Promise.resolve({ data: null, error: null }),
    ]);

    if (stockRes.error) {
      console.error('get_variation_stock failed:', stockRes.error);
      return NextResponse.json({ error: stockRes.error.message }, { status: 500 });
    }

    const raw = (stockRes.data ?? {}) as Record<string, { quantity?: unknown; available?: unknown }>;
    const stock: Record<string, { quantity: number; available: number }> = {};
    for (const id of ids) {
      const row = raw[id];
      stock[id] = {
        quantity: Number(row?.quantity) || 0,
        available: Number(row?.available) || 0,
      };
    }

    const cost: Record<string, number> = {};
    if (canViewCost && !costRes.error) {
      for (const row of (costRes.data ?? []) as { id: string; cost_price: unknown }[]) {
        cost[row.id] = Number(row.cost_price) || 0;
      }
    }

    return NextResponse.json({ stock, cost });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error';
    console.error('GET inventory/stock error:', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
