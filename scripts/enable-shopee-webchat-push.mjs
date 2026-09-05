#!/usr/bin/env node
// Enable Shopee webchat push (code 10) on an app's push config.
// Partner-level API — run ONCE per app (affects all shops connected through it).
//
// Usage:
//   node scripts/enable-shopee-webchat-push.mjs                     # show current config (partner app)
//   node scripts/enable-shopee-webchat-push.mjs --app seller        # show config of the seller app
//   node scripts/enable-shopee-webchat-push.mjs --app seller --apply
//   node scripts/enable-shopee-webchat-push.mjs --apply --callback https://example.com/api/shopee/webhook
//   node scripts/enable-shopee-webchat-push.mjs --app seller --apply --codes 3,4,10,12,15   # เปิดหลาย code
//   node scripts/enable-shopee-webchat-push.mjs --app partner --apply --block 111,222        # ร้านที่ไม่ให้ app นี้ push
//
// --codes a,b,c  = set_push_config_on (ไม่ใส่ = [10] ตามชื่อสคริปต์) · code ที่เปิดอยู่แล้วและไม่ได้ระบุยังเปิดต่อ
// --block a,b,c  = blocked_shop_id_list — ใช้ตอนร้านย้ายไป app อีกตัวแล้ว ไม่ให้ app นี้ยิงซ้ำ (ส่ง [] = ปลด block)
//                  ใส่ --block โดยไม่ใส่ --codes = ไม่แตะ code ที่เปิดอยู่
//
// --app partner (default) reads SHOPEE_PARTNER_APP_ID / SHOPEE_PARTNER_APP_KEY / SHOPEE_PARTNER_APP_ENV
// --app seller           reads SHOPEE_SELLER_APP_ID / SHOPEE_SELLER_APP_KEY / SHOPEE_SELLER_APP_ENV
//                        (SHOPEE_SELLER_APP_ENV falls back to SHOPEE_PARTNER_APP_ENV)
//
// ⚠️ set_app_push_config needs callback_url in the SAME call — Shopee test-pings
//    that URL and wants a 2xx within 3s, so it can't be set separately afterwards.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Minimal .env.local loader (no dependency)
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const app = argValue('--app') === 'seller' ? 'seller' : 'partner';
const isSeller = app === 'seller';

const partnerId = parseInt(
  (isSeller ? process.env.SHOPEE_SELLER_APP_ID : process.env.SHOPEE_PARTNER_APP_ID) || '0'
);
const partnerKey = (isSeller ? process.env.SHOPEE_SELLER_APP_KEY : process.env.SHOPEE_PARTNER_APP_KEY) || '';
const env = (isSeller
  ? process.env.SHOPEE_SELLER_APP_ENV || process.env.SHOPEE_PARTNER_APP_ENV
  : process.env.SHOPEE_PARTNER_APP_ENV) || 'production';
// Sandbox v2 host — partner.test-stable.shopeemobile.com is the OLD sandbox and
// answers error_sign / "Wrong sign" for partners registered in Sandbox v2.
const baseUrl = env === 'sandbox'
  ? 'https://openplatform.sandbox.test-stable.shopee.sg'
  : 'https://partner.shopeemobile.com';

const callbackUrl = argValue('--callback') || 'https://aoocommerce.vercel.app/api/shopee/webhook';

if (!partnerId || !partnerKey) {
  console.error(isSeller
    ? 'Missing SHOPEE_SELLER_APP_ID / SHOPEE_SELLER_APP_KEY'
    : 'Missing SHOPEE_PARTNER_APP_ID / SHOPEE_PARTNER_APP_KEY');
  process.exit(1);
}

console.log(`App: ${app} · partner_id: ${partnerId} · env: ${env} · host: ${baseUrl}`);

function sign(apiPath, timestamp) {
  // Partner-level: base = partner_id + api_path + timestamp
  return crypto.createHmac('sha256', partnerKey)
    .update(`${partnerId}${apiPath}${timestamp}`)
    .digest('hex');
}

async function call(method, apiPath, body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const qs = new URLSearchParams({
    partner_id: String(partnerId),
    timestamp: String(timestamp),
    sign: sign(apiPath, timestamp),
  });
  const res = await fetch(`${baseUrl}${apiPath}?${qs}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const apply = process.argv.includes('--apply');

const current = await call('GET', '/api/v2/push/get_app_push_config');
console.log('Current push config:', JSON.stringify(current, null, 2));

if (!apply) {
  console.log('\nDry-run only. Re-run with --apply to enable webchat push (code 10).');
  process.exit(0);
}

const parseIds = (flag) => {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  return String(process.argv[i + 1] || '').split(',').map(v => Number(v.trim())).filter(v => Number.isFinite(v) && v > 0);
};
const codes = parseIds('--codes');
const blocked = parseIds('--block');
const payload = {
  // callback_url ต้องส่งมาด้วยทุกครั้ง — Shopee ยิงทดสอบ URL นี้และรอ 2xx ใน 3 วิ
  callback_url: callbackUrl,
  // --block อย่างเดียว = ไม่แตะ code ที่เปิดอยู่ · ไม่ใส่อะไรเลย = เปิด 10 ตามชื่อสคริปต์
  ...(codes ? { set_push_config_on: codes } : blocked ? {} : { set_push_config_on: [10] }),
  ...(blocked ? { blocked_shop_id_list: blocked } : {}),
};
console.log('Setting:', JSON.stringify(payload));
const result = await call('POST', '/api/v2/push/set_app_push_config', payload);
console.log('set_app_push_config result:', JSON.stringify(result, null, 2));

const after = await call('GET', '/api/v2/push/get_app_push_config');
console.log('New push config:', JSON.stringify(after, null, 2));
