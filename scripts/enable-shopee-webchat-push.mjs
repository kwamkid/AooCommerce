#!/usr/bin/env node
// Enable Shopee webchat push (code 10) on the partner app's push config.
// Partner-level API — run ONCE per app (affects all connected shops).
//
// Usage:
//   node scripts/enable-shopee-webchat-push.mjs           # show current config
//   node scripts/enable-shopee-webchat-push.mjs --apply   # turn on push code 10
//
// Reads SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY / SHOPEE_ENV from .env.local

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

const partnerId = parseInt(process.env.SHOPEE_PARTNER_ID || '0');
const partnerKey = process.env.SHOPEE_PARTNER_KEY || '';
const baseUrl = (process.env.SHOPEE_ENV || 'production') === 'sandbox'
  ? 'https://partner.test-stable.shopeemobile.com'
  : 'https://partner.shopeemobile.com';

if (!partnerId || !partnerKey) {
  console.error('Missing SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY');
  process.exit(1);
}

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

const result = await call('POST', '/api/v2/push/set_app_push_config', {
  set_push_config_on: [10],
});
console.log('set_app_push_config result:', JSON.stringify(result, null, 2));

const after = await call('GET', '/api/v2/push/get_app_push_config');
console.log('New push config:', JSON.stringify(after, null, 2));
