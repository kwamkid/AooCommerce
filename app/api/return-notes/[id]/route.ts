import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { deductStock } from '@/lib/stock-service';
import { pushStockAfter } from '@/lib/marketplace/push-after';

// GET /api/return-notes/[id]
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('return_notes')
      .select(`
        *,
        customer:customers(id, name, customer_code, phone, tax_company_name, tax_id, tax_branch,
          billing_address, billing_district, billing_amphoe, billing_province, billing_postal_code),
        items:return_note_items(
          id, variation_id, product_name, variation_label, sku,
          quantity, unit_price, amount, sort_order
        )
      `)
      .eq('id', id)
      .eq('company_id', auth.companyId)
      .order('sort_order', { referencedTable: 'return_note_items', ascending: true })
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'ไม่พบใบรับคืนสินค้า' }, { status: 404 });
    }

    // Fetch linked credit note if exists
    let creditNote = null;
    if (data.credit_note_id) {
      const { data: cn } = await supabaseAdmin
        .from('credit_notes')
        .select('id, cn_number, status, total_amount')
        .eq('id', data.credit_note_id)
        .single();
      creditNote = cn;
    }

    return NextResponse.json({ return_note: { ...data, credit_note: creditNote } });
  } catch (err) {
    console.error('GET return-note detail error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/return-notes/[id] — cancel
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    if (action === 'cancel') {
      const { data: existing } = await supabaseAdmin
        .from('return_notes')
        .select('id, rn_number, status, credit_note_id, warehouse_id')
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .single();

      if (!existing) return NextResponse.json({ error: 'ไม่พบใบรับคืน' }, { status: 404 });
      if (existing.status === 'cancelled') return NextResponse.json({ error: 'ใบรับคืนถูกยกเลิกแล้ว' }, { status: 400 });

      /**
       * ปิดสถานะแบบมีเงื่อนไข — กดยกเลิกรัว ๆ สองครั้งพร้อมกัน ทั้งสองคำขออ่าน `existing`
       * ทัน "issued" เหมือนกันแล้วหักของคืนคนละรอบ = ของหายเป็นสองเท่า
       * ให้ DB เป็นคนตัดสินว่าใครได้ไปต่อ ใครตกรอบ
       */
      const { data: locked } = await supabaseAdmin
        .from('return_notes')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('company_id', auth.companyId)
        .neq('status', 'cancelled')
        .select('id');

      if (!locked || locked.length === 0) {
        return NextResponse.json({ error: 'ใบรับคืนถูกยกเลิกแล้ว' }, { status: 400 });
      }

      /**
       * ตอนสร้างใบรับคืน ของถูก `addStock` เข้าคลังไปแล้ว — ยกเลิกใบต้องหักกลับด้วย
       * ไม่งั้นกดสร้าง/ยกเลิกวนไปเรื่อย ๆ ของงอกจากอากาศไม่จำกัด
       */
      const cancelTouched: string[] = [];
      if (existing.warehouse_id) {
        const { data: rnItems } = await supabaseAdmin
          .from('return_note_items')
          .select('variation_id, quantity')
          .eq('return_note_id', id);

        for (const item of (rnItems || []) as { variation_id: string | null; quantity: number }[]) {
          if (!item.variation_id || item.quantity <= 0) continue;
          cancelTouched.push(item.variation_id);
          await deductStock({
            supabase: supabaseAdmin,
            companyId: auth.companyId!,
            warehouseId: existing.warehouse_id,
            variationId: item.variation_id,
            qty: item.quantity,
            referenceType: 'return_note_cancel',
            referenceId: id,
            notes: `ยกเลิกใบรับคืน: ${existing.rn_number}`,
            createdBy: auth.userId,
          });
        }
      }

      // Cancel linked credit note too
      if (existing.credit_note_id) {
        await supabaseAdmin
          .from('credit_notes')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', existing.credit_note_id);
      }

      pushStockAfter(cancelTouched, [existing.warehouse_id]);

      return NextResponse.json({ success: true, status: 'cancelled' });
    }

    return NextResponse.json({ error: `Action "${action}" ไม่รองรับ` }, { status: 400 });
  } catch (err) {
    console.error('PUT return-note error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
