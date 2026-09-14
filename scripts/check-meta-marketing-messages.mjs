#!/usr/bin/env node
// เช็คว่า "ข้อความการตลาด" (Marketing Message API for Messenger) ตอนนี้ทำอะไรได้บ้าง — อ่านอย่างเดียว
//
// บริบท: Recurring Notifications เดิม (opt-in → notification_messages_token) Meta ประกาศ deprecate
// 10 ก.พ. 2026 และปิดรับสมัครใหม่ตั้งแต่ 1 ก.ย. 2025 · ตัวแทนคือ Marketing Message API ที่ส่งผ่าน
// **บัญชีโฆษณา** (act_<AD_ACCOUNT_ID>/message_campaign → /messages ด้วย subscription_token)
// สคริปต์นี้ยิงของจริงเพื่อตอบว่า "อะไรได้ อะไรไม่ได้" ก่อนจะออกแบบหน้าจอ
//
// ต่อเพจ Facebook: (1) /debug_token → มี scope อะไรบ้าง (paid_marketing_messages ·
//                      marketing_messages_messenger · ads_management · pages_messaging)
//                  (2) GET /{page_id}/notification_message_tokens → endpoint ยังตอบไหม
//                      มีผู้สมัครค้างจากยุค RN ไหม หรือคืน error รหัสอะไร
// ต่อบัญชีโฆษณา:   (3) GET /act_{id} → บัญชีใช้ได้ไหม สกุลเงิน ใช้จ่ายไปเท่าไหร่
//                  (4) GET /act_{id}/message_campaigns → edge ของ Marketing Message มีจริงไหม
// ต่อ token business ที่เชื่อมไว้ตอนทดลอง (app_flags meta_mm_business:<company>): scope ที่ได้มา
//
// Usage: node scripts/check-meta-marketing-messages.mjs [--company <company_id>] [--include-inactive]
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · NEXT_PUBLIC_FACEBOOK_APP_ID · FACEBOOK_APP_SECRET
// ⛔ ไม่สร้างแคมเปญ ไม่ส่งข้อความถึงลูกค้า ไม่แก้ DB · ไม่พิมพ์ token ออกจอ

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
const company = argValue('--company', null);

