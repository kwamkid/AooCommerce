import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany, can } from '@/lib/supabase-admin';
import { fetchAllRows } from '@/lib/supabase-paging';

interface ApplyItem {
  product_id?: string;
  variation_id: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
}

interface RpcResult {
  variation_id?: string | null;
  action: 'updated' | 'unchanged' | 'error';
  changes?: { field: string }[];
  is_combo?: boolean;
  /** combo price follows its components today and will be set by hand after this save */
  lock_price?: boolean;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const companyId = auth.companyId;

    if (!can(auth, 'product.bulk_edit')) {
      return NextResponse.json({ error: 'ไม่มีสิทธิ์' }, { status: 403 });
    }

    const canEditCost = auth.canViewCost === true;

    const { items, dry_run = false } = (await request.json()) as {
      items: ApplyItem[];
      dry_run?: boolean;
    };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'ไม่มีรายการ' }, { status: 400 });
    }

    // Combos of composite products (สินค้าชุด) — one paged query for the company's combos
    const { rows: comboRows, error: comboErr } = await fetchAllRows<{ variation_id: string }>((from, to) =>
      supabaseAdmin
        .from('product_variation_components')
        .select('variation_id')
        .eq('company_id', companyId)
        .order('variation_id')
        .range(from, to),
    );
    if (comboErr) {
      console.error('price apply combo lookup error:', comboErr);
      return NextResponse.json({ error: comboErr.message }, { status: 500 });
    }
    const allComboIds = new Set(comboRows.map(r => r.variation_id));
    const isCombo = (it: ApplyItem) => allComboIds.has(it.variation_id);

    const fileComboIds = [...new Set(items.filter(isCombo).map(it => it.variation_id))];
    const lockedIds = new Set<string>();
    for (let i = 0; i < fileComboIds.length; i += 100) {
      const { data, error } = await supabaseAdmin
        .from('product_variations')
        .select('id')
        .eq('company_id', companyId)
        .eq('price_locked', true)
        .in('id', fileComboIds.slice(i, i + 100));
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      for (const r of data || []) lockedIds.add(r.id);
    }

    // Cost is stripped for users without permission, and always for combos (a set's cost
    // comes from its components). Combos go last so a component price change in the same
    // file (which re-prices unlocked combos) cannot overwrite the price typed for the combo.
    const indexed = items.map((it, index) => {
      const drop = !canEditCost || isCombo(it);
      const { cost_price: _cost, ...rest } = it;
      return { index, item: drop ? rest : it };
    });
    const ordered = [...indexed.filter(x => !isCombo(items[x.index])), ...indexed.filter(x => isCombo(items[x.index]))];

    const { data, error } = await supabaseAdmin.rpc('bulk_update_variation_prices', {
      p_company_id: companyId,
      p_items: ordered.map(x => x.item),
      p_dry_run: dry_run,
      p_can_edit_cost: canEditCost,
    });

    if (error) {
      console.error('bulk_update_variation_prices RPC error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // The RPC returns one result per item, in item order — put them back in file order
    const rpcResults: RpcResult[] = data?.results || [];
    let results = rpcResults;
    if (rpcResults.length === ordered.length) {
      results = new Array(items.length);
      ordered.forEach((x, pos) => { results[x.index] = rpcResults[pos]; });
    }

    // A combo whose price is edited here becomes a manual price (price_locked) —
    // otherwise the next component price change would overwrite it
    const toLock: string[] = [];
    for (const r of results) {
      if (!r?.variation_id || !allComboIds.has(r.variation_id)) continue;
      r.is_combo = true;
      const priceChanged = r.action === 'updated'
        && (r.changes || []).some(c => c.field === 'default_price' || c.field === 'discount_price');
      if (priceChanged && !lockedIds.has(r.variation_id)) {
        r.lock_price = true;
        toLock.push(r.variation_id);
      }
    }
    if (!dry_run && toLock.length > 0) {
      const ids = [...new Set(toLock)];
      for (let i = 0; i < ids.length; i += 100) {
        const { error: lockErr } = await supabaseAdmin
          .from('product_variations')
          .update({ price_locked: true })
          .eq('company_id', companyId)
          .in('id', ids.slice(i, i + 100));
        if (lockErr) {
          console.error('price apply lock combos error:', lockErr);
          return NextResponse.json({ error: `บันทึกราคาแล้ว แต่ตั้งราคาชุดเป็น "ราคาตั้งเอง" ไม่สำเร็จ: ${lockErr.message}` }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ ...data, results });
  } catch (error) {
    console.error('price apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
