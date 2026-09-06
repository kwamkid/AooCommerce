#!/usr/bin/env node
// เช็คว่า token ของแต่ละร้าน Shopee เรียก Chat API (sellerchat) ได้จริง — ยิง get_conversation_list
// ด้วย key ของ app ที่ร้านผูกอยู่ (metadata.shopee_app) และ token ในตาราง marketplace_accounts
//
// Usage: node scripts/check-shopee-chat-shops.mjs [--company <company_id>] [--include-inactive]
// --company ยังใช้กรองร้านเหมือนเดิม และ **ทำให้ script อ่าน app ของบริษัทนั้นจากตาราง
//           marketplace_app_credentials** (ตกไป env เมื่อไม่มีแถว) — app แบบ seller
//           เป็นของบริษัท ไม่มีใบเดียวทั้งระบบอีกแล้ว
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
  .select('id, shop_id, shop_name, access_token, access_token_expires_at, chat_access_token, metadata, is_active, company_id')
  .eq('platform', 'shopee').order('shop_name');
if (!hasFlag('--include-inactive')) q = q.eq('is_active', true);
const company = argValue('--company');
if (company) q = q.eq('company_id', company);
const { data: shops, error } = await q;
if (error) { console.error('DB error:', error.message); process.exit(1); }

// app แบบ seller ของแต่ละบริษัท — โหลดทีเดียวแล้ว map ตาม company_id ของร้าน
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
      source: 'db',
    });
  }
}

let failed = 0;
for (const s of shops || []) {
  const app = s.metadata?.shopee_app === 'seller' ? 'seller' : 'partner';
  // app ของบริษัทมาก่อน env เสมอ (env = ทางถอยของบริษัทที่ยังไม่ได้ย้ายเข้าตาราง)
  const creds = app === 'seller' ? (sellerApps.get(s.company_id) || appCreds('seller')) : appCreds('partner');
  const { partnerId, key, host } = creds;
  // ร้านที่ผ่าน OAuth ขาแชทแล้วมี token ชุดที่ 2 — ใช้ใบนั้น ไม่งั้นตกไปใช้ชุดหลักเหมือนเดิม
  const token = s.chat_access_token || s.access_token;
  const apiPath = '/api/v2/sellerchat/get_conversation_list';
  const ts = Math.floor(Date.now() / 1000);
  const sign = crypto.createHmac('sha256', key).update(`${partnerId}${apiPath}${ts}${token}${s.shop_id}`).digest('hex');
  const url = `${host}${apiPath}?partner_id=${partnerId}&timestamp=${ts}&sign=${sign}&access_token=${token}&shop_id=${s.shop_id}&direction=latest&type=all&page_size=5`;
  let line = `${String(s.shop_id).padEnd(11)} ${(s.shop_name || '').padEnd(26)} app=${app.padEnd(7)} token=${s.chat_access_token ? 'chat ' : 'main '}`;
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
