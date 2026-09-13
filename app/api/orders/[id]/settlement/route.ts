import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { extractBuyer } from '@/lib/marketplace/buyer-adapter';

// ยอดเงินจริงของออเดอร์ marketplace หนึ่งใบ — ให้การ์ด MarketplaceOrderCard อ่าน
//
// GET /api/orders/[id]/settlement
//   → { account, external_order_id, external_status, buyer, buyer_note, settlement, lines, can_view_cost }
//
// **ไม่ยิง API ของแพลตฟอร์มเลย** — อ่านจาก `marketplace_settlements` ที่ cron/adapter บันทึกไว้
// อยากดึงของใหม่ใช้ POST /api/marketplace/settlements/sync-order
//
// ข้อมูลผู้ซื้อ (ชื่อ · ที่อยู่เท่าที่แพลตฟอร์มยอมบอก · ข้อความจากผู้ซื้อ) แกะผ่าน
// `getBuyerAdapter(platform)` — **ห้ามไล่เดาชื่อคีย์เองใน route** แต่ละเจ้าเก็บคนละที่
// และปิดบังคนละฟิลด์ (ดู lib/marketplace/buyer-adapter.ts)
//
// ต้นทุน/กำไรถูกถอดออกจาก response เมื่อผู้ใช้ไม่มีสิทธิ์เห็นต้นทุน — ซ่อนแค่ที่ UI
// ไม่พอ ค่ายังไหลไปถึงเครื่องผู้ใช้อยู่ดี

/** ค่าที่ตัดออกเมื่อไม่มีสิทธิ์เห็นต้นทุน */
const COST_FIELDS = ['cogs', 'cogs_basis', 'gross_profit'] as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id: orderId } = await context.params;

    const { data: order } = await supabaseAdmin
      .from('orders')
      .select('id, external_order_sn, external_status, external_data, marketplace_account_id')
      .eq('id', orderId)
      .eq('company_id', auth.companyId)
      .maybeSingle();

    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 });

    const canViewCost = auth.canViewCost === true;

    const [accountRes, settlementRes] = await Promise.all([
      order.marketplace_account_id
        ? supabaseAdmin
            .from('marketplace_accounts')
            .select('id, platform, shop_name')
            .eq('id', order.marketplace_account_id)
            .eq('company_id', auth.companyId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from('marketplace_settlements')
        .select('*')
        .eq('order_id', orderId)
        .eq('company_id', auth.companyId)
        .maybeSingle(),
    ]);

    const settlementRow = settlementRes.data as Record<string, unknown> | null;

    let lines: unknown[] = [];
    if (settlementRow?.id) {
      const { data } = await supabaseAdmin
        .from('marketplace_settlement_lines')
        .select('id, platform_fee_code, platform_fee_name, bucket, amount, vat, wht, occurred_at, external_item_id')
        .eq('settlement_id', settlementRow.id as string)
        .eq('company_id', auth.companyId)
        .order('amount', { ascending: false });
      lines = data || [];
    }

    let settlement: Record<string, unknown> | null = null;
    if (settlementRow) {
      settlement = { ...settlementRow };
      // `raw` คือ payload ดิบของแพลตฟอร์ม (หลายสิบ KB) — การ์ดไม่ได้ใช้ ไม่ต้องส่งไป
      delete settlement.raw;
      if (!canViewCost) for (const f of COST_FIELDS) delete settlement[f];
    }

    const account = accountRes.data ?? null;
    const buyer = extractBuyer(account?.platform ?? null, order.external_data);

    return NextResponse.json({
      account,
      external_order_id: order.external_order_sn ?? null,
      external_status: order.external_status ?? null,
      buyer,
      buyer_note: buyer.note ?? null,
      settlement,
      lines,
      can_view_cost: canViewCost,
    });
  } catch (error) {
    console.error('Error in orders/[id]/settlement GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
