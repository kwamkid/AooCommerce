#!/usr/bin/env node
// เช็คว่า token ของแต่ละเพจ Facebook ยิง Meta Conversions API (CAPI) ได้จริงไหม — อ่านอย่างเดียว
//
// ต่อเพจ: (1) /debug_token → token ยัง valid ไหม + มี scope `page_events` ไหม
//         (2) GET /{page_id}/dataset ด้วย token ของเพจ → ได้ dataset id หรือ error รหัสอะไร
//            (call เดียวกับที่ lib/meta/conversions.ts ใช้ก่อนยิง Purchase event)
//
// Usage: node scripts/check-meta-capi.mjs [--company <company_id>] [--include-inactive]
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · NEXT_PUBLIC_FACEBOOK_APP_ID · FACEBOOK_APP_SECRET
// ไม่แก้อะไรทั้งฝั่ง Meta และ DB · ไม่พิมพ์ token ออกจอ
//
// ใช้เมื่อ: หลังกด "เชื่อมต่อใหม่ (ขอสิทธิ์ใหม่)" ในหน้า ตั้งค่า › ช่องทางแชท — เพจที่ผ่านต้องขึ้น
// page_events=yes และ dataset=<id> ครบทุกแถว · เพจที่ยังเป็น token เก่าจะเห็นรหัส error ของ Meta ตรง ๆ

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
if (!appId || !appSecret) { console.error('missing NEXT_PUBLIC_FACEBOOK_APP_ID / FACEBOOK_APP_SECRET'); process.exit(1); }
const appToken = `${appId}|${appSecret}`;

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);
let q = supabase.from('chat_accounts')
  .select('id, company_id, account_name, credentials, is_active')
  .eq('platform', 'facebook').order('account_name');
if (!hasFlag('--include-inactive')) q = q.eq('is_active', true);
const company = argValue('--company', null);
if (company) q = q.eq('company_id', company);
const { data: accounts, error } = await q;
if (error) { console.error(error.message); process.exit(1); }

const { data: companies } = await supabase.from('companies').select('id, name').in('id', [...new Set((accounts || []).map(a => a.company_id))]);
const companyName = new Map((companies || []).map(c => [c.id, c.name]));

async function graph(pathAndQuery) {
  const res = await fetch(`${GRAPH}${pathAndQuery}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

const rows = [];
for (const acc of accounts || []) {
  const creds = acc.credentials || {};
  const token = creds.page_access_token;
  const pageId = creds.page_id;
  const row = {
    company: companyName.get(acc.company_id) || acc.company_id.slice(0, 8),
    page: acc.account_name,
    page_id: pageId || '-',
    active: acc.is_active ? 'yes' : 'no',
    token_valid: '-', page_events: '-', dataset: '-', cached_dataset: creds.meta_dataset_id ? 'yes' : '-',
    capi_error: creds.meta_capi_error ? String(creds.meta_capi_error).slice(0, 60) : '-',
  };
  if (!token || !pageId) { row.token_valid = 'no token/page_id'; rows.push(row); continue; }

  // (1) scopes ของ token ใบนี้
  const dbg = await graph(`/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
  const d = dbg.body?.data;
  if (d) {
    row.token_valid = d.is_valid ? 'yes' : `no (${d.error?.message || 'invalid'})`;
    const scopes = Array.isArray(d.scopes) ? d.scopes : [];
    row.page_events = scopes.includes('page_events') ? 'yes' : `NO (${scopes.length} scopes)`;
  } else {
    row.token_valid = `debug_token failed ${dbg.status} ${dbg.body?.error?.code ?? ''} ${dbg.body?.error?.message ?? ''}`.trim();
  }

  // (2) call จริงที่ CAPI ใช้
  const ds = await graph(`/${pageId}/dataset?access_token=${encodeURIComponent(token)}`);
  if (ds.status === 200 && ds.body?.id) row.dataset = `id ${ds.body.id}`;
  else row.dataset = `HTTP ${ds.status} · code ${ds.body?.error?.code ?? '?'}${ds.body?.error?.error_subcode ? `/${ds.body.error.error_subcode}` : ''} · ${(ds.body?.error?.message || '').slice(0, 90)}`;
  rows.push(row);
}

console.table(rows);
const ready = rows.filter(r => r.dataset.startsWith('id ')).length;
console.log(`\nพร้อมยิง CAPI: ${ready}/${rows.length} เพจ`);
