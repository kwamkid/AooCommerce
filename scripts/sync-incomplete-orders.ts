#!/usr/bin/env npx tsx
// Re-sync ทุกออเดอร์ Shopee ที่ยังไม่จบ (external_status ไม่ใช่ COMPLETED/CANCELLED/IN_CANCEL)
// ของทุกร้านที่ active — ใช้ logic เดียวกับปุ่ม sync ในระบบ (syncIncompleteOrders)
// สำหรับกรณีบิลค้างสถานะเก่ากว่าหน้าต่าง polling ของ cron (ดู fix-bug.md 2026-08-28)
//
// Usage:
//   npx tsx scripts/sync-incomplete-orders.ts              # ทุกร้าน Shopee ที่ active
//   npx tsx scripts/sync-incomplete-orders.ts stokke       # เฉพาะร้านที่ชื่อมีคำนี้
//
// Reads env from .env.local (Supabase service role + Shopee partner creds)

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    // ตัด inline comment (" # ..." และอักขระนอก ASCII เช่น "←") แบบเดียวกับ dotenv ของ Next
    const value = m[2]
      .replace(/\s+#.*$/, '')
      .replace(/[^\x20-\x7E].*$/, '')
      .trim()
      .replace(/^["']|["']$/g, '');
    process.env[m[1]] = value;
  }
}

async function main() {
  // import หลังตั้ง env — supabase-admin/shopee api อ่าน process.env ตอน import
  const { supabaseAdmin } = await import('../lib/supabase-admin');
  const { syncIncompleteOrders } = await import('../lib/shopee/sync');
  const { isShopeeQuotaBlocked } = await import('../lib/shopee/api');

  const quota = await isShopeeQuotaBlocked();
  if (quota.blocked) {
    console.error(`Shopee quota exhausted — blocked until ${quota.until}`);
    process.exit(1);
  }

  const filter = process.argv[2]?.toLowerCase();
  const { data: accounts, error } = await supabaseAdmin
    .from('marketplace_accounts')
    .select('*')
    .eq('is_active', true)
    .or('platform.eq.shopee,platform.is.null')
    .not('refresh_token', 'is', null)
    .order('last_sync_at', { ascending: true, nullsFirst: true });
  if (error) throw error;

  const targets = (accounts || []).filter(
    (a) => !filter || String(a.shop_name || '').toLowerCase().includes(filter)
  );
  if (!targets.length) {
    console.error(`No active Shopee accounts matched "${filter ?? ''}"`);
    process.exit(1);
  }
  console.log(`Shops (${targets.length}): ${targets.map((a) => a.shop_name).join(', ')}`);

  let failed = 0;
  for (const account of targets) {
    console.log(`\n=== ${account.shop_name} (shop_id=${account.shop_id}) ===`);
    try {
      const result = await syncIncompleteOrders(account, (e) => {
        console.log(`  [${e.phase}] ${e.label ?? ''} ${e.current}${e.total ? `/${e.total}` : ''}`);
      });
      console.log(
        `  done: updated=${result.orders_updated} skipped=${result.orders_skipped} errors=${result.errors.length}`
      );
      if (result.errors.length) console.log('  errors:', result.errors.slice(0, 5));
    } catch (e) {
      failed++;
      console.error('  FAILED:', e instanceof Error ? e.message : e);
    }
  }
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
