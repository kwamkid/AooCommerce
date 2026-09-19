// Path: app/api/dashboard/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';

// GET - Get dashboard stats
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);

    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Orders to deliver today
    const { data: todayDeliveries, error: deliveriesError } = await supabaseAdmin
      .from('orders')
      .select(`
        id,
        order_number,
        delivery_date,
        order_status,
        total_amount,
        customers (
          id,
          name,
          phone
        )
      `)
      .eq('company_id', auth.companyId)
      .gte('delivery_date', today.toISOString().split('T')[0])
      .lt('delivery_date', tomorrow.toISOString().split('T')[0])
      .in('order_status', ['new', 'ready_to_ship', 'processing', 'shipping'])
      .order('delivery_date', { ascending: true });

    if (deliveriesError) {
      console.error('Deliveries error:', deliveriesError);
    }

    // สต็อกต่ำ — ใช้ RPC ตัวเดียวกับ badge ใน Sidebar และแท็บ "ต่ำ" ของหน้า /inventory
    // (นิยาม: min_stock > 0 และพร้อมขายรวมทุกคลัง ≤ min)
    //
    // ⛔ ของเดิมดึงแถว `inventory` ทั้งบริษัทมานับเองด้วยเกณฑ์ `available <= 5` ซึ่งผิดสองชั้น:
    //    เลข 5 เป็นค่าที่ hard-code ไว้ (ไม่ใช่ขั้นต่ำที่ร้านตั้ง) ⇒ หน้าแรกกับเมนูข้างบอก
    //    คนละตัวเลขมาตลอด · และร้านที่มีแถวสต็อกเกิน 1,000 ก็ถูกตัดเงียบ นับได้ไม่ครบอยู่ดี
    let lowStockCount = 0;
    try {
      const { data: lowStock } = await supabaseAdmin.rpc('get_low_stock_count', {
        p_company_id: auth.companyId,
      });
      lowStockCount = Number(lowStock) || 0;
    } catch {
      // Stock feature might not be enabled or RPC doesn't exist, ignore
    }

    // Format the data
    const stats = {
      todayDeliveries: {
        count: todayDeliveries?.length || 0,
        orders: (todayDeliveries || []).map((order: any) => ({
          id: order.id,
          orderNumber: order.order_number,
          deliveryDate: order.delivery_date,
          status: order.order_status,
          totalAmount: order.total_amount,
          customer: {
            id: order.customers?.id,
            name: order.customers?.name,
            phone: order.customers?.phone
          }
        }))
      },
      lowStockCount,
    };

    return NextResponse.json({ stats });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
