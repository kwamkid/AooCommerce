// Usage: node scripts/watch-shopee-pushes.mjs  (Ctrl+C หยุด) — เฝ้า marketplace_webhook_log ของ Shopee: พิมพ์ทุกใบใหม่ พร้อม signature_valid — ใช้พิสูจน์ว่า push จริงจาก app seller เซ็นด้วย key ที่เรามี
import fs from 'node:fs'; import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
const envPath = path.join('/Users/ampstark/aoocommerce', '.env.local');
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, ''); }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
let since = new Date().toISOString();
const seen = new Set();
for (;;) {
  const { data } = await sb.from('marketplace_webhook_log').select('id, created_at, shop_id, push_code, signature_valid, processing_status, processing_error').eq('platform', 'shopee').gt('created_at', since).order('created_at');
  for (const r of data || []) {
    if (seen.has(r.id)) continue; seen.add(r.id);
    console.log(`${r.created_at.slice(11,19)} shop=${r.shop_id} code=${r.push_code} sig=${r.signature_valid ? 'OK' : 'INVALID'} status=${r.processing_status}${r.processing_error ? ' err=' + r.processing_error : ''}`);
    if (r.created_at > since) since = r.created_at;
  }
  await new Promise(r => setTimeout(r, 30000));
}
