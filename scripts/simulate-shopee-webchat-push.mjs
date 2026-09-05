#!/usr/bin/env node
// ยิง push แชท Shopee (code 10 = webchat) จำลองเข้า webhook ของเรา — ทดสอบสายแชทฝั่งเราครบเส้น
// (webhook รับ + ตรวจลายเซ็น → สร้างผู้ติดต่อ → บันทึกข้อความ → ขึ้นหน้าแชท → แจ้งเตือนมือถือ)
// โดยไม่ต้องรอผู้ซื้อจริง · ใช้ตอน Shopee sandbox ไม่มีฝั่งผู้ซื้อให้ทัก (เจอจริง 5 ก.ย. 2026)
// หรือเวลาแก้โค้ดแชทแล้วอยากพิสูจน์ว่าไม่พัง
//
// Usage:
//   node scripts/simulate-shopee-webchat-push.mjs --shop 227886408 [--app seller|partner]
//        [--text "ข้อความ"] [--buyer 900000001] [--name "ผู้ซื้อทดสอบ"] [--url https://.../api/shopee/webhook]
//
// --app เลือกคู่ key ที่ใช้เซ็น (ร้านที่ผูกกับ app ไหนต้องเซ็นด้วย key ของ app นั้น ไม่งั้น webhook ตีตก)
// ⚠️ สร้างผู้ติดต่อปลอมในบริษัทที่ร้านนั้นสังกัด — ทดสอบเสร็จลบ shopee_contacts/shopee_messages ของ
//    conversation_id ที่พิมพ์ออกมาทิ้งด้วย · ห้ามกดตอบในแชทนั้น (Shopee ไม่รู้จัก conversation นี้)

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    // ตัดคอมเมนต์ท้ายบรรทัด (dotenv ของ Next ทำให้ แต่ตัวโหลดจิ๋วนี้ต้องทำเอง)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const app = argValue('--app', 'seller') === 'partner' ? 'partner' : 'seller';
const key = app === 'seller' ? process.env.SHOPEE_SELLER_APP_KEY : process.env.SHOPEE_PARTNER_APP_KEY;
const shopId = Number(argValue('--shop'));
if (!key || !shopId) {
  console.error('ต้องมี --shop <shop_id> และ key ของ app ใน .env.local (SHOPEE_SELLER_APP_KEY / SHOPEE_PARTNER_APP_KEY)');
  process.exit(1);
}

const url = argValue('--url', 'https://aoocommerce.vercel.app/api/shopee/webhook');
const now = Math.floor(Date.now() / 1000);
const conversationId = argValue('--conversation', '9000000000000000001');
const payload = {
  shop_id: shopId,
  code: 10,
  timestamp: now,
  data: {
    type: 'message',
    region: 'TH',
    content: {
      message_id: `aoo-test-${now}`,
      conversation_id: conversationId,
      from_id: Number(argValue('--buyer', '900000001')),
      to_id: shopId,
      from_user_name: argValue('--name', 'ผู้ซื้อทดสอบ (simulated)'),
      message_type: 'text',
      content: { text: argValue('--text', '[ทดสอบระบบ] สวัสดีค่ะ สนใจสินค้าตัวนี้ยังมีของไหมคะ') },
      created_timestamp: now,
      business_type: 0,
      message_option: 0,
    },
  },
};

const body = JSON.stringify(payload);
// ลายเซ็นแบบเดียวกับ Shopee: HMAC-SHA256(partner_key, `${url}|${body}`) hex → header Authorization
const sig = crypto.createHmac('sha256', key).update(`${url}|${body}`).digest('hex');
const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: sig }, body });
console.log(`webhook → HTTP ${res.status} · app=${app} shop=${shopId} conversation_id=${conversationId} message_id=${payload.data.content.message_id}`);
console.log('เช็คผล: marketplace_webhook_log (signature_valid/processing_status) · shopee_contacts where conversation_id=... · หน้าแชท');
