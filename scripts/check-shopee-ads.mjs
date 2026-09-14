#!/usr/bin/env node
// พิสูจน์ว่า "ค่าธรรมเนียมเติมเงินโฆษณาจากเงิน Escrow" ที่ถูกหักในใบ settlement
// **เข้ากระเป๋าเครดิตโฆษณาของร้านจริง** ไม่ใช่ค่าธรรมเนียมที่ Shopee กินไป
//
// ต่อร้าน ยิง 2 API (อ่านอย่างเดียว ไม่แก้อะไรทั้งฝั่ง Shopee และ DB):
//   1. /api/v2/ads/get_shop_toggle_info → `auto_top_up` เปิดอยู่ไหม (= ตั้งให้หักจากยอดขายไปเติมแอด)
//   2. /api/v2/ads/get_total_balance    → ยอดเครดิตโฆษณาคงเหลือตอนนี้
// แล้วเทียบกับยอดที่ถูกหักจริงใน `marketplace_settlements.ads` ของร้านนั้น
//
// อ่านค่า: auto_top_up = true + มียอดหักในใบ settlement ⇒ เงินก้อนนั้นย้ายเข้าเครดิตโฆษณา
//          auto_top_up = false แต่ยังมียอดหัก ⇒ เพิ่งปิดไป หรือเป็นค่าธรรมเนียมอย่างอื่นจริง ๆ ต้องไล่ต่อ
//
// Usage: node scripts/check-shopee-ads.mjs [--company <company_id>] [--include-inactive] [--days 90]
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · SHOPEE_{PARTNER,SELLER}_APP_{ID,KEY,ENV}
// ไม่พิมพ์ token/key ออกจอ

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

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (f) => process.argv.includes(f);

const PROD = 'https://partner.shopeemobile.com';
const SANDBOX = 'https://openplatform.sandbox.test-stable.shopee.sg';
function appCreds(app) {
  const id = app === 'seller' ? process.env.SHOPEE_SELLER_APP_ID : process.env.SHOPEE_PARTNER_APP_ID;
  const key = app === 'seller' ? process.env.SHOPEE_SELLER_APP_KEY : process.env.SHOPEE_PARTNER_APP_KEY;
  const env = (app === 'seller'
    ? process.env.SHOPEE_SELLER_APP_ENV || process.env.SHOPEE_PARTNER_APP_ENV
    : process.env.SHOPEE_PARTNER_APP_ENV) || 'production';
  return { partnerId: Number(id), key, host: env === 'sandbox' ? SANDBOX : PROD };
}

const days = Number(argValue('--days') || 90);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

let q = supabase.from('marketplace_accounts')
  .select('id, shop_id, shop_name, access_token, metadata, is_active, company_id')
  .eq('platform', 'shopee').order('shop_name');
if (!hasFlag('--include-inactive')) q = q.eq('is_active', true);
const company = argValue('--company');
if (company) q = q.eq('company_id', company);
const { data: shops, error } = await q;
if (error) { console.error('DB error:', error.message); process.exit(1); }

// app แบบ seller ของแต่ละบริษัท — app ของบริษัทมาก่อน env เสมอ
const sellerApps = new Map();
{
  let aq = supabase.from('marketplace_app_credentials')
    .select('company_id, partner_id, partner_key, env')
    .eq('platform', 'shopee').eq('app_role', 'seller').eq('is_active', true);
  if (company) aq = aq.eq('company_id', company);
  const { data: apps } = await aq;
  for (const a of apps || []) {
    sellerApps.set(a.company_id, {
      partnerId: Number(a.partner_id),
      key: a.partner_key,
      host: a.env === 'sandbox' ? SANDBOX : PROD,
    });
  }
}

/** ยอดที่ถูกหักไปเติมแอดตามใบ settlement ของร้านนั้น (ช่วง --days วันล่าสุด) */
async function deductedAds(accountId) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data } = await supabase.from('marketplace_settlements')
    .select('ads')
    .eq('marketplace_account_id', accountId)
    .gt('ads', 0)
    .gte('created_at', since);
  const rows = data || [];
  return { orders: rows.length, total: rows.reduce((sum, r) => sum + Number(r.ads || 0), 0) };
}

async function callAds(creds, shop, apiPath) {
  const { partnerId, key, host } = creds;
  const token = shop.access_token;
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto.createHmac('sha256', key)
    .update(`${partnerId}${apiPath}${ts}${token}${shop.shop_id}`).digest('hex');
  const url = `${host}${apiPath}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}`
    + `&access_token=${token}&shop_id=${shop.shop_id}`;
  const res = await fetch(url);
  return res.json();
}

const baht = (n) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

console.log(`ยอดหักไปเติมแอด = ${days} วันล่าสุด · เครดิตคงเหลือ = ค่า ณ ตอนนี้\n`);
console.log(`${'ร้าน'.padEnd(26)} ${'auto_top_up'.padEnd(12)} ${'เครดิตคงเหลือ'.padStart(16)} ${'ถูกหักไปเติม'.padStart(16)}  ออเดอร์`);
console.log('-'.repeat(90));

for (const shop of shops || []) {
  const app = shop.metadata?.shopee_app === 'seller' ? 'seller' : 'partner';
  const creds = app === 'seller' ? (sellerApps.get(shop.company_id) || appCreds('seller')) : appCreds('partner');
  const name = (shop.shop_name || String(shop.shop_id)).slice(0, 26).padEnd(26);
  const spent = await deductedAds(shop.id);

  let toggle = '?';
  let balance = '?';
  try {
    const t = await callAds(creds, shop, '/api/v2/ads/get_shop_toggle_info');
    toggle = t.error ? `✗ ${t.error}` : (t.response?.auto_top_up ? 'เปิด' : 'ปิด');
  } catch (e) { toggle = `✗ ${e.message}`; }
  try {
    const b = await callAds(creds, shop, '/api/v2/ads/get_total_balance');
    balance = b.error ? `✗ ${b.error}` : baht(Number(b.response?.total_balance || 0));
  } catch (e) { balance = `✗ ${e.message}`; }

  console.log(`${name} ${String(toggle).padEnd(12)} ${String(balance).padStart(16)} ${baht(spent.total).padStart(16)}  ${spent.orders}`);
}

console.log('\nอ่านผล: auto_top_up เปิด + มียอดถูกหัก = เงินก้อนนั้นย้ายเข้าเครดิตโฆษณาของร้าน ไม่ได้หายไปกับค่าธรรมเนียม');
