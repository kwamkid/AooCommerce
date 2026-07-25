// E2E test: register → onboarding finalize → verify seeded data → connect
// endpoints → cleanup. Runs against a local dev server (default :3100).
// Creates REAL rows in the live DB and always deletes them at the end.
// Usage: node scripts/test-onboarding-flow.mjs [baseUrl]

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.argv[2] || 'http://localhost:3100';

// --- env from .env.local ---
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  // Keep only the first whitespace-delimited token and strip non-ASCII —
  // .env.local has inline annotations (e.g. "← ...") after some values.
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, '').split(/\s+/)[0].replace(/[^\x20-\x7E]/g, '');
}
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const PUB_KEY = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SECRET_KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !PUB_KEY || !SECRET_KEY) {
  console.error('missing supabase env in .env.local'); process.exit(1);
}
const admin = createClient(SUPABASE_URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ts = Date.now();
const EMAIL = `e2e-onboarding+${ts}@aootest.local`;
const PASSWORD = `E2e!${ts}x`;
const COMPANY_NAME = `E2E Test Co ${ts}`;

let userId = null;
let companyId = null;
let accessToken = null;
const results = [];

function record(id, ok, detail = '') {
  results.push({ id, ok, detail });
  console.log(`${ok ? '✅' : '❌'} ${id}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, { method = 'GET', body, token = accessToken, companyId: cid = companyId, redirect } = {}) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (cid) headers['X-Company-Id'] = cid;
  const res = await fetch(`${BASE}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    redirect: redirect || 'follow',
  });
  let json = null;
  try { json = await res.clone().json(); } catch { /* not json */ }
  return { res, json };
}

