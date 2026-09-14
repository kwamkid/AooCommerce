#!/usr/bin/env node
// เทียบ "ยอดบนร้าน Lazada" กับ "ยอดที่ระบบจะส่งขึ้นไป" ก่อนเปิด Sync Stock อัตโนมัติ — อ่านอย่างเดียว
//
// ทำไมต้องมี: เปิดสวิตช์แล้วครั้งถัดไปที่สต็อกขยับ ระบบจะส่งยอดของเราไป **ทับ** ยอดบนร้านทันที
// สคริปต์นี้บอกล่วงหน้าว่าตัวไหนจะขึ้น ตัวไหนจะลง และตัวไหนจะกลายเป็น 0 (ของหมดบนร้าน)
//
// ยอดที่จะส่ง = quantity − reserved ของคลังที่ร้านนั้นเลือกไว้ (ไม่ได้เลือก = คลังหลัก) · ติดลบปัดเป็น 0
// ยอดบนร้าน  = `sku.quantity` จาก /products/get (ตัวเดียวกับที่ SellableQuantity เขียนทับ)
//
// Usage: node scripts/check-lazada-stock-diff.mjs [--account <marketplace_account_id>]
// อ่าน .env.local: NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SECRET_KEY · LAZADA_SHOP_APP_KEY · LAZADA_SHOP_APP_SECRET
// ไม่แก้อะไรทั้งฝั่ง Lazada และ DB · ไม่พิมพ์ token/key ออกจอ

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    // .trim() สำคัญ — ค่าที่มีช่องว่างท้ายบรรทัดจะทำให้ลายเซ็นเพี้ยนทั้งดวง
    // (เจอจริง: LAZADA_SHOP_APP_SECRET มีช่องว่างต่อท้าย → IncompleteSignature)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/\s+#.*$/, '').replace(/^["']|["']$/g, '').trim();
  }
}

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const REGION_HOSTS = {
  th: 'https://api.lazada.co.th/rest',
  sg: 'https://api.lazada.sg/rest',
  my: 'https://api.lazada.com.my/rest',
  ph: 'https://api.lazada.com.ph/rest',
  vn: 'https://api.lazada.vn/rest',
  id: 'https://api.lazada.co.id/rest',
};

const APP_KEY = process.env.LAZADA_SHOP_APP_KEY || '';
const APP_SECRET = process.env.LAZADA_SHOP_APP_SECRET || '';
if (!APP_KEY || !APP_SECRET) {
  console.error('ไม่พบ LAZADA_SHOP_APP_KEY / LAZADA_SHOP_APP_SECRET ใน .env.local');
  process.exit(1);
}

/** ลายเซ็นแบบ TOP: เรียง key → ต่อ path+kv → HMAC-SHA256 → hex ตัวใหญ่ */
function sign(apiPath, params) {
  const entries = Object.entries(params)
    .filter(([k, v]) => k !== 'sign' && v !== undefined && v !== null && v !== '')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let payload = apiPath;
  for (const [k, v] of entries) payload += k + v;
  return crypto.createHmac('sha256', APP_SECRET).update(payload).digest('hex').toUpperCase();
}

async function lazadaGet(account, apiPath, params = {}) {
  const common = {
    app_key: APP_KEY,
    timestamp: String(Date.now()),
    sign_method: 'sha256',
    access_token: account.access_token,
  };
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) common[k] = String(v);
  common.sign = sign(apiPath, common);
  const host = REGION_HOSTS[(account.metadata?.country || 'th').toLowerCase()] || REGION_HOSTS.th;
  const res = await fetch(`${host}${apiPath}?${new URLSearchParams(common).toString()}`);
  const body = await res.json();
  if (body.code && body.code !== '0') throw new Error(`${body.code}: ${body.message || ''}`);
  return body.data ?? body;
}

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY);

let aq = supabase.from('marketplace_accounts')
  .select('id, shop_name, access_token, metadata, company_id, warehouse_id, auto_sync_stock')
  .eq('platform', 'lazada').eq('is_active', true).order('shop_name');
