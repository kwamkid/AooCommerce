// Path: app/api/pos/orders/void/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { releaseOrderStockOnce } from '@/lib/stock/order-stock';
import { guardFeature } from '@/lib/package-gates-server';

// POST — Void a POS order
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // ด่านฟีเจอร์ของ API — UI กันคนหลงเข้าหน้าได้ แต่กันคนยิง API ตรงไม่ได้
    const blocked = await guardFeature(auth.companyId, 'pos');
    if (blocked) return blocked;
    // Void reverses stock + cancels a completed sale + adjusts session totals —
    // manager/admin only, not cashier self-service.
    if (!can(auth, 'pos.manage')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์ยกเลิกบิล (เฉพาะผู้จัดการ)' }, { status: 403 });
    }

    const { order_id, reason } = await request.json();

    if (!order_id) {
      return NextResponse.json({ error: 'order_id is required' }, { status: 400 });
    }

    // Get order
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('id, order_status, source, pos_session_id, warehouse_id, receipt_number')
      .eq('id', order_id)
      .eq('company_id', auth.companyId)
      .eq('source', 'pos')
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'POS order not found' }, { status: 404 });
    }

    if (order.order_status === 'cancelled') {
      return NextResponse.json({ error: 'Order already voided' }, { status: 400 });
    }

    /**
     * คืนของผ่าน service กลาง — เดิมวนรายการเองในหน้านี้แล้ว**ไม่แตกโปรโมชัน**
     * บิลที่ขายเป็นชุดจึงคืนผิดตัว (คืนตัวแม่ที่ไม่มีสต็อก ส่วนชิ้นจริงที่ถูกตัดไปไม่ได้คืน)
     * ตัวกลางเลือกวิธีคืนจากหลักฐานจริง (เคยตัด → คืนเข้าคลัง · จองอยู่ → ปลดจอง)
     * และกระจายยอดขึ้นร้านให้เองด้วย
     */
    const stock = await releaseOrderStockOnce({
      companyId: auth.companyId!,
      orderId: order_id,
      warehouseId: order.warehouse_id,
      reference: `POS Void ${order.receipt_number || ''}${reason ? ` — ${reason}` : ''}`,
      createdBy: auth.userId,
    });
    if (stock.errors.length > 0) {
      console.error('[POS Void] คืนสต็อกไม่สำเร็จบางรายการ:', stock.errors);
    }

    // Update order status
    await supabaseAdmin
      .from('orders')
      .update({
        order_status: 'cancelled',
        payment_status: 'cancelled',
        cancellation_reason: reason || 'POS Void',
        updated_at: new Date().toISOString(),
      })
      .eq('id', order_id)
      .eq('company_id', auth.companyId);

    // Increment session void count
    if (order.pos_session_id) {
      const { data: session } = await supabaseAdmin
        .from('pos_sessions')
        .select('total_voids, total_sales, total_orders')
        .eq('id', order.pos_session_id)
        .single();

      if (session) {
        // Get the voided order's total to subtract from session
        const { data: voidedOrder } = await supabaseAdmin
          .from('orders')
          .select('total_amount')
          .eq('id', order_id)
          .single();

        await supabaseAdmin
          .from('pos_sessions')
          .update({
            total_voids: (session.total_voids || 0) + 1,
            total_sales: Number(session.total_sales || 0) - Number(voidedOrder?.total_amount || 0),
            updated_at: new Date().toISOString(),
          })
          .eq('id', order.pos_session_id);
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
