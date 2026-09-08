#!/usr/bin/env node
// ตรวจว่าร้าน TikTok ส่งข้อความการตลาด (Customer Engagement API) ได้จริงหรือยัง
//
//   node scripts/check-tiktok-engagement.mjs
//
// อ่านอย่างเดียว ไม่ส่งข้อความและไม่แก้อะไรใน DB
//
// มี 2 ด่านที่ต้องผ่าน และสคริปต์นี้บอกว่าติดด่านไหน:
//   1. **app** ต้องมี scope Customer Engagement ใน Partner Center แล้ว re-authorize ร้าน
//      → ไม่มี = ทุก endpoint ตอบ 105005 "access scope"
//   2. **ร้าน** ต้องได้สิทธิ์ฟีเจอร์จาก TikTok: FUNDAMENTAL (ตั้งต้น) + CUSTOM_MSG (เขียนเอง)
//
// ผ่านครบทั้งสองด่านแล้วค่อยเปลี่ยน status ของ tiktok ใน lib/broadcast/platforms.ts
// เป็น 'ready' — **ห้ามเปลี่ยนก่อน** ไม่งั้นผู้ใช้กดส่งแล้วเจอ error ดิบของ TikTok

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }),
);

const HOST = 'https://open-api.tiktokglobalshop.com';
const APP_KEY = env.TIKTOK_SHOP_APP_KEY;
const APP_SECRET = env.TIKTOK_SHOP_APP_SECRET;
if (!APP_KEY || !APP_SECRET) {
  console.error('ไม่พบ TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET ใน .env.local');
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

function sign(path, params) {
  const p = { ...params };
  delete p.sign; delete p.access_token;
  const s = path + Object.keys(p).sort().map(k => `${k}${p[k]}`).join('');
  return crypto.createHmac('sha256', APP_SECRET).update(APP_SECRET + s + APP_SECRET).digest('hex');
}

async function get(creds, path) {
  const params = { app_key: APP_KEY, timestamp: String(Math.floor(Date.now() / 1000)) };
  if (creds.shop_cipher) params.shop_cipher = creds.shop_cipher;
  params.sign = sign(path, params);
  const res = await fetch(`${HOST}${path}?${new URLSearchParams(params)}`, {
    headers: { 'Content-Type': 'application/json', 'x-tts-access-token': creds.access_token },
  });
  return { http: res.status, json: await res.json().catch(() => null) };
}

const { data: accounts, error } = await sb
  .from('marketplace_accounts')
  .select('id, company_id, shop_name, access_token, metadata')
  .eq('platform', 'tiktok')
  .eq('is_active', true);
if (error) { console.error('อ่าน marketplace_accounts ไม่ได้:', error.message); process.exit(1); }
if (!accounts?.length) { console.log('ไม่มีร้าน TikTok ที่เปิดใช้งานอยู่'); process.exit(0); }

const since = new Date(Date.now() - 365 * 86_400_000).toISOString();
let allReady = true;

for (const a of accounts) {
  console.log(`\n═══ ${a.shop_name} ═══`);

  const { count: buyers } = await sb
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('marketplace_account_id', a.id)
    .gte('created_at', since)
    .not('external_data->>buyer_email', 'is', null);
  console.log(`ออเดอร์ที่ทักได้ (365 วัน): ${buyers ?? 0} ใบ`);

  const r = await get({ access_token: a.access_token, shop_cipher: a.metadata?.shop_cipher || '' },
    '/customer_engagement/202502/permissions');

  if (r.json?.code === 105005 || /access scope/i.test(r.json?.message || '')) {
    allReady = false;
    console.log('❌ ด่าน 1 (app): ยังไม่มี scope Customer Engagement');
    console.log('   → Partner Center > App > API scope เพิ่มกลุ่ม Customer Engagement');
    console.log('   → แล้ว **re-authorize ร้านใหม่** (token เดิมไม่พก scope ใหม่มาให้)');
    continue;
  }
  if (r.json?.code !== 0) {
    allReady = false;
    console.log(`❌ ถามสิทธิ์ไม่สำเร็จ: http=${r.http} code=${r.json?.code} ${r.json?.message || ''}`);
    continue;
  }

  console.log('✅ ด่าน 1 (app): มี scope แล้ว');
  const features = r.json.data?.features || [];
  const on = n => features.some(f => f.name === n && f.is_authorized);
  const fundamental = on('FUNDAMENTAL');
  const customMsg = on('CUSTOM_MSG');

  console.log(`${fundamental ? '✅' : '❌'} ด่าน 2 (ร้าน) FUNDAMENTAL — ใช้ API กลุ่มนี้ได้`);
  console.log(`${customMsg ? '✅' : '❌'} ด่าน 2 (ร้าน) CUSTOM_MSG — เขียนข้อความเองได้`);
  if (features.length) console.log('   ฟีเจอร์ทั้งหมด:', features.map(f => `${f.name}=${f.is_authorized}`).join(' · '));
  if (!fundamental || !customMsg) {
    allReady = false;
    if (fundamental && !customMsg) {
      console.log('   → ส่งได้เฉพาะข้อความสำเร็จรูปของ TikTok (message_templates) ยังเขียนเองไม่ได้');
    }
  }
}

console.log(allReady
  ? '\n🎉 ผ่านครบทุกร้าน — เปลี่ยน status ของ tiktok ใน lib/broadcast/platforms.ts เป็น \'ready\' ได้'
  : '\n⏳ ยังไม่พร้อม — คง status เป็น \'possible\' ไว้ก่อน');
