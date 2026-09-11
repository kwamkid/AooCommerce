// Path: app/api/products/composite-availability/route.ts
//
// Sellable sets of composite-product combos (สินค้าชุด) — a combo has no inventory row,
// so /api/inventory never lists it. Callers pass the candidate variation ids they are
// showing (cart + search results); non-combos are simply absent from the response.
//
// GET ?variation_ids=a,b,c&warehouse_id=  (warehouse omitted = all warehouses)
//   → { items: { [variation_id]: { quantity, reserved_quantity, available } } }
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { getCompositeAvailability } from '@/lib/composite';

const MAX_IDS = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const sp = request.nextUrl.searchParams;
    const warehouseId = sp.get('warehouse_id') || null;
    const ids = [...new Set((sp.get('variation_ids') || '').split(',').map(s => s.trim()).filter(s => UUID_RE.test(s)))];
    if (ids.length === 0) return NextResponse.json({ items: {} });
    if (ids.length > MAX_IDS) {
      return NextResponse.json({ error: `ส่งได้ไม่เกิน ${MAX_IDS} รายการต่อครั้ง` }, { status: 400 });
    }

    if (warehouseId) {
      const { data: wh } = await supabaseAdmin
        .from('warehouses')
        .select('id')
        .eq('id', warehouseId)
        .eq('company_id', auth.companyId)
        .maybeSingle();
      if (!wh) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    const map = await getCompositeAvailability(supabaseAdmin, auth.companyId, ids, warehouseId);
    return NextResponse.json({ items: Object.fromEntries(map) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
