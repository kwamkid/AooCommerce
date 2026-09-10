#!/usr/bin/env node
// เช็คบัญชีโฆษณา Meta ที่เชื่อมไว้ (ตาราง ad_accounts) ว่า token ยังใช้ได้ · dataset เปิดได้ · สิทธิ์ audience ถึงไหม — อ่านอย่างเดียว
//
// ต่อบัญชี: (1) /debug_token (ถ้า token เป็นของแอปเรา) → valid/หมดอายุ/scopes
//          (2) GET /act_{id}?fields=name,currency  → token + ads_read
//          (3) GET /{dataset_id}?fields=id,name     → dataset ที่ตั้งไว้เปิดได้ไหม
//          (4) GET /act_{id}/customaudiences?limit=1 → ads_management (ตอบ code 200/subcode 1870090 = ยังไม่ยอมรับ ToS)
//
// Usage: node scripts/check-meta-ads.mjs [--company <company_id>] [--include-inactive]
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · NEXT_PUBLIC_FACEBOOK_APP_ID · FACEBOOK_APP_SECRET
// ไม่แก้อะไรทั้งฝั่ง Meta และ DB · ไม่พิมพ์ token ออกจอ
//
// ใช้เมื่อ: หลังเชื่อมบัญชีโฆษณาใหม่ / ป้ายบนการ์ดขึ้นเหลืองแล้วอยากรู้ว่า Meta ตอบอะไรเป๊ะ ๆ

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

const GRAPH = 'https://graph.facebook.com/v21.0';
const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
const appSecret = process.env.FACEBOOK_APP_SECRET;
const appToken = appId && appSecret ? `${appId}|${appSecret}` : null;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
let q = supabase.from('ad_accounts')
  .select('id, company_id, external_id, name, dataset_id, dataset_name, access_token, token_source, token_expires_at, status, last_error, capi_ok_at, audiences_ok_at, is_active')
  .eq('platform', 'meta').order('name');
if (!hasFlag('--include-inactive')) q = q.eq('is_active', true);
const company = argValue('--company', null);
if (company) q = q.eq('company_id', company);
const { data: accounts, error } = await q;
if (error) { console.error(error.message); process.exit(1); }
if (!accounts?.length) { console.log('ยังไม่มีบัญชีโฆษณาในตาราง ad_accounts'); process.exit(0); }

const { data: companies } = await supabase.from('companies').select('id, name').in('id', [...new Set(accounts.map(a => a.company_id))]);
const companyName = new Map((companies || []).map(c => [c.id, c.name]));

async function graph(pathAndQuery) {
  const res = await fetch(`${GRAPH}${pathAndQuery}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
const errLine = (r) => `HTTP ${r.status} · code ${r.body?.error?.code ?? '?'}${r.body?.error?.error_subcode ? `/${r.body.error.error_subcode}` : ''} · ${(r.body?.error?.message || '').slice(0, 80)}`;

const rows = [];
for (const acc of accounts) {
  const row = {
    company: companyName.get(acc.company_id) || acc.company_id.slice(0, 8),
    account: acc.name || `act_${acc.external_id}`,
    act: acc.external_id,
    source: acc.token_source,
    status: acc.status,
    token: '-', ad_account: '-', dataset: '-', audiences: '-',
  };
  const token = acc.access_token;
  if (!token) { row.token = 'no token'; rows.push(row); continue; }

  if (appToken) {
    const dbg = await graph(`/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
    const d = dbg.body?.data;
    if (d) {
      const exp = d.expires_at ? new Date(d.expires_at * 1000).toISOString().slice(0, 10) : 'never';
      const scopes = Array.isArray(d.scopes) ? d.scopes : [];
      row.token = `${d.is_valid ? 'valid' : 'INVALID'} · exp ${exp} · ads_management=${scopes.includes('ads_management') ? 'yes' : 'no'}`;
    } else {
      row.token = `debug ไม่ได้ (${dbg.body?.error?.message?.slice(0, 40) || dbg.status}) — token คนละแอป?`;
    }
  } else {
    row.token = 'ไม่มี app secret ใน env';
  }

  const a = await graph(`/act_${acc.external_id}?fields=name,currency,account_status&access_token=${encodeURIComponent(token)}`);
  row.ad_account = a.status === 200 ? `${a.body.name} · ${a.body.currency} · status ${a.body.account_status}` : errLine(a);

  if (acc.dataset_id) {
    const ds = await graph(`/${acc.dataset_id}?fields=id,name&access_token=${encodeURIComponent(token)}`);
    row.dataset = ds.status === 200 ? `${ds.body.name} (${ds.body.id})` : errLine(ds);
  } else {
    row.dataset = 'ยังไม่ได้เลือก';
  }

  const ca = await graph(`/act_${acc.external_id}/customaudiences?fields=id&limit=1&access_token=${encodeURIComponent(token)}`);
  if (ca.status === 200) row.audiences = 'ok';
  else if (ca.body?.error?.code === 200 && ca.body?.error?.error_subcode === 1870090) row.audiences = 'ต้องยอมรับ Custom Audience ToS';
  else row.audiences = errLine(ca);
  rows.push(row);
}

console.table(rows);
console.log(`\nบัญชีที่ token+ad account+dataset ผ่าน: ${rows.filter(r => r.ad_account.includes('status') && !r.dataset.startsWith('HTTP') && r.dataset !== 'ยังไม่ได้เลือก').length}/${rows.length} · audiences ok: ${rows.filter(r => r.audiences === 'ok').length}/${rows.length}`);
