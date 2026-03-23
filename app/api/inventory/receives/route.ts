// Path: app/api/inventory/receives/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';
import { addStock, updateWeightedAverageCost } from '@/lib/stock-service';

// GET - List receives or get single
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const receiveId = searchParams.get('id');

    if (receiveId) {
      // Fetch receive header
      const { data: receiveHeader, error: headerErr } = await supabaseAdmin
        .from('inventory_receives')
        .select('*')
        .eq('id', receiveId)
        .eq('company_id', auth.companyId)
        .single();

      if (headerErr || !receiveHeader) {
        console.error('GET receive detail error:', headerErr?.message, headerErr?.details);
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      // Fetch warehouse
      let warehouse = null;
      if (receiveHeader.warehouse_id) {
        const { data: wh } = await supabaseAdmin
          .from('warehouses')
          .select('id, name, code')
          .eq('id', receiveHeader.warehouse_id)
          .single();
        warehouse = wh;
      }

      // Fetch items with nested variation + product
      const { data: itemsRaw } = await supabaseAdmin
        .from('inventory_receive_items')
        .select(`
          id, variation_id, quantity, unit_cost, notes,
          variation:product_variations(
            id, variation_label, sku, barcode, attributes,
            product:products(id, code, name, image)
          )
        `)
        .eq('receive_id', receiveId);

      const data = {
        ...receiveHeader,
        warehouse,
        items: itemsRaw || [],
      } as Record<string, unknown>;

      // Fetch created_by user name
      if (data.created_by) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles')
          .select('id, name, email')
          .eq('id', data.created_by)
          .single();
        (data as Record<string, unknown>).created_by_user = profile || null;
      }

      // Fetch PO reference if linked
      if (receiveHeader.po_id) {
        const { data: po } = await supabaseAdmin
          .from('purchase_orders')
          .select('po_number')
          .eq('id', receiveHeader.po_id)
          .single();
        data.po = po || null;
      }

      // Fetch supplier reference if linked
      if (receiveHeader.supplier_id) {
        const { data: supplier } = await supabaseAdmin
          .from('suppliers')
          .select('id, name')
          .eq('id', receiveHeader.supplier_id)
          .single();
        data.supplier = supplier || null;
      }

      return NextResponse.json({ receive: data });
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_receives')
      .select(`
        id, receive_number, status, notes, created_at, created_by,
        warehouse:warehouses!inventory_receives_warehouse_id_fkey(id, name, code),
        items:inventory_receive_items(id)
      `)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET receives DB error:', error.message, error.details, error.hint);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Batch fetch user names for created_by
    const userIds = [...new Set((data || []).map(r => r.created_by).filter(Boolean))];
    let userMap: Record<string, { id: string; name: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from('user_profiles')
        .select('id, name')
        .in('id', userIds);
      if (profiles) {
        userMap = Object.fromEntries(profiles.map(p => [p.id, p]));
      }
    }

    const receives = (data || []).map(r => ({
      ...r,
      created_by_user: r.created_by ? userMap[r.created_by] || null : null,
    }));

    return NextResponse.json({ receives });
  } catch (error) {
    console.error('GET receives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create receive
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner','admin','warehouse'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์รับเข้าสินค้า' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, items, notes, po_id, supplier_id } = body;

    if (!warehouse_id) {
      return NextResponse.json({ error: 'กรุณาเลือกคลังสินค้า' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาเพิ่มสินค้าอย่างน้อย 1 รายการ' }, { status: 400 });
    }

    // Verify warehouse
    const { data: warehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('id', warehouse_id)
      .eq('company_id', auth.companyId)
      .eq('is_active', true)
      .single();

    if (!warehouse) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });
    }

    // Generate receive number
    const { data: rvNum } = await supabaseAdmin.rpc('generate_receive_number', { p_company_id: auth.companyId });
    const receiveNumber = rvNum || `RV-${Date.now()}`;

    // Create header
    const insertData: Record<string, unknown> = {
      company_id: auth.companyId,
      receive_number: receiveNumber,
      warehouse_id,
      notes: notes || null,
      created_by: auth.userId,
    };
    if (po_id) insertData.po_id = po_id;
    if (supplier_id) insertData.supplier_id = supplier_id;

    const { data: receive, error: headerError } = await supabaseAdmin
      .from('inventory_receives')
      .insert(insertData)
      .select('id, receive_number')
      .single();

    if (headerError || !receive) {
      console.error('Create receive error:', headerError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบรับเข้าได้' }, { status: 500 });
    }

    const results = [];
    for (const item of items) {
      const { variation_id, quantity, unit_cost, notes: itemNotes } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      // Insert item
      const itemInsert: Record<string, unknown> = { receive_id: receive.id, variation_id, quantity, notes: itemNotes || null };
      if (unit_cost) itemInsert.unit_cost = unit_cost;
      const { error: itemError } = await supabaseAdmin
        .from('inventory_receive_items')
        .insert(itemInsert);
      if (itemError) {
        console.error('Insert receive item error:', itemError.message);
      }

      // Add stock via centralized service
      const result = await addStock({
        supabase: supabaseAdmin,
        companyId: auth.companyId!,
        warehouseId: warehouse_id,
        variationId: variation_id,
        qty: quantity,
        referenceType: 'receive',
        referenceId: receive.id,
        notes: itemNotes || notes || `รับเข้า ${receiveNumber}`,
        createdBy: auth.userId,
        unitCost: unit_cost || undefined,
      });
      const newQuantity = result.balanceAfter;

      // Update WAC (Weighted Average Cost) on variation when unit_cost is provided
      if (unit_cost && unit_cost > 0) {
        await updateWeightedAverageCost(
          supabaseAdmin,
          auth.companyId!,
          variation_id,
          quantity,
          unit_cost,
        );
      }

      results.push({ variation_id, quantity, new_balance: newQuantity });
    }

    // Update PO received quantities if po_id provided
    if (po_id) {
      for (const item of items) {
        const { variation_id, quantity: qty } = item;
        if (!variation_id || !qty || qty <= 0) continue;

        // Find the PO item and increment received_quantity
        const { data: poItem } = await supabaseAdmin
          .from('purchase_order_items')
          .select('id, received_quantity')
          .eq('po_id', po_id)
          .eq('variation_id', variation_id)
          .single();

        if (poItem) {
          await supabaseAdmin
            .from('purchase_order_items')
            .update({ received_quantity: (poItem.received_quantity || 0) + qty })
            .eq('id', poItem.id);
        }
      }

      // Check if all PO items are fully received → auto update PO status
      const { data: allPoItems } = await supabaseAdmin
        .from('purchase_order_items')
        .select('quantity, received_quantity')
        .eq('po_id', po_id);

      if (allPoItems && allPoItems.length > 0) {
        const allAtLeast = allPoItems.every(i => (i.received_quantity || 0) >= i.quantity);
        const allExact = allPoItems.every(i => (i.received_quantity || 0) === i.quantity);
        const someReceived = allPoItems.some(i => (i.received_quantity || 0) > 0);

        // Check if receive contains extra items not in PO
        const poVariationIds = new Set(
          (await supabaseAdmin.from('purchase_order_items').select('variation_id').eq('po_id', po_id)).data?.map(i => i.variation_id) || []
        );
        const hasExtraItems = items.some(i => i.variation_id && !poVariationIds.has(i.variation_id));

        let newPoStatus: string | null = null;
        if (allAtLeast) {
          // All PO items received at least the ordered quantity
          newPoStatus = (allExact && !hasExtraItems) ? 'received' : 'received_mismatch';
        } else if (someReceived) {
          newPoStatus = 'partial_received';
        }

        if (newPoStatus) {
          await supabaseAdmin
            .from('purchase_orders')
            .update({ status: newPoStatus })
            .eq('id', po_id)
            .in('status', ['sent', 'partial_received', 'received', 'received_mismatch']);
        }
      }
    }

    return NextResponse.json({ success: true, receive_id: receive.id, receive_number: receiveNumber, results });
  } catch (error) {
    console.error('POST receives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH - Update notes
export async function PATCH(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { id, notes } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('inventory_receives')
      .update({ notes: notes || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', auth.companyId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PATCH receives error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
