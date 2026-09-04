import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

async function main() {
  // Find variation by barcode
  const { data: variations, error: vErr } = await supabase
    .from('product_variations')
    .select('id, product_id, variation_label, sku, barcode, product:products(id, code, name, company_id)')
    .eq('barcode', '6943478018259');

  if (vErr) { console.error('Variation error:', vErr); return; }
  console.log('=== Variations found ===');
  console.log(JSON.stringify(variations, null, 2));

  if (variations.length === 0) {
    // Try by product name
    const { data: prods } = await supabase
      .from('products')
      .select('id, code, name')
      .ilike('name', '%Hape%Mighty Mountain%');
    console.log('Products by name:', JSON.stringify(prods, null, 2));
    return;
  }

  const variationId = variations[0].id;
  console.log('\nvariation_id:', variationId);

  // Get ALL inventory records for this variation
  const { data: invRecords } = await supabase
    .from('inventory')
    .select('id, company_id, warehouse_id, variation_id, quantity, reserved_quantity, updated_at')
    .eq('variation_id', variationId);

  console.log('\n=== Inventory records (all warehouses) ===');
  console.log(JSON.stringify(invRecords, null, 2));

  // Total
  const totalQty = (invRecords || []).reduce((s, r) => s + (r.quantity || 0), 0);
  console.log('\nTotal quantity across all warehouses:', totalQty);

  // Get warehouse names
  if (invRecords && invRecords.length > 0) {
    const whIds = [...new Set(invRecords.map(r => r.warehouse_id))];
    const { data: warehouses } = await supabase
      .from('warehouses')
      .select('id, name, code, is_default')
      .in('id', whIds);
    console.log('\n=== Warehouses ===');
    for (const wh of warehouses || []) {
      const inv = invRecords.find(r => r.warehouse_id === wh.id);
      console.log(`  ${wh.name} (${wh.code || 'no code'}) ${wh.is_default ? '[DEFAULT]' : ''}: quantity=${inv?.quantity}, reserved=${inv?.reserved_quantity}`);
    }
  }

  // Get ALL transactions for this variation
  const { data: transactions } = await supabase
    .from('inventory_transactions')
    .select('id, warehouse_id, type, quantity, balance_after, reference_type, reference_id, notes, created_at')
    .eq('variation_id', variationId)
    .order('created_at', { ascending: true });

  console.log('\n=== All Transactions ===');
  if (transactions && transactions.length > 0) {
    // Get warehouse names for transactions
    const txWhIds = [...new Set(transactions.map(t => t.warehouse_id))];
    const { data: txWarehouses } = await supabase
      .from('warehouses')
      .select('id, name')
      .in('id', txWhIds);
    const whMap = Object.fromEntries((txWarehouses || []).map(w => [w.id, w.name]));

    for (const tx of transactions) {
      const sign = ['out', 'transfer_out', 'sale', 'issue'].includes(tx.type) ? '-' : '+';
      console.log(`  ${tx.created_at} | ${tx.type.padEnd(14)} | ${sign}${tx.quantity} | balance=${tx.balance_after} | ${whMap[tx.warehouse_id] || tx.warehouse_id} | ${tx.reference_type}:${tx.reference_id?.substring(0, 8)} | ${tx.notes || ''}`);
    }
  } else {
    console.log('  No transactions found');
  }
}

main().catch(console.error);
