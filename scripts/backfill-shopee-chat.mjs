#!/usr/bin/env node
// ตามเก็บแชท Shopee ของเก่าให้เท่ากับของใหม่ — ดึงข้อความที่ push ไม่ได้ส่งมา
// (ร้านตอบจากแอป Shopee / ตอบอัตโนมัตินอกเวลา / ข้อความย่อยของ bundle_message)
// แล้วเติมเนื้อการ์ดสินค้า-ออเดอร์ให้แถวเก่าที่ยังมีแต่ id
//
// ตัวงานจริงอยู่ที่ POST /api/shopee/chat/backfill (โค้ด TypeScript ตัวเดียวกับที่ระบบใช้)
// สคริปต์นี้เป็นแค่ตัวยิง — จะได้ไม่ต้องเขียน logic ซ้ำเป็นภาษา JS อีกชุด
//
// Usage:
//   node scripts/backfill-shopee-chat.mjs [--days 7] [--limit 200] [--company <uuid>]
//                                         [--url https://aoocommerce.vercel.app]
// อ่าน .env.local: CRON_SECRET (+ NEXT_PUBLIC_APP_URL ถ้าไม่ส่ง --url)

import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '');
  }
}

function argValue(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const baseUrl = (argValue('--url') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error('ไม่พบ CRON_SECRET ใน .env.local — ตั้งค่าก่อนแล้วรันใหม่');
  process.exit(1);
}

const payload = {
  days: Number(argValue('--days', 7)),
  limit: Number(argValue('--limit', 200)),
};
const company = argValue('--company');
if (company) payload.company_id = company;

console.log(`ยิง ${baseUrl}/api/shopee/chat/backfill`, payload);

// รอบเดียวอาจไม่จบ (route หยุดเองก่อนหมดเวลาแล้วบอก remaining) — ยิงต่อจนกว่าจะหมด
let round = 0;
const total = { contacts_processed: 0, messages_inserted: 0, bundles_removed: 0, items_enriched: 0, orders_enriched: 0 };

while (round < 20) {
  round++;
  const res = await fetch(`${baseUrl}/api/shopee/chat/backfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch {
    console.error(`รอบ ${round}: ตอบกลับไม่ใช่ JSON (HTTP ${res.status})`, text.slice(0, 300));
    process.exit(1);
  }
  if (!res.ok || data.error) {
    console.error(`รอบ ${round}: ล้มเหลว (HTTP ${res.status})`, data.error || text.slice(0, 300));
    process.exit(1);
  }

  for (const k of Object.keys(total)) total[k] += data[k] || 0;
  console.log(
    `รอบ ${round}: ห้องสนทนา ${data.contacts_processed}/${data.contacts_total}` +
    ` · ข้อความใหม่ ${data.messages_inserted}` +
    ` · ลบฟองรวม ${data.bundles_removed}` +
    ` · การ์ดสินค้า ${data.items_enriched} · การ์ดออเดอร์ ${data.orders_enriched}` +
    ` · ${Math.round((data.duration_ms || 0) / 1000)}s` +
    (data.remaining ? ` · เหลืออีก ${data.remaining}` : '')
  );

  // cursor อยู่ที่ผู้เรียก — ไม่ส่งต่อ รอบถัดไปจะวนทำห้องเดิมซ้ำไปเรื่อย ๆ
  if (!data.next_before) break;
  payload.before = data.next_before;
}

console.log('\nรวมทั้งหมด:', total);