async function main() {
  // A1 register
  {
    const { res, json } = await api('/api/auth/register', { method: 'POST', body: { email: EMAIL, password: PASSWORD, name: 'E2E Tester' }, token: null, companyId: null });
    record('A1 register', res.ok, res.ok ? EMAIL : JSON.stringify(json));
    if (!res.ok) throw new Error('register failed — abort');
  }

  // A2 duplicate register rejected
  {
    const { res } = await api('/api/auth/register', { method: 'POST', body: { email: EMAIL, password: PASSWORD, name: 'E2E Tester' }, token: null, companyId: null });
    record('A2 duplicate register rejected', !res.ok, `status ${res.status}`);
  }

  // A3 password grant login
  {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: PUB_KEY },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    const json = await res.json();
    accessToken = json.access_token || null;
    userId = json.user?.id || null;
    const alg = accessToken ? JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64url').toString()).alg : '?';
    record('A3 login + token', !!accessToken, `alg=${alg} (ES256 = local verify ทำงาน)`);
    if (!accessToken) throw new Error('login failed — abort');
  }

  // B1 me before onboarding — no companies
  {
    const { res, json } = await api('/api/auth/me', { companyId: null });
    record('B1 me: no companies yet', res.ok && (json?.companies?.length ?? 0) === 0, `companies=${json?.companies?.length}`);
  }

  // B2 finalize full onboarding
  {
    const { res, json } = await api('/api/onboarding/finalize', {
      method: 'POST', companyId: null,
      body: {
        company: { name: COMPANY_NAME, description: 'สร้างโดย E2E test — ลบอัตโนมัติ' },
        channels: ['retail', 'marketplace', 'pos'],
        warehouse: { name: 'คลังหลัก E2E' },
        carriers: ['kerry', 'flash', 'thailand_post'],
        payment: {
          cash: true,
          promptpay: { id: '0899999999', name: 'E2E Test' },
          banks: [{ bank_code: 'kbank', account_number: '1234567890', account_name: 'E2E Test' }],
        },
      },
    });
    companyId = json?.company_id || json?.company?.id || json?.id || null;
    record('B2 finalize onboarding', res.ok && !!companyId, companyId ? `company=${companyId}` : JSON.stringify(json).slice(0, 200));
    if (!companyId) throw new Error('finalize failed — abort');
  }

  // B3 me after — owner membership
  {
    const { res, json } = await api('/api/auth/me', { companyId: null });
    const m = json?.companies?.find(c => c.company_id === companyId);
    record('B3 membership owner', res.ok && !!m && (m.roles || []).includes('owner'), `roles=${JSON.stringify(m?.roles)}`);
  }

  // B4 warehouse seeded
  {
    const { res, json } = await api('/api/warehouses');
    const list = json?.warehouses || json || [];
    const found = Array.isArray(list) && list.some(w => (w.name || '').includes('E2E'));
    record('B4 warehouse created', res.ok && found, `count=${Array.isArray(list) ? list.length : '?'}`);
  }

  // B5 payment channels seeded
  {
    const { res, json } = await api('/api/settings/payment-channels');
    const list = json?.data || [];
    record('B5 payment channels seeded', res.ok && Array.isArray(list) && list.length >= 3, `count=${Array.isArray(list) ? list.length : '?'}`);
  }

  // B6 sales channels seeded
  {
    const { res, json } = await api('/api/sales-channels');
    const list = json?.channels || json?.sales_channels || json || [];
    record('B6 sales channels seeded', res.ok && Array.isArray(list) && list.length > 0, `count=${Array.isArray(list) ? list.length : '?'}`);
  }

  // B7 features preset
  {
    const { res, json } = await api('/api/settings/features');
    record('B7 features preset', res.ok && !!json, JSON.stringify(json).slice(0, 80));
  }

  // B8 onboarding complete
  {
    const { res, json } = await api('/api/onboarding/complete', { method: 'POST', body: {} });
    record('B8 onboarding complete', res.ok, res.ok ? '' : JSON.stringify(json).slice(0, 120));
  }

  // C1 no token → 401
  {
    const { res } = await api('/api/warehouses', { token: null });
    record('C1 unauth API rejected', res.status === 401, `status ${res.status}`);
  }

  // C2 foreign company header → no data
  {
    const { res, json } = await api('/api/warehouses', { companyId: '00000000-0000-0000-0000-000000000009' });
    const list = json?.warehouses || json || [];
    const blocked = !res.ok || (Array.isArray(list) && list.length === 0);
    record('C2 foreign X-Company-Id blocked', blocked, `status ${res.status} count=${Array.isArray(list) ? list.length : '-'}`);
  }

  // C3 proxy: /dashboard without cookie → redirect /login
  {
    const res = await fetch(`${BASE}/dashboard`, { redirect: 'manual' });
    const loc = res.headers.get('location') || '';
    record('C3 proxy guards /dashboard', [307, 308, 302].includes(res.status) && loc.includes('/login'), `→ ${loc || res.status}`);
  }

  // D1 shopee auth-url
  {
    const { res, json } = await api('/api/shopee/oauth/auth-url');
    const url = json?.url || json?.auth_url || '';
    if (res.ok && /shopee/i.test(url)) record('D1 shopee auth-url', true, url.slice(0, 60) + '…');
    else record('D1 shopee auth-url', false, `status ${res.status} ${JSON.stringify(json).slice(0, 120)} (env Shopee อาจไม่ตั้งใน local = คาดได้)`);
  }

  // E1 fb-channel status endpoint answers
  {
    const { res, json } = await api('/api/settings/fb-channel');
    record('E1 fb-channel status', res.status !== 500, `status ${res.status} ${JSON.stringify(json).slice(0, 80)}`);
  }
}

async function cleanup() {
  console.log('\n🧹 cleanup…');
  try {
    if (companyId) {
      for (const table of ['company_members', 'payment_channels', 'sales_channels', 'chat_accounts', 'inventory', 'warehouses', 'carriers', 'tax_branches', 'variation_types', 'company_features', 'subscriptions']) {
        const { error } = await admin.from(table).delete().eq('company_id', companyId);
        if (error && !/does not exist/.test(error.message)) console.log(`  (${table}: ${error.message})`);
      }
      const { error: cErr } = await admin.from('companies').delete().eq('id', companyId);
      console.log(cErr ? `  companies: ${cErr.message}` : `  companies: deleted ${companyId}`);
    }
    if (userId) {
      await admin.from('user_profiles').delete().eq('id', userId);
      const { error } = await admin.auth.admin.deleteUser(userId);
      console.log(error ? `  auth user: ${error.message}` : `  auth user: deleted ${userId}`);
    }
  } catch (e) {
    console.log('  cleanup error:', e.message);
  }
}

try {
  await main();
} catch (e) {
  console.error('💥 aborted:', e.message);
} finally {
  await cleanup();
  const pass = results.filter(r => r.ok).length;
  console.log(`\n== ${pass}/${results.length} passed ==`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
}