const only = argValue('--account');
if (only) aq = aq.eq('id', only);
const { data: accounts, error: accErr } = await aq;
if (accErr) { console.error('DB error:', accErr.message); process.exit(1); }

for (const account of accounts || []) {
  // คลังที่ร้านนี้ตัด/ส่งสต็อก — ไม่ได้เลือก = คลังหลักของบริษัท
  let warehouseId = account.warehouse_id;
  if (!warehouseId) {
    const { data: wh } = await supabase.from('warehouses')
      .select('id').eq('company_id', account.company_id).eq('is_default', true).limit(1).maybeSingle();
    warehouseId = wh?.id || null;
  }

  const { data: links } = await supabase.from('marketplace_product_links')
    .select('external_item_id, external_model_id, variation_id, product_variations(sku, variation_label, products(name))')
    .eq('account_id', account.id).eq('sync_enabled', true).not('variation_id', 'is', null);

  const bySku = new Map();
  for (const l of links || []) {
    const key = String(l.external_model_id || '').trim();
    if (key && key !== '0') bySku.set(key, l);
  }

  const variationIds = [...new Set((links || []).map(l => l.variation_id))];
  const invByVariation = new Map();
  if (warehouseId && variationIds.length) {
    const { data: inv } = await supabase.from('inventory')
      .select('variation_id, quantity, reserved_quantity')
      .eq('warehouse_id', warehouseId).in('variation_id', variationIds);
    for (const row of inv || []) invByVariation.set(row.variation_id, row);
  }

  console.log(`\n=== ${account.shop_name} · Sync Stock อัตโนมัติ: ${account.auto_sync_stock ? 'เปิด' : 'ปิด'} · ผูกไว้ ${bySku.size} SKU ===`);
  if (bySku.size === 0) { console.log('ไม่มีสินค้าที่ผูกไว้'); continue; }

  // เดินสินค้าทั้งร้าน แล้วจับคู่ด้วย SkuId
  const onShop = new Map();
  for (let offset = 0; offset <= 10000; offset += 50) {
    let page;
    try {
      page = await lazadaGet(account, '/products/get', { filter: 'all', offset, limit: 50 });
    } catch (e) { console.log(`อ่านสินค้าไม่สำเร็จ (offset ${offset}): ${e.message}`); break; }
    const products = page?.products || [];
    for (const product of products) {
      for (const sku of product.skus || []) {
        const id = String(sku.SkuId);
        if (bySku.has(id)) onShop.set(id, Number(String(sku.quantity ?? sku.Available ?? 0).replace(/,/g, '')) || 0);
      }
    }
    if (products.length < 50) break;
  }

  const rows = [];
  for (const [skuId, link] of bySku) {
    const pv = link.product_variations || {};
    const name = `${pv.products?.name || '-'}${pv.variation_label ? ` (${pv.variation_label})` : ''}`;
    const inv = invByVariation.get(link.variation_id);
    const willPush = Math.max(0, (Number(inv?.quantity) || 0) - (Number(inv?.reserved_quantity) || 0));
    const shopQty = onShop.has(skuId) ? onShop.get(skuId) : null;
    rows.push({ name: name.slice(0, 46), shopQty, willPush, diff: shopQty === null ? null : willPush - shopQty });
  }
  rows.sort((a, b) => (a.diff ?? 0) - (b.diff ?? 0));

  console.log(`${'สินค้า'.padEnd(46)} ${'บนร้าน'.padStart(8)} ${'จะส่งไป'.padStart(9)} ${'เปลี่ยน'.padStart(9)}`);
  console.log('-'.repeat(78));
  for (const r of rows) {
    const shop = r.shopQty === null ? 'ไม่เจอ' : String(r.shopQty);
    const diff = r.diff === null ? '-' : (r.diff > 0 ? `+${r.diff}` : String(r.diff));
    const warn = r.willPush === 0 && (r.shopQty ?? 0) > 0 ? '  ⚠ จะกลายเป็นของหมดบนร้าน' : '';
    console.log(`${r.name.padEnd(46)} ${shop.padStart(8)} ${String(r.willPush).padStart(9)} ${diff.padStart(9)}${warn}`);
  }
}
