#!/usr/bin/env node
// เช็คว่า token ของแต่ละร้าน Shopee เรียก Chat API (sellerchat) ได้จริง — ยิง get_conversation_list
// ด้วย key ของ app ที่ร้านผูกอยู่ (metadata.shopee_app) และ token ในตาราง marketplace_accounts
//
// Usage: node scripts/check-shopee-chat-shops.mjs [--company <company_id>] [--include-inactive]
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · SHOPEE_{PARTNER,SELLER}_APP_{ID,KEY,ENV}
// อ่านอย่างเดียว ไม่แก้อะไรทั้งฝั่ง Shopee และ DB · ไม่พิมพ์ token/key ออกจอ

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}
function argValue(flag, fallback) { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : fallback; }
const hasFlag = (f) => process.argv.includes(f);

const PROD = 'https://partner.shopeemobile.com';
const SANDBOX = 'https://openplatform.sandbox.test-stable.shopee.sg';
function appCreds(app) {
  const id = app === 'seller' ? process.env.SHOPEE_SELLER_APP_ID : process.env.SHOPEE_PARTNER_APP_ID;
  const key = app === 'seller' ? process.env.SHOPEE_SELLER_APP_KEY : process.env.SHOPEE_PARTNER_APP_KEY;
  const env = (app === 'seller' ? process.env.SHOPEE_SELLER_APP_ENV || process.env.SHOPEE_PARTNER_APP_ENV : process.env.SHOPEE_PARTNER_APP_ENV) || 'production';
  return { partnerId: Number(id), key, host: env === 'sandbox' ? SANDBOX : PROD };
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
let q = supabase.from('marketplace_accounts')
  .select('id, shop_id, shop_name, access_token, access_token_expires_at, metadata, is_active, company_id')
  .eq('platform', 'shopee').order('shop_name');
if (!hasFlag('--include-inactive')) q = q.eq('is_active', true);
const company = argValue('--company');
if (company) q = q.eq('company_id', company);
const { data: shops, error } = await q;
if (error) { console.error('DB error:', error.message); process.exit(1); }

let failed = 0;
for (const s of shops || []) {
  const app = s.metadata?.shopee_app === 'seller' ? 'seller' : 'partner';
  const { partnerId, key, host } = appCreds(app);
  const apiPath = '/api/v2/sellerchat/get_conversation_list';
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto.createHmac('sha256', key).update(`${partnerId}${apiPath}${ts}${s.access_token}${s.shop_id}`).digest('hex');
  const url = `${host}${apiPath}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}&access_token=${s.access_token}&shop_id=${s.shop_id}&direction=latest&type=all&page_size=5`;
  let line = `${String(s.shop_id).padEnd(11)} ${s.shop_name.padEnd(26)} app=${app.padEnd(7)}`;
  try {
    const res = await fetch(url);
    const body = await res.json();
    if (body.error) { failed++; line += ` ✗ ${body.error}: ${body.message || ''}`; }
    else {
      const list = body.response?.conversations || [];
      const more = body.response?.page_result?.more ? ' (มีต่อ)' : '';
      line += ` ✓ conversations=${list.length}${more}`;
    }
  } catch (e) { failed++; line += ` ✗ ${e.message}`; }
  console.log(line);
}
console.log(`\n${(shops || []).length - failed}/${(shops || []).length} ร้านเรียก Chat API ได้`);
process.exit(failed ? 1 : 0);
