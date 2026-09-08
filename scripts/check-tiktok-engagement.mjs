#!/usr/bin/env node
// ตรวจว่าร้าน TikTok ส่งข้อความการตลาด (Customer Engagement API) ได้จริงหรือยัง
//
//   node scripts/check-tiktok-engagement.mjs
//
// อ่านอย่างเดียว ไม่ส่งข้อความและไม่แก้อะไรใน DB
//
// มี 2 ด่านที่ต้องผ่าน และสคริปต์นี้บอกว่าติดด่านไหน:
//   1. **app** ต้องมีสิทธิ์เรียก API กลุ่มนี้ → ไม่มี = ทุก endpoint ตอบ 105005 "access scope"
//      ⚠️ 8 ก.ย. 2026: Partner Center **ไม่มี scope ชื่อ Customer Engagement ให้ขอ**
//      ทั้ง app หมวด Order Management และ Customer Support — ยังหาที่มาไม่ได้
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

// ลองทั้งสอง app เพราะยังไม่รู้ว่า Customer Engagement อยู่กับใคร — Partner Center
// ไม่มี scope ชื่อนี้ให้ขอ และหมวด app มีแค่ 4 หมวดที่ไม่มีหมวดการตลาด (8 ก.ย. 2026)
// ⇒ ถ้ามันแฝงอยู่ใน seller.customer_service คำตอบจะโผล่ที่ app Chat
const APPS = [
  { name: 'app ออเดอร์ (Order Management)', key: env.TIKTOK_SHOP_APP_KEY, secret: env.TIKTOK_SHOP_APP_SECRET, tokenField: 'access_token' },
  { name: 'app แชท (Customer Support)', key: env.TIKTOK_CHAT_APP_KEY, secret: env.TIKTOK_CHAT_APP_SECRET, tokenField: 'chat_access_token' },
].filter(a => a.key && a.secret);

if (APPS.length === 0) {
  console.error('ไม่พบ TIKTOK_SHOP_APP_KEY / TIKTOK_SHOP_APP_SECRET ใน .env.local');
  process.exit(1);
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY);

function sign(app, path, params) {
  const p = { ...params };
  delete p.sign; delete p.access_token;
  const s = path + Object.keys(p).sort().map(k => `${k}${p[k]}`).join('');
  return crypto.createHmac('sha256', app.secret).update(app.secret + s + app.secret).digest('hex');
}

async function get(app, creds, path) {
  const params = { app_key: app.key, timestamp: String(Math.floor(Date.now() / 1000)) };
  if (creds.shop_cipher) params.shop_cipher = creds.shop_cipher;
  params.sign = sign(app, path, params);
  const res = await fetch(`${HOST}${path}?${new URLSearchParams(params)}`, {
    headers: { 'Content-Type': 'application/json', 'x-tts-access-token': creds.access_token },
  });
  return { http: res.status, json: await res.json().catch(() => null) };
}

const { data: accounts, error } = await sb
  .from('marketplace_accounts')
  .select('id, company_id, shop_name, access_token, chat_access_token, metadata')
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

  // ลองทีละ app จนกว่าจะมีตัวไหนตอบสำเร็จ
  let ok = null;
  for (const app of APPS) {
    const token = a[app.tokenField];
    if (!token) { console.log(`— ${app.name}: ร้านนี้ยังไม่มี token ของ app นี้`); continue; }
    const r = await get(app, { access_token: token, shop_cipher: a.metadata?.shop_cipher || '' },
      '/customer_engagement/202502/permissions');
    if (r.json?.code === 0) { console.log(`✅ ด่าน 1 — ${app.name}: เรียกได้!`); ok = r; break; }
    if (r.json?.code === 105005 || /access scope/i.test(r.json?.message || '')) {
      console.log(`❌ ด่าน 1 — ${app.name}: ไม่มีสิทธิ์ (105005)`);
    } else {
      console.log(`❌ ด่าน 1 — ${app.name}: http=${r.http} code=${r.json?.code} ${(r.json?.message || '').slice(0, 120)}`);
    }
  }

  if (!ok) {
    allReady = false;
    console.log('   หมายเหตุ (สำรวจ Partner Center จริง 8 ก.ย. 2026): **ไม่มี scope ชื่อ Customer');
    console.log('   Engagement ให้ขอ** และหมวดของ app มีแค่ 4 หมวด (Customer Service ·');
    console.log('   eCommerce Management · Finance · Shipping & Fulfillment) ไม่มีหมวดการตลาด');
    console.log('   → ความเป็นไปได้เดียวที่เหลือ: แฝงอยู่ใน seller.customer_service ของ app แชท');
    console.log('     ซึ่งยัง Under review — ผ่านแล้วต้องต่อ chat token ของร้านก่อนแล้วรันสคริปต์นี้ใหม่');
    continue;
  }

  const features = ok.json.data?.features || [];
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