async function graph(pathAndQuery) {
  const res = await fetch(`${GRAPH}${pathAndQuery}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}
const errText = (b) => `code ${b?.error?.code ?? '?'}${b?.error?.error_subcode ? `/${b.error.error_subcode}` : ''} · ${(b?.error?.message || '').slice(0, 110)}`;

// ── เพจ Facebook ──────────────────────────────────────────────────────────
let q = supabase.from('chat_accounts')
  .select('id, company_id, account_name, credentials, is_active')
  .eq('platform', 'facebook').order('account_name');
if (!hasFlag('--include-inactive')) q = q.eq('is_active', true);
if (company) q = q.eq('company_id', company);
const { data: accounts, error } = await q;
if (error) { console.error(error.message); process.exit(1); }

const companyIds = [...new Set((accounts || []).map(a => a.company_id))];
const { data: companies } = await supabase.from('companies').select('id, name').in('id', companyIds.length ? companyIds : ['00000000-0000-0000-0000-000000000000']);
const companyName = new Map((companies || []).map(c => [c.id, c.name]));

const MM_SCOPES = ['paid_marketing_messages', 'marketing_messages_messenger'];
const pageRows = [];
const subscriberSamples = [];

for (const acc of accounts || []) {
  const creds = acc.credentials || {};
  const token = creds.page_access_token;
  const pageId = creds.page_id;
  const row = {
    company: companyName.get(acc.company_id) || acc.company_id.slice(0, 8),
    page: acc.account_name,
    active: acc.is_active ? 'yes' : 'no',
    token_valid: '-',
    mm_scope: '-',
    ads_mgmt: '-',
    pages_messaging: '-',
    subscribers: '-',
  };
  if (!token || !pageId) { row.token_valid = 'no token/page_id'; pageRows.push(row); continue; }

  const dbg = await graph(`/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
  const d = dbg.body?.data;
  if (d) {
    row.token_valid = d.is_valid ? 'yes' : `no (${d.error?.message || 'invalid'})`;
    const scopes = Array.isArray(d.scopes) ? d.scopes : [];
    const got = MM_SCOPES.filter(s => scopes.includes(s));
    row.mm_scope = got.length ? got.join(',') : `NO (${scopes.length} scopes)`;
    row.ads_mgmt = scopes.includes('ads_management') ? 'yes' : 'no';
    row.pages_messaging = scopes.includes('pages_messaging') ? 'yes' : 'no';
  } else {
    row.token_valid = `debug_token failed ${dbg.status} · ${errText(dbg.body)}`;
  }

  // คำถามหลัก: endpoint รายชื่อผู้สมัครยังตอบไหมหลัง RN ถูก deprecate
  const subs = await graph(`/${pageId}/notification_message_tokens?limit=5&access_token=${encodeURIComponent(token)}`);
  if (subs.status === 200 && Array.isArray(subs.body?.data)) {
    row.subscribers = `OK ${subs.body.data.length} คน (หน้าแรก)`;
    if (subs.body.data.length) {
      const s = subs.body.data[0];
      subscriberSamples.push({
        page: acc.account_name,
        // ไม่พิมพ์ token — เอาแค่ว่ามีฟิลด์อะไรใช้ได้บ้าง
        fields: Object.keys(s).join(','),
        topic_title: s.topic_title ?? '-',
        user_token_status: s.user_token_status ?? '-',
        next_eligible_time: s.next_eligible_time ?? '-',
        token_expiry: s.token_expiry_timestamp ?? '-',
      });
    }
  } else {
    row.subscribers = `HTTP ${subs.status} · ${errText(subs.body)}`;
  }
  pageRows.push(row);
}

console.log('\n=== เพจ Facebook: สิทธิ์ + รายชื่อผู้สมัคร ===');
console.table(pageRows);
if (subscriberSamples.length) {
  console.log('\n=== ตัวอย่างข้อมูลผู้สมัคร 1 คนต่อเพจ (ไม่แสดง token) ===');
  console.table(subscriberSamples);
}

// ── บัญชีโฆษณา ────────────────────────────────────────────────────────────
let aq = supabase.from('ad_accounts')
  .select('id, company_id, external_id, name, business_id, business_name, currency, access_token, status, token_expires_at')
  .eq('platform', 'meta');
if (company) aq = aq.eq('company_id', company);
const { data: adAccounts } = await aq;

const adRows = [];
for (const ad of adAccounts || []) {
  const row = {
    company: companyName.get(ad.company_id) || ad.company_id.slice(0, 8),
    ad_account: ad.name || ad.external_id,
    status_db: ad.status,
    account_ok: '-',
    currency: ad.currency || '-',
    amount_spent: '-',
    message_campaigns_edge: '-',
  };
  const token = ad.access_token;
  if (!token) { row.account_ok = 'no token'; adRows.push(row); continue; }

  const info = await graph(`/act_${ad.external_id}?fields=name,account_status,currency,amount_spent,business&access_token=${encodeURIComponent(token)}`);
  if (info.status === 200) {
    row.account_ok = `yes (account_status ${info.body?.account_status})`;
    row.currency = info.body?.currency || row.currency;
    row.amount_spent = info.body?.amount_spent ?? '-';
  } else {
    row.account_ok = `HTTP ${info.status} · ${errText(info.body)}`;
  }

  // edge ของ Marketing Message API — GET เพื่อดูว่ามีจริง/มีสิทธิ์ไหม (ไม่ POST = ไม่สร้างแคมเปญ)
  const mc = await graph(`/act_${ad.external_id}/message_campaigns?limit=3&access_token=${encodeURIComponent(token)}`);
  row.message_campaigns_edge = mc.status === 200
    ? `OK ${Array.isArray(mc.body?.data) ? mc.body.data.length : '?'} แคมเปญ`
    : `HTTP ${mc.status} · ${errText(mc.body)}`;
  adRows.push(row);
}

console.log('\n=== บัญชีโฆษณา (ทางส่งของ Marketing Message API) ===');
console.table(adRows);

// ── token business ที่เชื่อมไว้ตอนทดลอง ───────────────────────────────────
let fq = supabase.from('app_flags').select('key, value, updated_at').like('key', 'meta_mm_business:%');
const { data: flags } = await fq;
const flagRows = [];
for (const f of flags || []) {
  const cid = f.key.split(':')[1];
  if (company && cid !== company) continue;
  const token = f.value?.access_token;
  const row = {
    company: companyName.get(cid) || cid?.slice(0, 8) || '-',
    connected_at: f.value?.connected_at ? String(f.value.connected_at).slice(0, 16) : '-',
    token_valid: '-', type: '-', mm_scope: '-',
  };
  if (!token) { row.token_valid = 'no token'; flagRows.push(row); continue; }
  const dbg = await graph(`/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`);
  const d = dbg.body?.data;
  if (d) {
    row.token_valid = d.is_valid ? 'yes' : `no (${d.error?.message || 'invalid'})`;
    row.type = d.type || '-';
    const scopes = Array.isArray(d.scopes) ? d.scopes : [];
    const got = MM_SCOPES.filter(s => scopes.includes(s));
    row.mm_scope = got.length ? got.join(',') : `NO (${scopes.length} scopes)`;
  } else {
    row.token_valid = `debug_token failed · ${errText(dbg.body)}`;
  }
  flagRows.push(row);
}
if (flagRows.length) {
  console.log('\n=== token business ที่เชื่อมไว้ (app_flags meta_mm_business) ===');
  console.table(flagRows);
} else {
  console.log('\n=== token business: ยังไม่เคยเชื่อม (ไม่มีแถว meta_mm_business) ===');
}

console.log('\nสรุป: เพจที่มี scope ข้อความการตลาด', pageRows.filter(r => MM_SCOPES.some(s => String(r.mm_scope).includes(s))).length, '/', pageRows.length,
  '· เพจที่ดึงรายชื่อผู้สมัครได้', pageRows.filter(r => String(r.subscribers).startsWith('OK')).length, '/', pageRows.length,
  '· บัญชีโฆษณาที่ edge message_campaigns ตอบ OK', adRows.filter(r => String(r.message_campaigns_edge).startsWith('OK')).length, '/', adRows.length);
