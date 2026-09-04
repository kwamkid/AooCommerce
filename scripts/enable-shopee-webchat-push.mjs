#!/usr/bin/env node
// Enable Shopee webchat push (code 10) on an app's push config.
// Partner-level API — run ONCE per app (affects all shops connected through it).
//
// Usage:
//   node scripts/enable-shopee-webchat-push.mjs                     # show current config (partner app)
//   node scripts/enable-shopee-webchat-push.mjs --app seller        # show config of the seller app
//   node scripts/enable-shopee-webchat-push.mjs --app seller --apply
//   node scripts/enable-shopee-webchat-push.mjs --apply --callback https://example.com/api/shopee/webhook
//
// --app partner (default) reads SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_ENV
// --app seller           reads SHOPEE_SELLER_PARTNER_ID / SHOPEE_SELLER_PARTNER_KEY / SHOPEE_SELLER_ENV
//                        (SHOPEE_SELLER_ENV falls back to SHOPEE_ENV)
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
  (isSeller ? process.env.SHOPEE_SELLER_PARTNER_ID : process.env.SHOPEE_PARTNER_ID) || '0'
);
const partnerKey = (isSeller ? process.env.SHOPEE_SELLER_PARTNER_KEY : process.env.SHOPEE_PARTNER_KEY) || '';
const env = (isSeller
  ? process.env.SHOPEE_SELLER_ENV || process.env.SHOPEE_ENV
  : process.env.SHOPEE_ENV) || 'production';
// Sandbox v2 host — partner.test-stable.shopeemobile.com is the OLD sandbox and
// answers error_sign / "Wrong sign" for partners registered in Sandbox v2.
const baseUrl = env === 'sandbox'
  ? 'https://openplatform.sandbox.test-stable.shopee.sg'
  : 'https://partner.shopeemobile.com';

const callbackUrl = argValue('--callback') || 'https://aoocommerce.vercel.app/api/shopee/webhook';

if (!partnerId || !partnerKey) {
  console.error(isSeller
    ? 'Missing SHOPEE_SELLER_PARTNER_ID / SHOPEE_SELLER_PARTNER_KEY'
    : 'Missing SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY');
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

console.log('Setting callback_url:', callbackUrl);
const result = await call('POST', '/api/v2/push/set_app_push_config', {
  // callback_url ต้องส่งมาด้วยทุกครั้ง — Shopee ยิงทดสอบ URL นี้และรอ 2xx ใน 3 วิ
  callback_url: callbackUrl,
  set_push_config_on: [10],
});
console.log('set_app_push_config result:', JSON.stringify(result, null, 2));

const after = await call('GET', '/api/v2/push/get_app_push_config');
console.log('New push config:', JSON.stringify(after, null, 2));
