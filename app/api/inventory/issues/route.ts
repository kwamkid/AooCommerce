// Path: app/api/inventory/issues/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, isAdminRole, hasAnyRole } from '@/lib/supabase-admin';
import { getStockConfig } from '@/lib/stock-utils';

// GET - List issues or get single
export async function GET(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const issueId = searchParams.get('id');

    if (issueId) {
      const { data, error } = await supabaseAdmin
        .from('inventory_issues')
        .select(`
          *,
          warehouse:warehouses(id, name, code),
          items:inventory_issue_items(
            id, variation_id, quantity, reason, notes,
            variation:product_variations(
              id, variation_label, sku, barcode, attributes,
              product:products(id, code, name, image)
            )
          )
        `)
        .eq('id', issueId)
        .eq('company_id', auth.companyId)
        .single();

      if (error || !data) {
        console.error('GET issue by id error:', { issueId, error: error?.message, code: error?.code });
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }

      if (data.created_by) {
        const { data: profile } = await supabaseAdmin
          .from('user_profiles').select('id, name, email').eq('id', data.created_by).single();
        (data as Record<string, unknown>).created_by_user = profile || null;
      }

      return NextResponse.json({ issue: data });
    }

    const { data, error } = await supabaseAdmin
      .from('inventory_issues')
      .select(`
        id, issue_number, reason, status, notes, created_at, created_by,
        warehouse:warehouses!inventory_issues_warehouse_id_fkey(id, name, code),
        items:inventory_issue_items(id)
      `)
      .eq('company_id', auth.companyId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const userIds = [...new Set((data || []).map(r => r.created_by).filter(Boolean))];
    let userMap: Record<string, { id: string; name: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin.from('user_profiles').select('id, name').in('id', userIds);
      if (profiles) userMap = Object.fromEntries(profiles.map(p => [p.id, p]));
    }

    const issues = (data || []).map(r => ({
      ...r,
      created_by_user: r.created_by ? userMap[r.created_by] || null : null,
    }));

    return NextResponse.json({ issues });
  } catch (error) {
    console.error('GET issues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST - Create issue
export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!hasAnyRole(auth.companyRoles, ['owner','admin','warehouse'])) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์เบิกสินค้า' }, { status: 403 });
    }

    const stockConfig = await getStockConfig(auth.companyId!);
    if (!stockConfig.stockEnabled) {
      return NextResponse.json({ error: 'Stock feature not enabled' }, { status: 403 });
    }

    const body = await request.json();
    const { warehouse_id, items, reason, notes } = body;

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

    // Generate issue number
    const { data: isNum } = await supabaseAdmin.rpc('generate_issue_number', { p_company_id: auth.companyId });
    const issueNumber = isNum || `IS-${Date.now()}`;

    // Create header
    const { data: issue, error: headerError } = await supabaseAdmin
      .from('inventory_issues')
      .insert({
        company_id: auth.companyId,
        issue_number: issueNumber,
        warehouse_id,
        reason: reason || null,
        notes: notes || null,
        created_by: auth.userId,
      })
      .select('id, issue_number')
      .single();

    if (headerError || !issue) {
      console.error('Create issue error:', headerError);
      return NextResponse.json({ error: 'ไม่สามารถสร้างใบเบิกออกได้' }, { status: 500 });
    }

    const results = [];
    const errors: { variation_id: string; error: string }[] = [];

    for (const item of items) {
      const { variation_id, quantity, reason: itemReason, notes: itemNotes } = item;
      if (!variation_id || !quantity || quantity <= 0) continue;

      // Check stock
      const { data: existing } = await supabaseAdmin
        .from('inventory')
        .select('id, quantity, reserved_quantity')
        .eq('warehouse_id', warehouse_id)
        .eq('variation_id', variation_id)
        .single();

      const currentQty = existing?.quantity || 0;
      const reservedQty = existing?.reserved_quantity || 0;
      const available = currentQty - reservedQty;

      if (quantity > available) {
        errors.push({
          variation_id,
          error: `มี ${available} ชิ้นพร้อมเบิก (คงเหลือ ${currentQty}, จอง ${reservedQty}) แต่ขอเบิก ${quantity} ชิ้น`,
        });
        continue;
      }

      // Insert item
      await supabaseAdmin
        .from('inventory_issue_items')
        .insert({ issue_id: issue.id, variation_id, quantity, reason: itemReason || null, notes: itemNotes || null });

      const newQuantity = currentQty - quantity;
      if (existing) {
        await supabaseAdmin
          .from('inventory')
          .update({ quantity: newQuantity, updated_at: new Date().toISOString() })
          .eq('id', existing.id);
      }

      // Create transaction
      const noteText = [itemReason, itemNotes, notes].filter(Boolean).join(' - ') || `เบิกออก ${issueNumber}`;
      await supabaseAdmin
        .from('inventory_transactions')
        .insert({
          company_id: auth.companyId,
          warehouse_id,
          variation_id,
          type: 'out',
          quantity,
          balance_after: newQuantity,
          reference_type: 'issue',
          reference_id: issue.id,
          notes: noteText,
          created_by: auth.userId,
        });

      results.push({ variation_id, quantity, new_balance: newQuantity });
    }

    if (errors.length > 0 && results.length === 0) {
      // Delete empty header
      await supabaseAdmin.from('inventory_issues').delete().eq('id', issue.id);
      return NextResponse.json({ error: errors[0].error, errors }, { status: 400 });
    }

    return NextResponse.json({ success: true, issue_id: issue.id, issue_number: issueNumber, results, errors });
  } catch (error) {
    console.error('POST issues error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
